import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibrarySearch } from './components/LibrarySearch';
import type { UnifiedTrack } from './types/provider';
import type { YouTubeSearchResult } from './services/youtube/search';
import { clearYouTubeLocalData, searchResultToUnifiedTrack } from './services/youtube/search';
import { getYouTubeProvider, type TransitionHandoffProfile } from './services/providers/youtube';
import { useProvider } from './hooks/useProvider';
import {
  analyzeTrackWithHeuristicV1,
  buildEvaluationProgressReport,
  clearBenchmarkSeedTrackIds,
  clearTransitionData,
  computeMeanTransitionScore,
  findTransitionCandidates,
  getAnalysisState,
  getBaselineRunHistory,
  getBenchmarkSeedTrackIds,
  getTransitionRelevanceMap,
  recordTransitionRuntimeEvent,
  setTransitionRelevanceMap,
  setBenchmarkSeedTrackIds,
  type AnalysisState,
  type BaselineEvaluationResult,
  type BaselineRunArtifact,
  type BaselineTuningAction,
  type EvaluationProgressReport,
  type TransitionRelevanceMap,
  runBaselineEvaluation,
  type TransitionCandidate,
} from './services/transition';

const ONE_TIME_DATA_RESET_KEY = 'moodverter_data_reset_20260209';
type BaselineScope = 'selected' | 'all' | 'benchmark';
const REQUIRED_RELEVANT_TARGETS_PER_SEED = 2;
const TARGET_BENCHMARK_SEED_COUNT = 10;
const BENCHMARK_SCOPE_ID = 'benchmark-v1';
const AUTO_TRANSITION_BASE_LEAD_MS = 900;
const AUTO_TRANSITION_MIN_LEAD_MS = 900;
const AUTO_TRANSITION_MAX_LEAD_MS = 2200;
const AUTO_TRANSITION_WARMUP_WINDOW_MS = 2600;
const AUTO_TRANSITION_HANDOFF_PRIME_MS = 360;
const AUTO_TRANSITION_POST_SWITCH_COOLDOWN_MS = 12_000;
const AUTO_TRANSITION_REVERSE_PAIR_GUARD_MS = 90_000;
const AUTO_TRANSITION_PREVIEW_SUPPRESS_MS = 7_000;
const AUTO_TRANSITION_MISS_WINDOW_MS = 15_000;
const AUTO_LABEL_RETRY_DELAY_MS = 45_000;
const AUTO_LABEL_RETRY_DELAY_URGENT_MS = 10_000;
const TRANSITION_STALL_THRESHOLD_MS = 1_800;

function formatTime(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function formatOptionalPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return formatPercent(value);
}

function formatOptionalMs(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'N/A';
  return `${Math.round(value)}ms`;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function computeAdaptiveTransitionLeadMs(previousLeadMs: number, transitionLatencyMs: number): number {
  const boundedPrevious = clampNumber(
    previousLeadMs,
    AUTO_TRANSITION_MIN_LEAD_MS,
    AUTO_TRANSITION_MAX_LEAD_MS
  );
  const boundedLatency = clampNumber(transitionLatencyMs, 0, 2600);
  const targetLead = clampNumber(
    AUTO_TRANSITION_BASE_LEAD_MS + boundedLatency * 0.7,
    AUTO_TRANSITION_MIN_LEAD_MS,
    AUTO_TRANSITION_MAX_LEAD_MS
  );
  return Math.round(boundedPrevious * 0.65 + targetLead * 0.35);
}

function clampTimeToTrackDuration(timeMs: number, trackDurationMs?: number): number {
  if (!Number.isFinite(timeMs) || timeMs < 0) return 0;
  if (!trackDurationMs || trackDurationMs <= 0) return Math.round(timeMs);
  const maxSafeTime = Math.max(0, trackDurationMs - 1000);
  return Math.min(Math.round(timeMs), maxSafeTime);
}

function formatAnalysisStatusLabel(status: 'pending' | 'ready' | 'failed' | 'missing'): string {
  if (status === 'ready') return 'hazir';
  if (status === 'pending') return 'bekliyor';
  if (status === 'failed') return 'hatali';
  return 'yok';
}

function formatTrackNames(trackIds: string[], trackMap: Map<string, UnifiedTrack>, limit = 6): string {
  if (trackIds.length === 0) return '-';
  const names = trackIds
    .map((trackId) => trackMap.get(trackId)?.name ?? trackId)
    .filter((name, index, arr) => arr.indexOf(name) === index);
  const visibleNames = names.slice(0, limit);
  const hiddenCount = Math.max(0, names.length - visibleNames.length);
  return hiddenCount > 0
    ? `${visibleNames.join(', ')} (+${hiddenCount})`
    : visibleNames.join(', ');
}

function formatTuningIssue(issue: BaselineTuningAction['issue']): string {
  if (issue === 'event') return 'event';
  if (issue === 'embedding') return 'embedding';
  if (issue === 'rhythm') return 'rhythm';
  if (issue === 'loudness') return 'loudness';
  return 'penalty';
}

function formatGateLabel(passed: boolean): string {
  return passed ? 'PASS' : 'FAIL';
}

function computeAverage(values: number[]): number {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return 0;
  return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

function buildHandoffProfileFromBenchmarkResult(
  result: BaselineEvaluationResult,
  currentProfile: TransitionHandoffProfile
): TransitionHandoffProfile {
  if (result.bottomSeeds.length === 0) return currentProfile;

  const averageLoudnessContinuity = computeAverage(
    result.bottomSeeds.map((seed) => seed.averageLoudnessContinuityScore)
  );
  const averageRhythmAlignment = computeAverage(
    result.bottomSeeds.map((seed) => seed.averageRhythmAlignmentScore)
  );
  const averageArtifactPenalty = computeAverage(
    result.bottomSeeds.map((seed) => seed.averageArtifactPenalty)
  );

  const loudnessDeficit = clampNumber(1 - averageLoudnessContinuity, 0, 1);
  const rhythmDeficit = clampNumber(1 - averageRhythmAlignment, 0, 1);
  const penaltyPressure = clampNumber(averageArtifactPenalty, 0, 1);

  const targetDuckPercent = Math.round(clampNumber(
    8 + loudnessDeficit * 7 + penaltyPressure * 5,
    6,
    24
  ));
  const targetRampMs = Math.round(clampNumber(
    180 + rhythmDeficit * 230 + loudnessDeficit * 160,
    100,
    900
  ));
  const targetHoldMs = Math.round(clampNumber(
    260 + penaltyPressure * 380 + loudnessDeficit * 180,
    120,
    1500
  ));

  return {
    duckPercent: Math.round(currentProfile.duckPercent * 0.35 + targetDuckPercent * 0.65),
    rampMs: Math.round(currentProfile.rampMs * 0.35 + targetRampMs * 0.65),
    holdMs: Math.round(currentProfile.holdMs * 0.35 + targetHoldMs * 0.65),
  };
}

interface BenchmarkSeedSelectionInput {
  existingSeedTrackIds: string[];
  sortedLibrary: UnifiedTrack[];
  analysisStates: Record<string, AnalysisState>;
  relevanceMap: TransitionRelevanceMap;
  requiredRelevantTargetsPerSeed: number;
  targetSeedCount: number;
}

interface AutoTransitionSnapshot {
  sourceTrackId: string;
  targetTrackId: string;
  atMs: number;
}

function buildBenchmarkSeedSelection(input: BenchmarkSeedSelectionInput): string[] {
  const eligibleTrackIds = input.sortedLibrary
    .map((track) => track.id)
    .filter((trackId) =>
      input.analysisStates[trackId]?.status === 'ready'
      && (input.relevanceMap[trackId] ?? []).length >= input.requiredRelevantTargetsPerSeed
    );
  const eligibleSet = new Set(eligibleTrackIds);
  const prioritizedExisting = input.existingSeedTrackIds
    .map((trackId) => trackId.trim())
    .filter((trackId) => trackId.length > 0 && eligibleSet.has(trackId));
  const merged = [
    ...prioritizedExisting,
    ...eligibleTrackIds.filter((trackId) => !prioritizedExisting.includes(trackId)),
  ];
  return merged.slice(0, input.targetSeedCount);
}

function App() {
  const {
    provider,
    isLoading,
    error: providerError,
    playbackState,
    play,
    pause,
    skip,
    previous,
    seek,
  } = useProvider();

  const [library, setLibrary] = useState<UnifiedTrack[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const [analysisStates, setAnalysisStates] = useState<Record<string, AnalysisState>>({});
  const [seedTrackId, setSeedTrackId] = useState<string | null>(null);
  const [transitionCandidates, setTransitionCandidates] = useState<TransitionCandidate[]>([]);
  const [isTransitionLoading, setIsTransitionLoading] = useState(false);
  const [isAutoLabeling, setIsAutoLabeling] = useState(false);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pinnedSourceTimeMs, setPinnedSourceTimeMs] = useState<number | null>(null);
  const [sourceSliderTimeMs, setSourceSliderTimeMs] = useState(0);
  const [showTransitionPanel, setShowTransitionPanel] = useState(false);
  const [isBaselineLoading, setIsBaselineLoading] = useState(false);
  const [baselineResult, setBaselineResult] = useState<BaselineEvaluationResult | null>(null);
  const [baselineHistory, setBaselineHistory] = useState<BaselineRunArtifact[]>([]);
  const [baselineScope, setBaselineScope] = useState<BaselineScope>('selected');
  const [benchmarkSeedTrackIds, setBenchmarkSeedTrackIdsState] = useState<string[]>([]);
  const [relevanceMap, setRelevanceMap] = useState<TransitionRelevanceMap>({});
  const [autoTransitionLeadMs, setAutoTransitionLeadMs] = useState<number>(AUTO_TRANSITION_BASE_LEAD_MS);
  const [lastAutoTransitionLatencyMs, setLastAutoTransitionLatencyMs] = useState<number | null>(null);
  const [handoffProfile, setHandoffProfile] = useState<TransitionHandoffProfile>(() =>
    getYouTubeProvider().getTransitionHandoffProfile()
  );
  const autoLabelRetryAfterRef = useRef<Map<string, number>>(new Map());
  const autoTransitionedSourceTrackIdRef = useRef<string | null>(null);
  const autoTransitionCooldownUntilRef = useRef<number>(0);
  const lastAutoTransitionRef = useRef<AutoTransitionSnapshot | null>(null);
  const isPreviewingRef = useRef(false);
  const warmedTransitionCandidateKeyRef = useRef<string | null>(null);
  const handoffPrimedCandidateKeyRef = useRef<string | null>(null);
  const autoTransitionLeadMsRef = useRef<number>(AUTO_TRANSITION_BASE_LEAD_MS);
  const resetRuntimeState = useCallback((options?: { clearInput?: boolean }) => {
    setLibrary([]);
    setAnalysisStates({});
    setSeedTrackId(null);
    setTransitionCandidates([]);
    setPinnedSourceTimeMs(null);
    setSourceSliderTimeMs(0);
    setBaselineResult(null);
    setBaselineHistory([]);
    setTransitionError(null);
    setRelevanceMap({});
    setBenchmarkSeedTrackIdsState([]);
    if (options?.clearInput) {
      setUiError(null);
      setUrlInput('');
      setIsSubmittingUrl(false);
    }
  }, []);

  const refreshLibrary = useCallback(async () => {
    try {
      const activeProvider = provider ?? getYouTubeProvider();
      const tracks = await activeProvider.getLibrary();
      setLibrary(tracks);
    } catch (error) {
      console.error('Failed to refresh YouTube library:', error);
      setUiError('Kutuphane yuklenemedi.');
    }
  }, [provider]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    setRelevanceMap(getTransitionRelevanceMap());
    setBaselineHistory(getBaselineRunHistory(5));
    setBenchmarkSeedTrackIdsState(getBenchmarkSeedTrackIds());
  }, []);

  useEffect(() => {
    const activeProvider = provider ?? getYouTubeProvider();
    setHandoffProfile(activeProvider.getTransitionHandoffProfile());
  }, [provider]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(ONE_TIME_DATA_RESET_KEY) === '1') return;

    clearYouTubeLocalData();
    clearTransitionData();
    clearBenchmarkSeedTrackIds();
    window.localStorage.setItem(ONE_TIME_DATA_RESET_KEY, '1');

    resetRuntimeState();
    void refreshLibrary();
  }, [refreshLibrary, resetRuntimeState]);

  const refreshAnalysisStates = useCallback(() => {
    const nextStates: Record<string, AnalysisState> = {};
    library.forEach((track) => {
      const state = getAnalysisState(track.id);
      if (state) {
        nextStates[track.id] = state;
      }
    });
    setAnalysisStates(nextStates);
  }, [library]);

  useEffect(() => {
    refreshAnalysisStates();
  }, [refreshAnalysisStates]);

  useEffect(() => {
    const playingTrackId = playbackState?.currentTrack?.id ?? null;
    if (playingTrackId) {
      if (playingTrackId !== seedTrackId) {
        setSeedTrackId(playingTrackId);
      }
      return;
    }

    if (seedTrackId && library.some((track) => track.id === seedTrackId)) {
      return;
    }

    if (library[0]?.id) {
      setSeedTrackId(library[0].id);
    }
  }, [library, playbackState?.currentTrack?.id, seedTrackId]);

  const refreshTransitionCandidates = useCallback(async () => {
    if (!seedTrackId) {
      setTransitionCandidates([]);
      setTransitionError(null);
      return;
    }

    setIsTransitionLoading(true);
    setTransitionError(null);
    try {
      const candidates = await findTransitionCandidates({
        trackId: seedTrackId,
        sourceTimeMs: pinnedSourceTimeMs ?? undefined,
        limit: 5,
      });
      setTransitionCandidates(candidates);
      if (candidates.length === 0) {
        setTransitionError('Bu seed icin aday bulunamadi. Once daha fazla sarki ekleyip analiz et.');
      }
    } catch (error) {
      console.error('Failed to find transition candidates:', error);
      setTransitionCandidates([]);
      setTransitionError('Transition adaylari yuklenemedi.');
    } finally {
      setIsTransitionLoading(false);
    }
  }, [pinnedSourceTimeMs, seedTrackId]);

  useEffect(() => {
    if (!showTransitionPanel) return;
    void refreshTransitionCandidates();
  }, [refreshTransitionCandidates, showTransitionPanel]);

  useEffect(() => {
    if (!seedTrackId) return;
    void refreshTransitionCandidates();
  }, [refreshTransitionCandidates, seedTrackId]);

  useEffect(() => {
    setPinnedSourceTimeMs(null);
    setSourceSliderTimeMs(0);
  }, [seedTrackId]);

  useEffect(() => {
    if (baselineScope !== 'selected') return;
    setBaselineResult(null);
  }, [baselineScope, seedTrackId]);

  const handlePlayPause = useCallback(async () => {
    if (playbackState?.isPlaying) {
      await pause();
      return;
    }

    const fallbackTrackId = playbackState?.currentTrack?.id ?? seedTrackId ?? library[0]?.id;
    if (fallbackTrackId) {
      await play(fallbackTrackId);
      return;
    }

    setUiError('Calmak icin once kutuphaneye bir sarki ekle.');
  }, [library, pause, play, playbackState?.currentTrack?.id, playbackState?.isPlaying, seedTrackId]);

  const handleSelectSearchResult = useCallback(async (track: YouTubeSearchResult) => {
    setUiError(null);
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.addTrackToLibrary(searchResultToUnifiedTrack(track));
      await play(track.videoId);
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to play selected YouTube track:', error);
      setUiError('Secilen sarki calinamadi.');
    }
  }, [play, refreshLibrary]);

  const handleAddSearchResultToLibrary = useCallback(async (track: YouTubeSearchResult) => {
    setUiError(null);
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.addTrackToLibrary(searchResultToUnifiedTrack(track));
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to add YouTube track to library:', error);
      setUiError('Sarki kutuphaneye eklenemedi.');
    }
  }, [refreshLibrary]);

  const handleSubmitUrl = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;

    setUiError(null);
    setIsSubmittingUrl(true);
    try {
      const youtubeProvider = getYouTubeProvider();
      const addedTrack = await youtubeProvider.addTrackFromUrl(trimmed);
      if (!addedTrack) {
        setUiError('Gecerli bir YouTube linki gir.');
        return;
      }

      setUrlInput('');
      await refreshLibrary();
      void play(addedTrack.id).catch((error) => {
        console.error('Failed to autoplay added URL track:', error);
      });
    } catch (error) {
      console.error('Failed to add track from URL:', error);
      setUiError('YouTube linki eklenemedi.');
    } finally {
      setIsSubmittingUrl(false);
    }
  }, [play, refreshLibrary, urlInput]);

  const handlePlayFromLibrary = useCallback(async (trackId: string) => {
    setUiError(null);
    try {
      await play(trackId);
    } catch (error) {
      console.error('Failed to play library track:', error);
      setUiError('Kutuphanedeki sarki calinamadi.');
    }
  }, [play]);

  const handleRemoveFromLibrary = useCallback(async (trackId: string) => {
    setUiError(null);
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.removeTrackFromLibrary(trackId);
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to remove track from library:', error);
      setUiError('Sarki kutuphaneden kaldirilamadi.');
    }
  }, [refreshLibrary]);

  const handleAnalyzeTrack = useCallback(async (trackId: string) => {
    const track = library.find((item) => item.id === trackId);
    if (!track) return;

    setUiError(null);
    try {
      await analyzeTrackWithHeuristicV1({
        id: track.id,
        durationMs: track.durationMs,
        name: track.name,
        artist: track.artist,
      });
      refreshAnalysisStates();
      if (seedTrackId === trackId) {
        await refreshTransitionCandidates();
      }
    } catch (error) {
      console.error('Failed to analyze track:', error);
      setUiError('Sarki analizi basarisiz oldu.');
    }
  }, [library, refreshAnalysisStates, refreshTransitionCandidates, seedTrackId]);

  const handlePlayTransitionCandidate = useCallback(async (
    candidate: TransitionCandidate,
    options: { reason?: 'auto' | 'manual' } = {}
  ) => {
    const startedAtMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    setUiError(null);
    try {
      const targetTrack = library.find((track) => track.id === candidate.targetTrackId);
      const targetTimeMs = clampTimeToTrackDuration(candidate.targetTimeMs, targetTrack?.durationMs);
      const activeProvider = provider ?? getYouTubeProvider();
      try {
        await activeProvider.playTransitionTarget(candidate.targetTrackId, targetTimeMs, {
          sourceLoudnessRms: candidate.sourceLoudnessRms,
          targetLoudnessRms: candidate.targetLoudnessRms,
        });
      } catch (transitionError) {
        console.warn('playTransitionTarget failed, fallback to play+seek:', transitionError);
        await play(candidate.targetTrackId);
        await wait(450);
        await seek(targetTimeMs);
        await wait(250);
        await seek(targetTimeMs);
      }

      const finishedAtMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const observedLatencyMs = Math.max(0, Math.round(finishedAtMs - startedAtMs));
      recordTransitionRuntimeEvent({
        sourceTrackId: candidate.sourceTrackId,
        targetTrackId: candidate.targetTrackId,
        latencyMs: observedLatencyMs,
        stalled: observedLatencyMs >= TRANSITION_STALL_THRESHOLD_MS,
        dropped: false,
        mode: options.reason === 'auto' ? 'auto' : 'manual',
      });
      setLastAutoTransitionLatencyMs(observedLatencyMs);
      const nextLead = computeAdaptiveTransitionLeadMs(
        autoTransitionLeadMsRef.current,
        observedLatencyMs
      );
      autoTransitionLeadMsRef.current = nextLead;
      setAutoTransitionLeadMs(nextLead);
      if (options.reason === 'auto') {
        const nowMs = Date.now();
        autoTransitionCooldownUntilRef.current = nowMs + AUTO_TRANSITION_POST_SWITCH_COOLDOWN_MS;
        lastAutoTransitionRef.current = {
          sourceTrackId: candidate.sourceTrackId,
          targetTrackId: candidate.targetTrackId,
          atMs: nowMs,
        };
      } else {
        autoTransitionCooldownUntilRef.current = Date.now() + 5_000;
      }
      warmedTransitionCandidateKeyRef.current = null;
      handoffPrimedCandidateKeyRef.current = null;
    } catch (error) {
      const failedAtMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const failureLatencyMs = Math.max(0, Math.round(failedAtMs - startedAtMs));
      recordTransitionRuntimeEvent({
        sourceTrackId: candidate.sourceTrackId,
        targetTrackId: candidate.targetTrackId,
        latencyMs: failureLatencyMs,
        stalled: true,
        dropped: true,
        mode: options.reason === 'auto' ? 'auto' : 'manual',
      });
      console.error('Failed to play transition candidate:', error);
      setUiError('Transition adayi calinamadi.');
    }
  }, [library, play, provider, seek]);

  const handlePreviewTransitionAB = useCallback(async (candidate: TransitionCandidate) => {
    if (isPreviewingRef.current) return;
    setUiError(null);
    isPreviewingRef.current = true;
    autoTransitionCooldownUntilRef.current = Date.now() + AUTO_TRANSITION_PREVIEW_SUPPRESS_MS;
    try {
      const sourceTrack = library.find((track) => track.id === candidate.sourceTrackId);
      const targetTrack = library.find((track) => track.id === candidate.targetTrackId);
      const sourceTimeMs = clampTimeToTrackDuration(candidate.sourceTimeMs, sourceTrack?.durationMs);
      const targetTimeMs = clampTimeToTrackDuration(candidate.targetTimeMs, targetTrack?.durationMs);

      await play(candidate.sourceTrackId);
      await wait(450);
      await seek(sourceTimeMs);
      await wait(850);

      await play(candidate.targetTrackId);
      await wait(450);
      await seek(targetTimeMs);
      await wait(250);
      await seek(targetTimeMs);
    } catch (error) {
      console.error('Failed to preview A/B transition candidate:', error);
      setUiError('A/B onizleme basarisiz oldu.');
    } finally {
      isPreviewingRef.current = false;
      autoTransitionedSourceTrackIdRef.current = null;
      warmedTransitionCandidateKeyRef.current = null;
      handoffPrimedCandidateKeyRef.current = null;
    }
  }, [library, play, seek]);

  const pickAutoTransitionCandidate = useCallback((
    currentTrackId: string,
    nowMs: number
  ): TransitionCandidate | null => {
    const candidatesForSource = transitionCandidates.filter(
      (item) => item.sourceTrackId === currentTrackId
    );
    if (candidatesForSource.length === 0) return null;

    const lastAutoTransition = lastAutoTransitionRef.current;
    const reverseGuardActive = Boolean(
      lastAutoTransition && nowMs - lastAutoTransition.atMs < AUTO_TRANSITION_REVERSE_PAIR_GUARD_MS
    );
    if (!reverseGuardActive || !lastAutoTransition) {
      return candidatesForSource[0] ?? null;
    }

    const nextCandidate = candidatesForSource.find((candidate) => !(
      lastAutoTransition.sourceTrackId === candidate.targetTrackId
      && lastAutoTransition.targetTrackId === currentTrackId
    ));
    return nextCandidate ?? candidatesForSource[0] ?? null;
  }, [transitionCandidates]);

  useEffect(() => {
    warmedTransitionCandidateKeyRef.current = null;
    handoffPrimedCandidateKeyRef.current = null;
  }, [playbackState?.currentTrack?.id]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const candidate = pickAutoTransitionCandidate(currentTrackId, nowMs);
    if (!candidate) return;

    const triggerAtMs = clampTimeToTrackDuration(
      pinnedSourceTimeMs ?? candidate.sourceTimeMs,
      playbackState.durationMs ?? undefined
    );
    const warmupStartMs = Math.max(
      0,
      triggerAtMs - (autoTransitionLeadMsRef.current + AUTO_TRANSITION_WARMUP_WINDOW_MS)
    );
    const progressNowMs = playbackState.progressMs ?? 0;
    if (progressNowMs < warmupStartMs) return;

    const warmupKey = `${candidate.sourceTrackId}:${candidate.targetTrackId}:${candidate.targetTimeMs}`;
    if (warmedTransitionCandidateKeyRef.current === warmupKey) return;
    warmedTransitionCandidateKeyRef.current = warmupKey;

    const activeProvider = provider ?? getYouTubeProvider();
    void activeProvider.warmupTransitionTarget(candidate.targetTrackId);
  }, [
    pinnedSourceTimeMs,
    playbackState?.currentTrack?.id,
    playbackState?.durationMs,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    pickAutoTransitionCandidate,
    provider,
  ]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (autoTransitionedSourceTrackIdRef.current === currentTrackId) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const candidate = pickAutoTransitionCandidate(currentTrackId, nowMs);
    if (!candidate) return;

    const triggerAtMs = clampTimeToTrackDuration(
      pinnedSourceTimeMs ?? candidate.sourceTimeMs,
      playbackState.durationMs ?? undefined
    );
    const transitionStartMs = Math.max(0, triggerAtMs - autoTransitionLeadMsRef.current);
    const handoffPrimeAtMs = Math.max(0, transitionStartMs - AUTO_TRANSITION_HANDOFF_PRIME_MS);
    const progressNowMs = playbackState.progressMs ?? 0;
    if (progressNowMs < handoffPrimeAtMs || progressNowMs > triggerAtMs + 1200) return;

    const handoffKey = `${candidate.sourceTrackId}:${candidate.targetTrackId}:${candidate.targetTimeMs}`;
    if (handoffPrimedCandidateKeyRef.current === handoffKey) return;
    handoffPrimedCandidateKeyRef.current = handoffKey;

    const activeProvider = provider ?? getYouTubeProvider();
    activeProvider.primeTransitionHandoff();
  }, [
    pinnedSourceTimeMs,
    playbackState?.currentTrack?.id,
    playbackState?.durationMs,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    pickAutoTransitionCandidate,
    provider,
  ]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (autoTransitionedSourceTrackIdRef.current === currentTrackId) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const candidate = pickAutoTransitionCandidate(currentTrackId, nowMs);
    if (!candidate) return;

    const triggerAtMs = clampTimeToTrackDuration(
      pinnedSourceTimeMs ?? candidate.sourceTimeMs,
      playbackState.durationMs ?? undefined
    );
    const transitionStartMs = Math.max(0, triggerAtMs - autoTransitionLeadMsRef.current);
    const progressNowMs = playbackState.progressMs ?? 0;

    if (progressNowMs < Math.max(0, transitionStartMs - 300)) return;
    if (progressNowMs > triggerAtMs + AUTO_TRANSITION_MISS_WINDOW_MS) {
      autoTransitionedSourceTrackIdRef.current = currentTrackId;
      recordTransitionRuntimeEvent({
        sourceTrackId: candidate.sourceTrackId,
        targetTrackId: candidate.targetTrackId,
        latencyMs: AUTO_TRANSITION_MISS_WINDOW_MS,
        stalled: true,
        dropped: true,
        mode: 'auto',
      });
      return;
    }

    autoTransitionedSourceTrackIdRef.current = currentTrackId;
    void (async () => {
      setIsAutoTransitioning(true);
      await handlePlayTransitionCandidate(candidate, { reason: 'auto' });
      setIsAutoTransitioning(false);
    })();
  }, [
    handlePlayTransitionCandidate,
    pinnedSourceTimeMs,
    playbackState?.currentTrack?.id,
    playbackState?.durationMs,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    pickAutoTransitionCandidate,
  ]);

  const currentTrack = playbackState?.currentTrack ?? null;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = playbackState?.durationMs ?? currentTrack?.durationMs ?? 0;
  const effectiveError = providerError ?? uiError;

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => b.playCount - a.playCount),
    [library]
  );
  const sortedLibraryIdSignature = useMemo(
    () => sortedLibrary.map((track) => track.id).join('|'),
    [sortedLibrary]
  );
  const libraryTrackMap = useMemo(
    () => new Map(library.map((track) => [track.id, track])),
    [library]
  );
  const selectedSeedTrack = useMemo(
    () => (seedTrackId ? libraryTrackMap.get(seedTrackId) ?? null : null),
    [libraryTrackMap, seedTrackId]
  );
  const meanCandidateScore = useMemo(
    () => computeMeanTransitionScore(transitionCandidates),
    [transitionCandidates]
  );
  const selectedSeedRelevantTargets = useMemo(
    () => (seedTrackId ? relevanceMap[seedTrackId] ?? [] : []),
    [relevanceMap, seedTrackId]
  );
  const selectedSeedLabelGatePassed = useMemo(
    () => !seedTrackId || selectedSeedRelevantTargets.length >= REQUIRED_RELEVANT_TARGETS_PER_SEED,
    [seedTrackId, selectedSeedRelevantTargets.length]
  );
  const benchmarkEligibleSeedTrackIds = useMemo(() => buildBenchmarkSeedSelection({
    existingSeedTrackIds: [],
    sortedLibrary,
    analysisStates,
    relevanceMap,
    requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
    targetSeedCount: sortedLibrary.length,
  }), [analysisStates, relevanceMap, sortedLibrary]);
  const benchmarkSeedTrackIdsResolved = useMemo(() => benchmarkSeedTrackIds
    .map((trackId) => trackId.trim())
    .filter((trackId) => trackId.length > 0 && libraryTrackMap.has(trackId)), [benchmarkSeedTrackIds, libraryTrackMap]);
  const benchmarkLabelGatePassed = useMemo(
    () => benchmarkSeedTrackIdsResolved.every(
      (trackId) => (relevanceMap[trackId] ?? []).length >= REQUIRED_RELEVANT_TARGETS_PER_SEED
    ),
    [benchmarkSeedTrackIdsResolved, relevanceMap]
  );
  const benchmarkSeedsBelowRelevantMinimum = useMemo(
    () => benchmarkSeedTrackIdsResolved.filter(
      (trackId) => (relevanceMap[trackId] ?? []).length < REQUIRED_RELEVANT_TARGETS_PER_SEED
    ),
    [benchmarkSeedTrackIdsResolved, relevanceMap]
  );
  const allScopeSeedsBelowRelevantMinimum = useMemo(
    () => sortedLibrary
      .map((track) => track.id)
      .filter((trackId) => (relevanceMap[trackId] ?? []).length < REQUIRED_RELEVANT_TARGETS_PER_SEED),
    [relevanceMap, sortedLibrary]
  );
  const allScopeSeedsMissingAnalysis = useMemo(
    () => sortedLibrary
      .map((track) => track.id)
      .filter((trackId) => analysisStates[trackId]?.status !== 'ready'),
    [analysisStates, sortedLibrary]
  );
  const benchmarkSeedShortfallCount = useMemo(
    () => Math.max(0, TARGET_BENCHMARK_SEED_COUNT - benchmarkEligibleSeedTrackIds.length),
    [benchmarkEligibleSeedTrackIds.length]
  );
  const autoLabelTargetSeedIds = useMemo(() => Array.from(new Set([
    ...allScopeSeedsBelowRelevantMinimum,
    ...allScopeSeedsMissingAnalysis,
  ])), [allScopeSeedsBelowRelevantMinimum, allScopeSeedsMissingAnalysis]);
  const allScopeLabelGatePassed = allScopeSeedsBelowRelevantMinimum.length === 0;
  const evaluationProgressReport: EvaluationProgressReport = useMemo(() => {
    const seedTrackIds = Array.from(new Set([
      ...sortedLibrary.map((track) => track.id),
      ...Object.keys(relevanceMap),
      ...Object.keys(analysisStates),
    ]));
    return buildEvaluationProgressReport({
      seedTrackIds,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
    });
  }, [analysisStates, relevanceMap, sortedLibrary]);
  const benchmarkProgressReport: EvaluationProgressReport = useMemo(() => buildEvaluationProgressReport({
    seedTrackIds: benchmarkSeedTrackIdsResolved,
    analysisStates,
    relevanceMap,
    requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
  }), [
    analysisStates,
    benchmarkSeedTrackIdsResolved,
    relevanceMap,
  ]);

  useEffect(() => {
    if (benchmarkSeedTrackIds.length === 0) return;
    const nextBenchmarkSeedTrackIds = buildBenchmarkSeedSelection({
      existingSeedTrackIds: benchmarkSeedTrackIds,
      sortedLibrary,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
      targetSeedCount: TARGET_BENCHMARK_SEED_COUNT,
    });
    const currentSignature = benchmarkSeedTrackIdsResolved.join('|');
    const nextSignature = nextBenchmarkSeedTrackIds.join('|');
    if (currentSignature === nextSignature) return;
    const persisted = setBenchmarkSeedTrackIds(nextBenchmarkSeedTrackIds);
    setBenchmarkSeedTrackIdsState(persisted);
  }, [
    analysisStates,
    benchmarkSeedTrackIds,
    benchmarkSeedTrackIdsResolved,
    relevanceMap,
    sortedLibrary,
  ]);

  const handleRunBaseline = useCallback(async (scope: BaselineScope) => {
    const seedTrackIds =
      scope === 'selected'
        ? (seedTrackId ? [seedTrackId] : [])
        : scope === 'all'
          ? sortedLibrary.map((track) => track.id)
          : benchmarkSeedTrackIdsResolved;

    if (seedTrackIds.length === 0) {
      if (scope === 'selected') {
        setUiError('Seed baseline icin once bir sarki cal.');
      } else if (scope === 'benchmark') {
        setUiError('Benchmark baseline icin once benchmark seed setini olustur.');
      } else {
        setUiError('Baseline icin once kutuphaneye sarki ekle.');
      }
      return;
    }
    if (scope === 'benchmark' && seedTrackIds.length < TARGET_BENCHMARK_SEED_COUNT) {
      setUiError(`Benchmark set en az ${TARGET_BENCHMARK_SEED_COUNT} seed icermeli.`);
      return;
    }
    const seedsBelowRelevantMinimum = seedTrackIds.filter(
      (trackId) => (relevanceMap[trackId] ?? []).length < REQUIRED_RELEVANT_TARGETS_PER_SEED
    );
    if (seedsBelowRelevantMinimum.length > 0) {
      const missingSeedNames = seedsBelowRelevantMinimum
        .map((trackId) => libraryTrackMap.get(trackId)?.name ?? trackId)
        .join(', ');
      setUiError(
        `Label kalite kapisi: seed basina en az ${REQUIRED_RELEVANT_TARGETS_PER_SEED} relevant hedef gerekli. Eksik: ${missingSeedNames}`
      );
      return;
    }

    setBaselineScope(scope);
    setIsBaselineLoading(true);
    try {
      const result = await runBaselineEvaluation({
        seedTrackIds,
        limit: 5,
        goodThreshold: 0.6,
        relevantTargetsBySeed: relevanceMap,
        scopeLabel: scope === 'benchmark' ? 'custom' : scope,
        scopeId: scope === 'benchmark' ? BENCHMARK_SCOPE_ID : undefined,
        enforceRegressionGate: scope === 'benchmark',
        enforceTuningValidationGate: scope === 'benchmark',
        requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
        enforceRelevantTargetMinimum: true,
      });
      setBaselineResult(result);
      setBaselineHistory(getBaselineRunHistory(5));
    } catch (error) {
      console.error('Failed to run baseline evaluation:', error);
      const message = error instanceof Error ? error.message : null;
      setUiError(message ?? 'Baseline degerlendirmesi basarisiz oldu.');
    } finally {
      setIsBaselineLoading(false);
    }
  }, [
    benchmarkSeedTrackIdsResolved,
    libraryTrackMap,
    relevanceMap,
    seedTrackId,
    sortedLibrary,
  ]);

  useEffect(() => {
    if (!baselineResult || baselineScope !== 'benchmark') return;
    const activeProvider = provider ?? getYouTubeProvider();
    const currentProfile = activeProvider.getTransitionHandoffProfile();
    const tunedProfile = buildHandoffProfileFromBenchmarkResult(baselineResult, currentProfile);
    const appliedProfile = activeProvider.configureTransitionHandoffProfile(tunedProfile);
    setHandoffProfile(appliedProfile);
  }, [baselineResult, baselineScope, provider]);

  const extractAutoRelevantTargetIds = useCallback(async (
    seedId: string,
    minimumCount: number
  ): Promise<string[]> => {
    const boundedMinimumCount = Math.max(REQUIRED_RELEVANT_TARGETS_PER_SEED, minimumCount);
    const candidates = await findTransitionCandidates({
      trackId: seedId,
      limit: boundedMinimumCount >= 4 ? 20 : 12,
    });
    return Array.from(new Set(candidates.map((candidate) => candidate.targetTrackId)))
      .filter((targetTrackId) => targetTrackId !== seedId)
      .slice(0, boundedMinimumCount);
  }, []);

  const ensureTrackAnalyzed = useCallback(async (trackId: string): Promise<void> => {
    if (analysisStates[trackId]?.status === 'ready') return;
    const track = libraryTrackMap.get(trackId);
    if (!track) return;
    await analyzeTrackWithHeuristicV1({
      id: track.id,
      durationMs: track.durationMs,
      name: track.name,
      artist: track.artist,
    });
  }, [analysisStates, libraryTrackMap]);

  useEffect(() => {
    autoLabelRetryAfterRef.current.clear();
  }, [sortedLibraryIdSignature]);

  useEffect(() => {
    if (sortedLibrary.length < 2 || isAutoLabeling) return;
    const nowMs = Date.now();
    const retryDelayMs = benchmarkSeedShortfallCount > 0
      ? AUTO_LABEL_RETRY_DELAY_URGENT_MS
      : AUTO_LABEL_RETRY_DELAY_MS;
    const minAutoTargets = benchmarkSeedShortfallCount > 0 ? 3 : REQUIRED_RELEVANT_TARGETS_PER_SEED;
    const candidateSeedIds = autoLabelTargetSeedIds.filter((seedId) => {
      const retryAfterMs = autoLabelRetryAfterRef.current.get(seedId) ?? 0;
      return retryAfterMs <= nowMs;
    });
    if (candidateSeedIds.length === 0) return;

    const run = async () => {
      setIsAutoLabeling(true);
      try {
        let nextMap = getTransitionRelevanceMap();
        let hasChanges = false;

        for (const seedId of candidateSeedIds) {
          await ensureTrackAnalyzed(seedId);
          const autoTargets = await extractAutoRelevantTargetIds(seedId, minAutoTargets);
          if (autoTargets.length === 0) {
            autoLabelRetryAfterRef.current.set(seedId, Date.now() + retryDelayMs);
            continue;
          }

          const previousTargets = nextMap[seedId] ?? [];
          const mergedTargets = Array.from(new Set([...previousTargets, ...autoTargets]));
          if (mergedTargets.length !== previousTargets.length) {
            nextMap = { ...nextMap, [seedId]: mergedTargets };
            hasChanges = true;
          }

          if (mergedTargets.length >= REQUIRED_RELEVANT_TARGETS_PER_SEED) {
            autoLabelRetryAfterRef.current.delete(seedId);
          } else {
            autoLabelRetryAfterRef.current.set(seedId, Date.now() + retryDelayMs);
          }
        }

        if (!hasChanges) return;
        const persistedMap = setTransitionRelevanceMap(nextMap);
        setRelevanceMap(persistedMap);
        refreshAnalysisStates();
        if (showTransitionPanel && seedTrackId) {
          await refreshTransitionCandidates();
        }
      } catch (error) {
        console.error('Background auto label failed:', error);
      } finally {
        setIsAutoLabeling(false);
      }
    };

    void run();
  }, [
    autoLabelTargetSeedIds,
    benchmarkSeedShortfallCount,
    ensureTrackAnalyzed,
    extractAutoRelevantTargetIds,
    isAutoLabeling,
    refreshAnalysisStates,
    refreshTransitionCandidates,
    seedTrackId,
    showTransitionPanel,
    sortedLibrary.length,
  ]);

  const handleGenerateBenchmarkSeedSet = useCallback(() => {
    const candidateSeedIds = buildBenchmarkSeedSelection({
      existingSeedTrackIds: benchmarkSeedTrackIds,
      sortedLibrary,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
      targetSeedCount: TARGET_BENCHMARK_SEED_COUNT,
    });
    if (candidateSeedIds.length < TARGET_BENCHMARK_SEED_COUNT) {
      setUiError(
        `Benchmark set icin en az ${TARGET_BENCHMARK_SEED_COUNT} hazir+labelli seed gerekli (mevcut ${candidateSeedIds.length}).`
      );
      return;
    }

    const nextIds = setBenchmarkSeedTrackIds(candidateSeedIds);
    setBenchmarkSeedTrackIdsState(nextIds);
    setUiError(null);
  }, [analysisStates, benchmarkSeedTrackIds, relevanceMap, sortedLibrary]);

  const handleClearBenchmarkSeedSet = useCallback(() => {
    clearBenchmarkSeedTrackIds();
    setBenchmarkSeedTrackIdsState([]);
  }, []);

  const handlePinSourceFromSlider = useCallback(() => {
    if (!seedTrackId) return;
    const clamped = clampTimeToTrackDuration(sourceSliderTimeMs, selectedSeedTrack?.durationMs);
    setPinnedSourceTimeMs(clamped);
  }, [seedTrackId, selectedSeedTrack?.durationMs, sourceSliderTimeMs]);

  const handlePinSourceFromCurrentPosition = useCallback(() => {
    if (!seedTrackId) return;
    if (playbackState?.currentTrack?.id !== seedTrackId) {
      setUiError('Su anki konumu pinlemek icin once bir sarki cal.');
      return;
    }

    const clamped = clampTimeToTrackDuration(
      playbackState.progressMs ?? 0,
      selectedSeedTrack?.durationMs
    );
    setUiError(null);
    setSourceSliderTimeMs(clamped);
    setPinnedSourceTimeMs(clamped);
  }, [playbackState?.currentTrack?.id, playbackState?.progressMs, seedTrackId, selectedSeedTrack?.durationMs]);

  const handleClearPinnedSource = useCallback(() => {
    setPinnedSourceTimeMs(null);
  }, []);

  const handleResetAllData = useCallback(async () => {
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.logout();

      clearYouTubeLocalData();
      clearTransitionData();
      clearBenchmarkSeedTrackIds();
      resetRuntimeState({ clearInput: true });

      await refreshLibrary();
      await youtubeProvider.authenticate();
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to reset local data:', error);
      setUiError('Veri temizleme basarisiz oldu.');
    }
  }, [refreshLibrary, resetRuntimeState]);

  return (
    <div className="w-full h-screen bg-[var(--color-background)] overflow-hidden flex flex-col border border-white/10">
      <div
        className="h-10 flex items-center justify-between px-4 bg-[var(--color-surface)] no-select cursor-default relative z-20 shrink-0 border-b border-white/10"
      >
        <span data-tauri-drag-region className="text-sm font-semibold text-[var(--color-text-primary)] pointer-events-none">
          Moodverter
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">
          YouTube • {library.length} sarki
        </span>
        <button
          onClick={() => void handleResetAllData()}
          className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-red-300 hover:border-red-400/50"
          title="Yerel verileri temizle"
        >
          Veriyi Temizle
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4 flex flex-col gap-4">
        <section className="bg-[var(--color-surface)] border border-white/10 p-3">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
            YouTube Link Ekle
          </h2>
          <form onSubmit={handleSubmitUrl} className="flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-primary)]"
            />
            <button
              type="submit"
              disabled={isSubmittingUrl}
              className="px-3 py-2 bg-[var(--color-primary)] text-white text-sm font-medium hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
            >
              {isSubmittingUrl ? 'Ekleniyor...' : 'Ekle'}
            </button>
          </form>
        </section>

        <section className="bg-[var(--color-surface)] border border-white/10 p-3">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
            YouTube Arama
          </h2>
          <div className="h-44 border border-white/10 bg-[var(--color-background)]">
            <LibrarySearch
              onTrackSelect={handleSelectSearchResult}
              onAddToLibrary={handleAddSearchResultToLibrary}
            />
          </div>
        </section>

        <section className="bg-[var(--color-surface)] border border-white/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2 gap-2">
            <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              Kutuphane + Transition
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowTransitionPanel((prev) => !prev)}
                className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                {showTransitionPanel ? 'Transition Kapat' : 'Transition Ac'}
              </button>
              {showTransitionPanel && (
                <button
                  onClick={() => void refreshTransitionCandidates()}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                >
                  Adaylari Yenile
                </button>
              )}
            </div>
          </div>

          {showTransitionPanel ? (
            <div className="border border-white/10 bg-[var(--color-background)] p-2 mb-2 space-y-2 h-56 min-h-40 max-h-[72vh] resize-y overflow-y-auto shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                  Aktif Kaynak: {selectedSeedTrack ? `${selectedSeedTrack.name} - ${selectedSeedTrack.artist}` : 'calan sarki bekleniyor'}
                </div>
                <button
                  onClick={() => {
                    if (!seedTrackId) return;
                    void handleAnalyzeTrack(seedTrackId);
                  }}
                  disabled={!seedTrackId}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  Analiz Et
                </button>
              </div>

              <div className="text-[10px] text-[var(--color-text-secondary)]">
                Ortalama Skor@{transitionCandidates.length}: {formatPercent(meanCandidateScore)}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                Otomatik Gecis: {isAutoTransitioning ? 'gecis yapiliyor...' : 'aktif'}
                {' | '}
                Lead {Math.round(autoTransitionLeadMs / 10) / 100}s
                {lastAutoTransitionLatencyMs !== null ? ` | son gecis ${lastAutoTransitionLatencyMs}ms` : ''}
                {` | Handoff d${handoffProfile.duckPercent} r${handoffProfile.rampMs}ms h${handoffProfile.holdMs}ms`}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                Label Durumu: {selectedSeedRelevantTargets.length}/{REQUIRED_RELEVANT_TARGETS_PER_SEED}
              </div>
              <div className="border border-white/10 bg-white/5 px-2 py-1 space-y-1">
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Degerlendirme: Hazir {evaluationProgressReport.readySeedCount}/{evaluationProgressReport.totalSeedCount}
                  {' | '}
                  Label Gate {evaluationProgressReport.labelGatePassedSeedCount}/{evaluationProgressReport.totalSeedCount}
                  {' | '}
                  Label Eksigi {evaluationProgressReport.seedsNeedingLabels.length}
                  {' | '}
                  Analiz Eksigi {evaluationProgressReport.seedsMissingAnalysis.length}
                </div>
                {(evaluationProgressReport.seedsNeedingLabels.length > 0 || evaluationProgressReport.seedsMissingAnalysis.length > 0) && (
                  <div className="text-[10px] text-amber-400 truncate">
                    Oncelik: {formatTrackNames(
                      evaluationProgressReport.seedsNeedingLabels.length > 0
                        ? evaluationProgressReport.seedsNeedingLabels
                        : evaluationProgressReport.seedsMissingAnalysis,
                      libraryTrackMap
                    )}
                  </div>
                )}
              </div>
              <div className="border border-white/10 bg-white/5 px-2 py-1 space-y-1">
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Benchmark Set: {benchmarkSeedTrackIdsResolved.length}/{TARGET_BENCHMARK_SEED_COUNT}
                  {' | '}
                  Hazir {benchmarkProgressReport.readySeedCount}/{benchmarkProgressReport.totalSeedCount}
                  {' | '}
                  Label Eksigi {benchmarkSeedsBelowRelevantMinimum.length}
                  {' | '}
                  Uygun {benchmarkEligibleSeedTrackIds.length}
                </div>
                {benchmarkSeedsBelowRelevantMinimum.length > 0 && (
                  <div className="text-[10px] text-amber-400 truncate">
                    Benchmark oncelik: {formatTrackNames(benchmarkSeedsBelowRelevantMinimum, libraryTrackMap)}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGenerateBenchmarkSeedSet}
                    className="px-2 py-0.5 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    title={`Ilk ${TARGET_BENCHMARK_SEED_COUNT} hazir analizli track ile benchmark set olustur`}
                  >
                    Benchmark Olustur
                  </button>
                  <button
                    onClick={handleClearBenchmarkSeedSet}
                    disabled={benchmarkSeedTrackIdsResolved.length === 0}
                    className="px-2 py-0.5 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Benchmark seed setini temizle"
                  >
                    Benchmark Temizle
                  </button>
                </div>
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                Analiz durumu: {formatAnalysisStatusLabel(analysisStates[seedTrackId ?? '']?.status ?? 'missing')}
              </div>
              <div className="border border-white/10 bg-white/5 px-2 py-1 space-y-1">
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Source Moment: {pinnedSourceTimeMs === null ? 'Auto (coklu kaynak an)' : formatTime(pinnedSourceTimeMs)}
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(selectedSeedTrack?.durationMs ?? 0, 0)}
                  value={Math.min(sourceSliderTimeMs, Math.max(selectedSeedTrack?.durationMs ?? 0, 0))}
                  onChange={(event) => setSourceSliderTimeMs(Number(event.target.value))}
                  disabled={!seedTrackId}
                  className="w-full accent-[var(--color-primary)] disabled:opacity-50"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePinSourceFromSlider}
                    disabled={!seedTrackId}
                    className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Slider degerini source moment olarak pinle"
                  >
                    Pinle
                  </button>
                  <button
                    onClick={handlePinSourceFromCurrentPosition}
                    disabled={!seedTrackId}
                    className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Oynaticidaki mevcut konumu source moment olarak al"
                  >
                    Simdiki Ani Al
                  </button>
                  <button
                    onClick={handleClearPinnedSource}
                    disabled={pinnedSourceTimeMs === null}
                    className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                    title="Source moment pinini temizle"
                  >
                    Oto
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleRunBaseline('selected')}
                  disabled={isBaselineLoading || !seedTrackId || !selectedSeedLabelGatePassed}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {isBaselineLoading && baselineScope === 'selected' ? 'Baseline...' : 'Kaynak Baseline'}
                </button>
                <button
                  onClick={() => void handleRunBaseline('all')}
                  disabled={isBaselineLoading || sortedLibrary.length === 0 || !allScopeLabelGatePassed}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {isBaselineLoading && baselineScope === 'all' ? 'Baseline...' : 'Tum Baseline'}
                </button>
                <button
                  onClick={() => void handleRunBaseline('benchmark')}
                  disabled={
                    isBaselineLoading
                    || benchmarkSeedTrackIdsResolved.length < TARGET_BENCHMARK_SEED_COUNT
                    || !benchmarkLabelGatePassed
                  }
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {isBaselineLoading && baselineScope === 'benchmark' ? 'Baseline...' : 'Benchmark Baseline'}
                </button>
              </div>

              {baselineResult && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Baseline Ozeti: Scope {baselineScope === 'selected' ? 'Kaynak' : baselineScope === 'all' ? 'Tum' : 'Benchmark'}
                  {' | '}
                  Hit@3 {formatOptionalPercent(baselineResult.hitAt3)}
                  {' | '}
                  Hit@5 {formatOptionalPercent(baselineResult.hitAt5)}
                  {' | '}
                  Mean@{baselineResult.limit} {formatPercent(baselineResult.meanTopKScore)}
                  {' | '}
                  Coverage {formatPercent(baselineResult.coverageRate)}
                  {' | '}
                  Etiketli {baselineResult.labeledSeedCount}
                </div>
              )}
              {baselineResult && baselineResult.transitionRuntimeSampleCount > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Runtime: p95 {formatOptionalMs(baselineResult.transitionLatencyP95Ms)}
                  {' | '}
                  Stall {formatOptionalPercent(baselineResult.transitionStallRate)}
                  {' | '}
                  Drop {formatOptionalPercent(baselineResult.transitionDropRate)}
                  {' | '}
                  Ornek {baselineResult.transitionRuntimeSampleCount}
                </div>
              )}
              {baselineResult && (
                <div className={`text-[10px] border px-2 py-1 ${
                  baselineResult.tuningValidationPassed
                    ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
                    : 'text-amber-400 border-amber-400/30 bg-amber-500/10'
                }`}>
                  Tuning Gate {formatGateLabel(baselineResult.tuningValidationPassed)}
                  {baselineResult.tuningValidationSummary ? ` | ${baselineResult.tuningValidationSummary}` : ' | ilk benchmark karsilastirmasi'}
                </div>
              )}
              {baselineHistory.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Son kosular: {baselineHistory.length}
                  {' | '}
                  Son Hit@3 {formatOptionalPercent(baselineHistory[0].hitAt3)}
                  {' | '}
                  Son Hit@5 {formatOptionalPercent(baselineHistory[0].hitAt5)}
                  {' | '}
                  Son p95 {formatOptionalMs(baselineHistory[0].transitionLatencyP95Ms)}
                  {' | '}
                  Son Stall {formatOptionalPercent(baselineHistory[0].transitionStallRate)}
                  {' | '}
                  Son Drop {formatOptionalPercent(baselineHistory[0].transitionDropRate)}
                  {' | '}
                  Son Tuning {formatGateLabel(baselineHistory[0].tuningValidationPassed)}
                </div>
              )}
              {baselineResult?.regressionSummary && (
                <div className="text-[10px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
                  Regresyon kapi: {baselineResult.regressionSummary}
                </div>
              )}
              {baselineResult?.relevanceTargetGateSummary && (
                <div className="text-[10px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
                  Label kapi: {baselineResult.relevanceTargetGateSummary}
                </div>
              )}
              {baselineResult && baselineResult.bottomSeeds.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Bottom-{baselineResult.bottomSeeds.length} kaynak:{' '}
                  {baselineResult.bottomSeeds
                    .map((seed) => {
                      const trackName = libraryTrackMap.get(seed.trackId)?.name ?? seed.trackId;
                      return `${trackName} (${formatPercent(seed.meanTopKScore)} | Tempo ${formatPercent(seed.averageTempoRatioScore)} | Harm ${formatPercent(seed.averageHarmonicCompatibilityScore)})`;
                    })
                    .join(' | ')}
                </div>
              )}
              {baselineResult && baselineResult.tuningActions.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 space-y-1">
                  <div>
                    Tuning Loop:{' '}
                    {baselineResult.tuningActions
                      .map((action) => {
                        const trackName = libraryTrackMap.get(action.trackId)?.name ?? action.trackId;
                        return `${trackName} -> ${formatTuningIssue(action.issue)} (${formatPercent(action.confidence)})`;
                      })
                      .join(' | ')}
                  </div>
                  <div className="text-emerald-300 truncate">
                    Sonraki adim: {baselineResult.tuningActions[0].recommendation}
                  </div>
                </div>
              )}

              {isTransitionLoading ? (
                <div className="text-xs text-[var(--color-text-secondary)]">Transition adaylari hesaplanıyor...</div>
              ) : transitionError ? (
                <div className="text-xs text-amber-400">{transitionError}</div>
              ) : (
                <div className="space-y-1 max-h-56 overflow-y-auto">
                  {transitionCandidates.map((candidate, index) => {
                    const sourceTrack = libraryTrackMap.get(candidate.sourceTrackId);
                    const targetTrack = libraryTrackMap.get(candidate.targetTrackId);
                    const sourceTimeMs = clampTimeToTrackDuration(
                      candidate.sourceTimeMs,
                      sourceTrack?.durationMs
                    );
                    const targetTimeMs = clampTimeToTrackDuration(
                      candidate.targetTimeMs,
                      targetTrack?.durationMs
                    );
                    return (
                      <div key={`${candidate.targetTrackId}:${candidate.targetTimeMs}:${index}`} className="text-[10px] text-[var(--color-text-primary)] border border-white/10 bg-white/5 px-2 py-1">
                        <div className="truncate">
                          {formatTime(sourceTimeMs)} {'->'} {formatTime(targetTimeMs)} | {targetTrack?.name ?? candidate.targetTrackId}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[var(--color-text-secondary)] truncate">
                            Score {formatPercent(candidate.score.finalScore)}
                            {' | '}
                            Event {formatPercent(candidate.score.eventMatchScore)}
                            {' | '}
                            Tempo {formatPercent(candidate.score.tempoRatioScore)}
                            {' | '}
                            Harm {formatPercent(candidate.score.harmonicCompatibilityScore)}
                            {' | '}
                            LoudΔ {Math.round((candidate.targetLoudnessRms - candidate.sourceLoudnessRms) * 10) / 10}dB
                            {' | '}
                            Etken {candidate.diagnostic.primaryDriver}
                          </div>
                          <button
                            onClick={() => void handlePlayTransitionCandidate(candidate)}
                            className="px-2 py-0.5 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                            title="Bu adaya hemen gec"
                          >
                            Simdi Gec
                          </button>
                          <button
                            onClick={() => void handlePreviewTransitionAB(candidate)}
                            className="px-2 py-0.5 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                            title="A@t1 -> B@t2 seklinde kisa onizleme"
                          >
                            Onizle
                          </button>
                        </div>
                        <div className="text-[var(--color-text-secondary)] truncate">
                          {candidate.diagnostic.summary}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="border border-white/10 bg-[var(--color-background)] px-2 py-1 mb-2 text-[10px] text-[var(--color-text-secondary)]">
              Transition paneli kapali. Gormek icin "Transition Ac" butonunu kullan.
            </div>
          )}

          {sortedLibrary.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
              Henuz sarki eklenmedi.
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
              {sortedLibrary.map((track) => (
                <div
                  key={track.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void handlePlayFromLibrary(track.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      void handlePlayFromLibrary(track.id);
                    }
                  }}
                  className="flex items-center gap-2 p-2 bg-white/5 border border-transparent hover:border-white/10 cursor-pointer"
                  title="Sarkiyi oynat"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--color-text-primary)] truncate">{track.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] truncate">
                      {track.artist} • analiz: {analysisStates[track.id]?.status ?? 'yok'}
                    </div>
                  </div>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRemoveFromLibrary(track.id);
                    }}
                    className="px-2 py-1 text-xs text-[var(--color-text-secondary)] border border-white/10 hover:text-red-400 hover:border-red-500/50"
                    title="Sarkiyi kaldir"
                  >
                    Kaldir
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-white/10 bg-[var(--color-surface)] p-3 space-y-2">
        {effectiveError && (
          <div className="px-2 py-1 text-xs text-red-400 border border-red-500/30 bg-red-500/10">
            {effectiveError}
          </div>
        )}

        <div className="flex items-center gap-3">
          {currentTrack?.albumArt ? (
            <img src={currentTrack.albumArt} alt={currentTrack.name} className="w-10 h-10 object-cover" />
          ) : (
            <div className="w-10 h-10 bg-white/10 flex items-center justify-center text-lg">🎵</div>
          )}

          <div className="min-w-0 flex-1">
            <div className="text-sm text-[var(--color-text-primary)] truncate">
              {currentTrack?.name ?? 'Sarki sec'}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] truncate">
              {currentTrack?.artist ?? 'YouTube player hazir'}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button onClick={() => void previous()} className="px-2 py-1 border border-white/10 text-[var(--color-text-primary)] hover:bg-white/5">
              ◀◀
            </button>
              <button
                onClick={() => void handlePlayPause()}
                className="px-3 py-1 bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]"
              >
                {playbackState?.isPlaying ? 'Duraklat' : 'Oynat'}
              </button>
            <button onClick={() => void skip()} className="px-2 py-1 border border-white/10 text-[var(--color-text-primary)] hover:bg-white/5">
              ▶▶
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <input
            type="range"
            min={0}
            max={Math.max(durationMs, 0)}
            value={Math.min(progressMs, Math.max(durationMs, 0))}
            onChange={(e) => void seek(Number(e.target.value))}
            className="w-full accent-[var(--color-primary)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
            <span>{formatTime(progressMs)}</span>
            <span>{formatTime(durationMs)}</span>
          </div>
        </div>

        {isLoading && (
          <div className="text-[10px] text-[var(--color-text-secondary)]">Player hazirlaniyor...</div>
        )}
      </div>
    </div>
  );
}

export default App;
