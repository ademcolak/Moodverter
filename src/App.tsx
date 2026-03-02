import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppFrame } from './components/layout/AppFrame';
import { BottomTabBar } from './components/navigation/BottomTabBar';
import { HistoryPage } from './components/pages/HistoryPage';
import { LibraryPage } from './components/pages/LibraryPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { TransitionPage } from './components/pages/TransitionPage';
import { PlayerBar } from './components/player/PlayerBar';
import type { UnifiedTrack } from './types/provider';
import type { YouTubePlaylistAnalysis, YouTubeSearchResult } from './services/youtube/search';
import {
  analyzeYouTubePlaylist,
  clearYouTubeLocalData,
  searchResultToUnifiedTrack,
} from './services/youtube/search';
import {
  getYouTubeProvider,
  type TransitionEffectStyle,
  type TransitionHandoffProfile,
} from './services/providers/youtube';
import { useProvider } from './hooks/useProvider';
import {
  analyzeTrackWithHeuristicV1,
  buildBenchmarkSeedSelection,
  buildEvaluationProgressReport,
  buildRelevantTargetGaps,
  buildRuntimeThresholdDriftReport,
  clearBenchmarkSeedTrackIds,
  clearTransitionData,
  decideAutoTransition,
  DEFAULT_AUTO_TRANSITION_DECISION_CONFIG,
  findTransitionCandidates,
  getAnalysisState,
  getBaselineRunHistory,
  getBenchmarkSeedTrackIds,
  getRuntimeGateCalibration,
  getTransitionRelevanceMap,
  recordTransitionRuntimeEvent,
  resolveBenchmarkSeedTargetCount,
  setTransitionRelevanceMap,
  setBenchmarkSeedTrackIds,
  type AnalysisState,
  type BaselineEvaluationResult,
  type BaselineRunArtifact,
  type BaselineTuningAction,
  type EvaluationProgressReport,
  type RecordTransitionRuntimeEventInput,
  type TransitionDecision,
  type TransitionRelevanceMap,
  type RuntimeGateThresholds,
  runBaselineEvaluation,
  type TransitionCandidate,
} from './services/transition';

const ONE_TIME_DATA_RESET_KEY = 'moodverter_data_reset_20260209';
type AppTab = 'library' | 'transition' | 'history' | 'settings';
type BaselineScope = 'selected' | 'all' | 'benchmark';
const REQUIRED_RELEVANT_TARGETS_PER_SEED = 2;
const MIN_BENCHMARK_SEED_COUNT = 10;
const PREFERRED_BENCHMARK_SEED_COUNT = 12;
const BENCHMARK_SCOPE_ID = 'benchmark-v1';
const AUTO_TRANSITION_BASE_LEAD_MS = 900;
const AUTO_TRANSITION_MIN_LEAD_MS = 900;
const AUTO_TRANSITION_MAX_LEAD_MS = 2200;
const AUTO_TRANSITION_WARMUP_WINDOW_MS = 2600;
const AUTO_TRANSITION_HANDOFF_PRIME_MS = 360;
const AUTO_TRANSITION_POST_SWITCH_COOLDOWN_MS = 12_000;
const AUTO_TRANSITION_REVERSE_PAIR_GUARD_MS = 90_000;
const AUTO_TRANSITION_MISS_WINDOW_MS = 15_000;
const AUTO_LABEL_RETRY_DELAY_MS = 45_000;
const AUTO_LABEL_RETRY_DELAY_URGENT_MS = 10_000;
const TRANSITION_STALL_THRESHOLD_MS = 1_800;
const BENCHMARK_RUNTIME_CALIBRATION_MIN_SAMPLE_COUNT = 12;
const PLAYLIST_IMPORT_BATCH_SIZE = 20;

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

function formatAutoDecisionReasonLabel(reason: string): string {
  switch (reason) {
    case 'EVENT_MISMATCH':
      return 'Event uyumsuz';
    case 'LOW_EVENT_CONFIDENCE':
      return 'Event guveni dusuk';
    case 'TEMPO_OUT_OF_RANGE':
      return 'Tempo araligi disi';
    case 'KEY_DISTANCE_HIGH':
      return 'Harmoni uzak';
    case 'LOUDNESS_JUMP_HIGH':
      return 'Ses atlamasi yuksek';
    case 'LOW_MARGIN':
      return 'Aday farki dusuk';
    case 'LOW_SCORE':
    default:
      return 'Skor dusuk';
  }
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

function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
  }
  if (error instanceof Error) {
    return /quota|exceeded|storage/i.test(error.message);
  }
  return false;
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

interface AutoTransitionSnapshot {
  sourceTrackId: string;
  targetTrackId: string;
  atMs: number;
}

interface QueuedManualTransition {
  candidate: TransitionCandidate;
  queuedAtMs: number;
}

interface DatasetPlaylistTrackInput {
  videoId?: unknown;
  id?: unknown;
  title?: unknown;
  name?: unknown;
  artist?: unknown;
  thumbnail?: unknown;
  albumArt?: unknown;
  duration?: unknown;
  durationMs?: unknown;
  addedAt?: unknown;
}

interface PlaylistImportProgress {
  processed: number;
  total: number;
  added: number;
  skipped: number;
}

function toOptionalFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function normalizeDatasetPlaylistTrack(entry: unknown): UnifiedTrack | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as DatasetPlaylistTrackInput;
  const id = typeof row.videoId === 'string'
    ? row.videoId.trim()
    : typeof row.id === 'string'
      ? row.id.trim()
      : '';
  if (!id) return null;

  const name = typeof row.title === 'string'
    ? row.title.trim()
    : typeof row.name === 'string'
      ? row.name.trim()
      : '';
  if (!name) return null;

  const artist = typeof row.artist === 'string' && row.artist.trim().length > 0
    ? row.artist.trim()
    : 'Unknown Artist';
  const albumArt = typeof row.thumbnail === 'string' && row.thumbnail.trim().length > 0
    ? row.thumbnail.trim()
    : typeof row.albumArt === 'string' && row.albumArt.trim().length > 0
      ? row.albumArt.trim()
      : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const durationFromMs = toOptionalFiniteNumber(row.durationMs);
  const durationFromDuration = toOptionalFiniteNumber(row.duration);
  const durationMs = Math.max(
    0,
    Math.floor(durationFromMs ?? durationFromDuration ?? 0)
  );
  const addedAt = toOptionalFiniteNumber(row.addedAt);

  return {
    id,
    provider: 'youtube',
    name,
    artist,
    albumArt,
    durationMs,
    playCount: 0,
    providerData: addedAt === null ? undefined : { addedAt },
  };
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
  const [playlistUrlInput, setPlaylistUrlInput] = useState('');
  const [isPlaylistAnalyzing, setIsPlaylistAnalyzing] = useState(false);
  const [playlistAnalysis, setPlaylistAnalysis] = useState<YouTubePlaylistAnalysis | null>(null);
  const [isPlaylistImporting, setIsPlaylistImporting] = useState(false);
  const [playlistImportProgress, setPlaylistImportProgress] = useState<PlaylistImportProgress | null>(null);
  const [playlistImportSummary, setPlaylistImportSummary] = useState<string | null>(null);
  const [isClearingLibrary, setIsClearingLibrary] = useState(false);
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [isDatasetImporting, setIsDatasetImporting] = useState(false);
  const [datasetImportSummary, setDatasetImportSummary] = useState<string | null>(null);
  const [uiError, setUiError] = useState<string | null>(null);
  const [analysisStates, setAnalysisStates] = useState<Record<string, AnalysisState>>({});
  const [seedTrackId, setSeedTrackId] = useState<string | null>(null);
  const [transitionCandidates, setTransitionCandidates] = useState<TransitionCandidate[]>([]);
  const [isTransitionLoading, setIsTransitionLoading] = useState(false);
  const [isAutoLabeling, setIsAutoLabeling] = useState(false);
  const [isAutoTransitioning, setIsAutoTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [pinnedSourceTimeMs, setPinnedSourceTimeMs] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('library');
  const [isBaselineLoading, setIsBaselineLoading] = useState(false);
  const [baselineResult, setBaselineResult] = useState<BaselineEvaluationResult | null>(null);
  const [baselineHistory, setBaselineHistory] = useState<BaselineRunArtifact[]>([]);
  const [baselineScope, setBaselineScope] = useState<BaselineScope>('selected');
  const [benchmarkSeedTrackIds, setBenchmarkSeedTrackIdsState] = useState<string[]>([]);
  const [benchmarkAutoBootstrapPaused, setBenchmarkAutoBootstrapPaused] = useState(false);
  const [relevanceMap, setRelevanceMap] = useState<TransitionRelevanceMap>({});
  const [autoTransitionLeadMs, setAutoTransitionLeadMs] = useState<number>(AUTO_TRANSITION_BASE_LEAD_MS);
  const [lastAutoTransitionLatencyMs, setLastAutoTransitionLatencyMs] = useState<number | null>(null);
  const [lastAutoTransitionDecision, setLastAutoTransitionDecision] = useState<TransitionDecision | null>(null);
  const [transitionEffectStyle, setTransitionEffectStyle] = useState<TransitionEffectStyle>('clean');
  const [runtimeEventVersion, setRuntimeEventVersion] = useState(0);
  const [handoffProfile, setHandoffProfile] = useState<TransitionHandoffProfile>(() =>
    getYouTubeProvider().getTransitionHandoffProfile()
  );
  const autoLabelRetryAfterRef = useRef<Map<string, number>>(new Map());
  const autoTransitionedSourceTrackIdRef = useRef<string | null>(null);
  const autoTransitionCooldownUntilRef = useRef<number>(0);
  const lastAutoTransitionRef = useRef<AutoTransitionSnapshot | null>(null);
  const isPreviewingRef = useRef(false);
  const queuedManualTransitionRef = useRef<QueuedManualTransition | null>(null);
  const playlistImportCancelRequestedRef = useRef(false);
  const datasetImportInputRef = useRef<HTMLInputElement | null>(null);
  const warmedTransitionCandidateKeyRef = useRef<string | null>(null);
  const handoffPrimedCandidateKeyRef = useRef<string | null>(null);
  const autoTransitionLeadMsRef = useRef<number>(AUTO_TRANSITION_BASE_LEAD_MS);
  const autoSkipDecisionLoggedAtRef = useRef<Map<string, number>>(new Map());
  const libraryScrollTopRef = useRef(0);
  const resetRuntimeState = useCallback((options?: { clearInput?: boolean }) => {
    setLibrary([]);
    setAnalysisStates({});
    setSeedTrackId(null);
    setTransitionCandidates([]);
    setPinnedSourceTimeMs(null);
    setBaselineResult(null);
    setBaselineHistory([]);
    setTransitionError(null);
    setRelevanceMap({});
    setBenchmarkSeedTrackIdsState([]);
    setDatasetImportSummary(null);
    setIsDatasetImporting(false);
    setPlaylistUrlInput('');
    setPlaylistAnalysis(null);
    setIsPlaylistAnalyzing(false);
    setIsPlaylistImporting(false);
    setPlaylistImportProgress(null);
    setPlaylistImportSummary(null);
    setIsClearingLibrary(false);
    playlistImportCancelRequestedRef.current = false;
    setBenchmarkAutoBootstrapPaused(false);
    setLastAutoTransitionDecision(null);
    setTransitionEffectStyle('clean');
    setRuntimeEventVersion(0);
    setActiveTab('library');
    autoSkipDecisionLoggedAtRef.current.clear();
    libraryScrollTopRef.current = 0;
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
    setTransitionEffectStyle(activeProvider.getTransitionEffectProfile().style);
  }, [provider]);

  useEffect(() => {
    const activeProvider = provider ?? getYouTubeProvider();
    activeProvider.configureTransitionEffectProfile({ style: transitionEffectStyle });
  }, [provider, transitionEffectStyle]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(ONE_TIME_DATA_RESET_KEY) === '1') return;

    clearYouTubeLocalData();
    clearTransitionData();
    clearBenchmarkSeedTrackIds();
    try {
      window.localStorage.setItem(ONE_TIME_DATA_RESET_KEY, '1');
    } catch (error) {
      console.warn('Skipping one-time reset marker write due to storage limits:', error);
    }

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
    if (activeTab !== 'transition') return;
    void refreshTransitionCandidates();
  }, [activeTab, refreshTransitionCandidates]);

  useEffect(() => {
    if (!seedTrackId) return;
    void refreshTransitionCandidates();
  }, [refreshTransitionCandidates, seedTrackId]);

  useEffect(() => {
    setPinnedSourceTimeMs(null);
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

  const handleAnalyzePlaylist = useCallback(async () => {
    const trimmed = playlistUrlInput.trim();
    if (!trimmed) return;

    setUiError(null);
    setPlaylistImportSummary(null);
    setPlaylistImportProgress(null);
    setPlaylistAnalysis(null);
    setIsPlaylistAnalyzing(true);
    try {
      const report = await analyzeYouTubePlaylist(trimmed);
      setPlaylistAnalysis(report);
      if (report.validEntries === 0) {
        setUiError('Playlistte eklenebilir video bulunamadi.');
      }
    } catch (error) {
      console.error('Playlist analyze failed:', error);
      const message = error instanceof Error ? error.message : 'Playlist analizi basarisiz oldu.';
      setUiError(message);
    } finally {
      setIsPlaylistAnalyzing(false);
    }
  }, [playlistUrlInput]);

  const handlePlaylistUrlInputChange = useCallback((value: string) => {
    setPlaylistUrlInput(value);
    setPlaylistAnalysis(null);
    setPlaylistImportSummary(null);
    setPlaylistImportProgress(null);
  }, []);

  const handleImportAnalyzedPlaylist = useCallback(async () => {
    if (!playlistAnalysis || playlistAnalysis.tracks.length === 0) {
      setUiError('Once playlist analiz et.');
      return;
    }

    setUiError(null);
    setPlaylistImportSummary(null);
    setIsPlaylistImporting(true);
    playlistImportCancelRequestedRef.current = false;

    const total = playlistAnalysis.tracks.length;
    let processed = 0;
    let added = 0;
    let skipped = 0;
    let failed = 0;
    let stoppedByQuota = false;
    setPlaylistImportProgress({ processed, total, added, skipped });

    try {
      const youtubeProvider = getYouTubeProvider();
      const existingTrackIds = new Set(library.map((track) => track.id));

      for (const track of playlistAnalysis.tracks) {
        if (playlistImportCancelRequestedRef.current) break;

        processed += 1;
        if (existingTrackIds.has(track.videoId)) {
          skipped += 1;
        } else {
          try {
            youtubeProvider.addTrackToLibrary(searchResultToUnifiedTrack(track), { skipAnalysis: true });
            existingTrackIds.add(track.videoId);
            added += 1;
          } catch (error) {
            if (isQuotaExceededError(error)) {
              stoppedByQuota = true;
              break;
            }
            failed += 1;
          }
        }

        if (processed % PLAYLIST_IMPORT_BATCH_SIZE === 0 || processed === total) {
          setPlaylistImportProgress({ processed, total, added, skipped });
          await wait(0);
        }
      }

      setPlaylistImportProgress({ processed, total, added, skipped });
      await refreshLibrary();

      if (stoppedByQuota) {
        setPlaylistImportSummary(
          `Aktarım kısmi tamamlandı: ${processed}/${total} işlendi, ${added} eklendi, ${skipped} atlandı, ${failed} hata. Depolama limiti dolduğu için durdu.`
        );
        setUiError('Depolama limiti doldu. Settings > Gelişmiş > Veriyi Temizle ile alan açıp tekrar deneyebilirsin.');
      } else if (playlistImportCancelRequestedRef.current) {
        setPlaylistImportSummary(
          `Aktarım durduruldu: ${processed}/${total} işlendi, ${added} eklendi, ${skipped} atlandı, ${failed} hata.`
        );
      } else {
        setPlaylistImportSummary(
          `Playlist aktarımı tamamlandı: ${total} video işlendi, ${added} eklendi, ${skipped} atlandı, ${failed} hata.`
        );
        setPlaylistAnalysis(null);
        setPlaylistImportProgress(null);
      }
    } catch (error) {
      console.error('Playlist import failed:', error);
      const message = error instanceof Error ? error.message : 'Playlist aktarımı basarisiz oldu.';
      setUiError(message);
    } finally {
      playlistImportCancelRequestedRef.current = false;
      setIsPlaylistImporting(false);
    }
  }, [library, playlistAnalysis, refreshLibrary]);

  const handleCancelPlaylistImport = useCallback(() => {
    playlistImportCancelRequestedRef.current = true;
  }, []);

  const handleOpenDatasetImportPicker = useCallback(() => {
    datasetImportInputRef.current?.click();
  }, []);

  const handleImportDatasetFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUiError(null);
    setDatasetImportSummary(null);
    setIsDatasetImporting(true);

    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error('Dataset dosyasi array olmali.');
      }

      const normalizedTracks = parsed
        .map((entry) => normalizeDatasetPlaylistTrack(entry))
        .filter((track): track is UnifiedTrack => track !== null);

      if (normalizedTracks.length === 0) {
        throw new Error('Gecerli track bulunamadi.');
      }

      const youtubeProvider = getYouTubeProvider();
      const existingTrackIds = new Set(library.map((track) => track.id));
      let importedCount = 0;

      for (const track of normalizedTracks) {
        if (existingTrackIds.has(track.id)) continue;
        youtubeProvider.addTrackToLibrary(track, { skipAnalysis: true });
        existingTrackIds.add(track.id);
        importedCount += 1;
      }

      await refreshLibrary();
      setDatasetImportSummary(`${importedCount} sarki datasetten eklendi (${normalizedTracks.length} kayit okundu).`);
    } catch (error) {
      console.error('Dataset import failed:', error);
      setUiError('Dataset import basarisiz. playlist.moodverter.json formatini kontrol et.');
    } finally {
      setIsDatasetImporting(false);
    }
  }, [library, refreshLibrary]);

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

  const handleClearAllFromLibrary = useCallback(async () => {
    if (isClearingLibrary || library.length === 0) return;

    setUiError(null);
    setIsClearingLibrary(true);
    try {
      const youtubeProvider = getYouTubeProvider();
      for (const track of library) {
        youtubeProvider.removeTrackFromLibrary(track.id);
      }
      clearTransitionData();
      clearBenchmarkSeedTrackIds();
      setAnalysisStates({});
      setSeedTrackId(null);
      setTransitionCandidates([]);
      setPinnedSourceTimeMs(null);
      setTransitionError(null);
      setBaselineResult(null);
      setBaselineHistory([]);
      setBenchmarkSeedTrackIdsState([]);
      setRelevanceMap(setTransitionRelevanceMap({}));
      setRuntimeEventVersion((current) => current + 1);
      autoTransitionedSourceTrackIdRef.current = null;
      autoTransitionCooldownUntilRef.current = 0;
      lastAutoTransitionRef.current = null;
      queuedManualTransitionRef.current = null;
      warmedTransitionCandidateKeyRef.current = null;
      handoffPrimedCandidateKeyRef.current = null;
      autoSkipDecisionLoggedAtRef.current.clear();
      libraryScrollTopRef.current = 0;
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to clear library:', error);
      setUiError('Kütüphane temizlenemedi.');
    } finally {
      setIsClearingLibrary(false);
    }
  }, [isClearingLibrary, library, refreshLibrary]);

  const noteRuntimeEvent = useCallback((input: RecordTransitionRuntimeEventInput) => {
    recordTransitionRuntimeEvent(input);
    setRuntimeEventVersion((current) => current + 1);
  }, []);

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
          effectStyle: transitionEffectStyle,
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
      noteRuntimeEvent({
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
      const queuedCandidate = queuedManualTransitionRef.current?.candidate;
      if (
        queuedCandidate
        && queuedCandidate.sourceTrackId === candidate.sourceTrackId
        && queuedCandidate.targetTrackId === candidate.targetTrackId
        && queuedCandidate.targetTimeMs === candidate.targetTimeMs
      ) {
        queuedManualTransitionRef.current = null;
      }
      if (options.reason !== 'auto') {
        queuedManualTransitionRef.current = null;
      }
      warmedTransitionCandidateKeyRef.current = null;
      handoffPrimedCandidateKeyRef.current = null;
    } catch (error) {
      const failedAtMs =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const failureLatencyMs = Math.max(0, Math.round(failedAtMs - startedAtMs));
      noteRuntimeEvent({
        sourceTrackId: candidate.sourceTrackId,
        targetTrackId: candidate.targetTrackId,
        latencyMs: failureLatencyMs,
        stalled: true,
        dropped: true,
        mode: options.reason === 'auto' ? 'auto' : 'manual',
      });
      console.error('Failed to play transition candidate:', error);
      queuedManualTransitionRef.current = null;
      setUiError('Transition adayi calinamadi.');
    }
  }, [library, noteRuntimeEvent, play, provider, seek, transitionEffectStyle]);

  const handleNowTransition = useCallback(async (candidate: TransitionCandidate) => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    const currentProgressMs = playbackState?.progressMs ?? 0;
    const isCurrentlyPlaying = Boolean(playbackState?.isPlaying);

    if (!isCurrentlyPlaying || currentTrackId !== candidate.sourceTrackId) {
      queuedManualTransitionRef.current = null;
      await handlePlayTransitionCandidate(candidate, { reason: 'manual' });
      return;
    }

    const latestUsefulSeekStartMs = Math.max(0, candidate.sourceTimeMs - 1000);
    if (currentProgressMs >= latestUsefulSeekStartMs) {
      queuedManualTransitionRef.current = null;
      await handlePlayTransitionCandidate(candidate, { reason: 'manual' });
      return;
    }

    const sourceTrack = library.find((track) => track.id === candidate.sourceTrackId);
    const seekTargetMs = clampTimeToTrackDuration(
      Math.max(0, candidate.sourceTimeMs - 5000),
      sourceTrack?.durationMs
    );

    queuedManualTransitionRef.current = {
      candidate,
      queuedAtMs: Date.now(),
    };
    autoTransitionedSourceTrackIdRef.current = null;
    autoTransitionCooldownUntilRef.current = 0;
    warmedTransitionCandidateKeyRef.current = null;
    handoffPrimedCandidateKeyRef.current = null;
    setUiError(null);

    try {
      await seek(seekTargetMs);
    } catch (error) {
      console.warn('Manual transition seek preparation failed, falling back to direct transition:', error);
      queuedManualTransitionRef.current = null;
      await handlePlayTransitionCandidate(candidate, { reason: 'manual' });
    }
  }, [
    handlePlayTransitionCandidate,
    library,
    playbackState?.currentTrack?.id,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    seek,
  ]);

  const pickAutoTransitionDecision = useCallback((
    currentTrackId: string,
    nowMs: number
  ): TransitionDecision => {
    const candidatesForSource = transitionCandidates.filter(
      (item) => item.sourceTrackId === currentTrackId
    );
    if (candidatesForSource.length === 0) {
      return decideAutoTransition([], DEFAULT_AUTO_TRANSITION_DECISION_CONFIG);
    }

    const queuedCandidate = queuedManualTransitionRef.current?.candidate;
    if (queuedCandidate && queuedCandidate.sourceTrackId === currentTrackId) {
      const matchedQueuedCandidate = candidatesForSource.find((candidate) => (
        candidate.sourceTrackId === queuedCandidate.sourceTrackId
        && candidate.targetTrackId === queuedCandidate.targetTrackId
        && candidate.targetTimeMs === queuedCandidate.targetTimeMs
      ));
      if (matchedQueuedCandidate) {
        return {
          selectedCandidate: matchedQueuedCandidate,
          decision: 'selected',
          gate: {
            passed: true,
            reasons: [],
          },
          top1Score: matchedQueuedCandidate.score.finalScore,
          top1Top2Margin: null,
        };
      }
      queuedManualTransitionRef.current = null;
    } else if (queuedCandidate && queuedCandidate.sourceTrackId !== currentTrackId) {
      queuedManualTransitionRef.current = null;
    }

    const lastAutoTransition = lastAutoTransitionRef.current;
    const reverseGuardActive = Boolean(
      lastAutoTransition && nowMs - lastAutoTransition.atMs < AUTO_TRANSITION_REVERSE_PAIR_GUARD_MS
    );
    const decisionPool = !reverseGuardActive || !lastAutoTransition
      ? candidatesForSource
      : [
          ...candidatesForSource.filter((candidate) => !(
            lastAutoTransition.sourceTrackId === candidate.targetTrackId
            && lastAutoTransition.targetTrackId === currentTrackId
          )),
          ...candidatesForSource.filter((candidate) => (
            lastAutoTransition.sourceTrackId === candidate.targetTrackId
            && lastAutoTransition.targetTrackId === currentTrackId
          )),
        ];

    return decideAutoTransition(decisionPool, DEFAULT_AUTO_TRANSITION_DECISION_CONFIG);
  }, [transitionCandidates]);

  const maybeNoteAutoTransitionSkip = useCallback((
    sourceTrackId: string,
    decision: TransitionDecision
  ): void => {
    if (decision.decision !== 'skipped') return;
    const firstCandidate = transitionCandidates.find((candidate) => candidate.sourceTrackId === sourceTrackId);
    const targetTrackId = firstCandidate?.targetTrackId ?? sourceTrackId;
    const reasonKey = decision.gate.reasons.length > 0
      ? decision.gate.reasons.join('+')
      : 'LOW_SCORE';
    const dedupeKey = `${sourceTrackId}:${targetTrackId}:${reasonKey}`;
    const nowMs = Date.now();
    const prevLoggedAt = autoSkipDecisionLoggedAtRef.current.get(dedupeKey) ?? 0;
    if (nowMs - prevLoggedAt < 10_000) return;
    autoSkipDecisionLoggedAtRef.current.set(dedupeKey, nowMs);
    noteRuntimeEvent({
      sourceTrackId,
      targetTrackId,
      latencyMs: 0,
      stalled: false,
      dropped: false,
      mode: 'auto',
      skippedAutoTransition: true,
      skipReasons: decision.gate.reasons,
    });
  }, [noteRuntimeEvent, transitionCandidates]);

  useEffect(() => {
    warmedTransitionCandidateKeyRef.current = null;
    handoffPrimedCandidateKeyRef.current = null;
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    const queuedCandidate = queuedManualTransitionRef.current?.candidate;
    if (queuedCandidate && queuedCandidate.sourceTrackId !== currentTrackId) {
      queuedManualTransitionRef.current = null;
    }
  }, [playbackState?.currentTrack?.id]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const decision = pickAutoTransitionDecision(currentTrackId, nowMs);
    setLastAutoTransitionDecision(decision);
    if (decision.decision !== 'selected' || !decision.selectedCandidate) return;
    const candidate = decision.selectedCandidate;

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
    pickAutoTransitionDecision,
    provider,
  ]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (autoTransitionedSourceTrackIdRef.current === currentTrackId) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const decision = pickAutoTransitionDecision(currentTrackId, nowMs);
    setLastAutoTransitionDecision(decision);
    if (decision.decision !== 'selected' || !decision.selectedCandidate) return;
    const candidate = decision.selectedCandidate;

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
    pickAutoTransitionDecision,
    provider,
  ]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (autoTransitionedSourceTrackIdRef.current === currentTrackId) return;
    if (isPreviewingRef.current) return;
    const nowMs = Date.now();
    if (nowMs < autoTransitionCooldownUntilRef.current) return;

    const decision = pickAutoTransitionDecision(currentTrackId, nowMs);
    setLastAutoTransitionDecision(decision);
    if (decision.decision !== 'selected' || !decision.selectedCandidate) {
      maybeNoteAutoTransitionSkip(currentTrackId, decision);
      return;
    }
    const candidate = decision.selectedCandidate;

    const triggerAtMs = clampTimeToTrackDuration(
      pinnedSourceTimeMs ?? candidate.sourceTimeMs,
      playbackState.durationMs ?? undefined
    );
    const transitionStartMs = Math.max(0, triggerAtMs - autoTransitionLeadMsRef.current);
    const progressNowMs = playbackState.progressMs ?? 0;

    if (progressNowMs < Math.max(0, transitionStartMs - 300)) return;
    if (progressNowMs > triggerAtMs + AUTO_TRANSITION_MISS_WINDOW_MS) {
      autoTransitionedSourceTrackIdRef.current = currentTrackId;
      noteRuntimeEvent({
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
    maybeNoteAutoTransitionSkip,
    noteRuntimeEvent,
    pinnedSourceTimeMs,
    playbackState?.currentTrack?.id,
    playbackState?.durationMs,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    pickAutoTransitionDecision,
  ]);

  const currentTrack = playbackState?.currentTrack ?? null;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = playbackState?.durationMs ?? currentTrack?.durationMs ?? 0;
  const effectiveError = uiError ?? providerError;
  const autoDecisionSummary = useMemo(() => {
    if (!lastAutoTransitionDecision || lastAutoTransitionDecision.decision !== 'skipped') return null;
    const reasons = lastAutoTransitionDecision.gate.reasons.length > 0
      ? lastAutoTransitionDecision.gate.reasons.map(formatAutoDecisionReasonLabel).join(' + ')
      : 'Skor dusuk';
    return `Auto gecis atlandi: ${reasons}`;
  }, [lastAutoTransitionDecision]);

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      if (nameCompare !== 0) return nameCompare;
      return a.id.localeCompare(b.id);
    }),
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
  const benchmarkSeedTargetCount = useMemo(() => resolveBenchmarkSeedTargetCount({
    eligibleSeedCount: benchmarkEligibleSeedTrackIds.length,
    minimumSeedCount: MIN_BENCHMARK_SEED_COUNT,
    preferredSeedCount: PREFERRED_BENCHMARK_SEED_COUNT,
  }), [benchmarkEligibleSeedTrackIds.length]);
  const benchmarkSeedTrackIdsResolved = useMemo(() => benchmarkSeedTrackIds
    .map((trackId) => trackId.trim())
    .filter((trackId) => trackId.length > 0 && libraryTrackMap.has(trackId)), [benchmarkSeedTrackIds, libraryTrackMap]);
  const benchmarkRelevantTargetGaps = useMemo(
    () => buildRelevantTargetGaps(
      benchmarkSeedTrackIdsResolved,
      relevanceMap,
      REQUIRED_RELEVANT_TARGETS_PER_SEED
    ),
    [benchmarkSeedTrackIdsResolved, relevanceMap]
  );
  const benchmarkLabelGatePassed = benchmarkRelevantTargetGaps.length === 0;
  const allScopeRelevantTargetGaps = useMemo(
    () => buildRelevantTargetGaps(
      sortedLibrary.map((track) => track.id),
      relevanceMap,
      REQUIRED_RELEVANT_TARGETS_PER_SEED
    ),
    [relevanceMap, sortedLibrary]
  );
  const allScopeSeedsMissingAnalysis = useMemo(
    () => sortedLibrary
      .map((track) => track.id)
      .filter((trackId) => analysisStates[trackId]?.status !== 'ready'),
    [analysisStates, sortedLibrary]
  );
  const benchmarkSeedShortfallCount = useMemo(
    () => Math.max(0, MIN_BENCHMARK_SEED_COUNT - benchmarkEligibleSeedTrackIds.length),
    [benchmarkEligibleSeedTrackIds.length]
  );
  const autoLabelTargetSeedIds = useMemo(() => Array.from(new Set([
    ...allScopeRelevantTargetGaps.map((gap) => gap.trackId),
    ...allScopeSeedsMissingAnalysis,
  ])), [allScopeRelevantTargetGaps, allScopeSeedsMissingAnalysis]);
  const allScopeLabelGatePassed = allScopeRelevantTargetGaps.length === 0;
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
  const benchmarkRuntimeCalibration = useMemo(() => {
    // runtimeEventVersion is a rerender trigger after each runtime event write.
    void runtimeEventVersion;
    return getRuntimeGateCalibration({
      seedTrackIds: benchmarkSeedTrackIdsResolved,
      minCalibrationSampleCount: BENCHMARK_RUNTIME_CALIBRATION_MIN_SAMPLE_COUNT,
    });
  }, [benchmarkSeedTrackIdsResolved, runtimeEventVersion]);
  const benchmarkRuntimeThresholds: RuntimeGateThresholds = benchmarkRuntimeCalibration.thresholds;
  const benchmarkRuntimeDriftReport = useMemo(() => {
    // baselineHistory refresh after each baseline run; use it as drift report refresh trigger.
    void baselineHistory;
    return buildRuntimeThresholdDriftReport({
      scopeId: BENCHMARK_SCOPE_ID,
      windowSize: 8,
    });
  }, [baselineHistory]);

  useEffect(() => {
    if (benchmarkSeedTrackIds.length === 0) return;
    const nextBenchmarkSeedTrackIds = buildBenchmarkSeedSelection({
      existingSeedTrackIds: benchmarkSeedTrackIds,
      sortedLibrary,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
      targetSeedCount: benchmarkSeedTargetCount,
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
    benchmarkSeedTargetCount,
    relevanceMap,
    sortedLibrary,
  ]);

  useEffect(() => {
    if (benchmarkAutoBootstrapPaused) return;
    if (benchmarkSeedTrackIds.length > 0) return;
    if (benchmarkEligibleSeedTrackIds.length < MIN_BENCHMARK_SEED_COUNT) return;

    const autoSeedTrackIds = buildBenchmarkSeedSelection({
      existingSeedTrackIds: [],
      sortedLibrary,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
      targetSeedCount: benchmarkSeedTargetCount,
    });
    if (autoSeedTrackIds.length < MIN_BENCHMARK_SEED_COUNT) return;

    const persisted = setBenchmarkSeedTrackIds(autoSeedTrackIds);
    setBenchmarkSeedTrackIdsState(persisted);
  }, [
    analysisStates,
    benchmarkAutoBootstrapPaused,
    benchmarkEligibleSeedTrackIds.length,
    benchmarkSeedTargetCount,
    benchmarkSeedTrackIds.length,
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
    if (scope === 'benchmark' && seedTrackIds.length < MIN_BENCHMARK_SEED_COUNT) {
      setUiError(`Benchmark set en az ${MIN_BENCHMARK_SEED_COUNT} seed icermeli.`);
      return;
    }
    const relevantTargetGaps = buildRelevantTargetGaps(
      seedTrackIds,
      relevanceMap,
      REQUIRED_RELEVANT_TARGETS_PER_SEED
    );
    if (relevantTargetGaps.length > 0) {
      const missingSeedNames = relevantTargetGaps
        .map((gap) => {
          const trackName = libraryTrackMap.get(gap.trackId)?.name ?? gap.trackId;
          return `${trackName} (${gap.relevantTargetCount}/${REQUIRED_RELEVANT_TARGETS_PER_SEED}, +${gap.missingTargetCount})`;
        })
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
        enforceRuntimeGate: scope === 'benchmark',
        minTransitionRuntimeSampleCount: scope === 'benchmark'
          ? benchmarkRuntimeThresholds.minTransitionRuntimeSampleCount
          : undefined,
        maxTransitionLatencyP95Ms: scope === 'benchmark'
          ? benchmarkRuntimeThresholds.maxTransitionLatencyP95Ms
          : undefined,
        maxTransitionStallRate: scope === 'benchmark'
          ? benchmarkRuntimeThresholds.maxTransitionStallRate
          : undefined,
        maxTransitionDropRate: scope === 'benchmark'
          ? benchmarkRuntimeThresholds.maxTransitionDropRate
          : undefined,
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
    benchmarkRuntimeThresholds.maxTransitionDropRate,
    benchmarkRuntimeThresholds.maxTransitionLatencyP95Ms,
    benchmarkRuntimeThresholds.maxTransitionStallRate,
    benchmarkRuntimeThresholds.minTransitionRuntimeSampleCount,
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
    const maxSeedsPerPass = benchmarkSeedShortfallCount > 0 ? 2 : 1;
    const seedIdsForPass = candidateSeedIds.slice(0, maxSeedsPerPass);

    const run = async () => {
      setIsAutoLabeling(true);
      try {
        let nextMap = getTransitionRelevanceMap();
        let hasChanges = false;

        for (const seedId of seedIdsForPass) {
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
        if (activeTab === 'transition' && seedTrackId) {
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
    activeTab,
    sortedLibrary.length,
  ]);

  const handleGenerateBenchmarkSeedSet = useCallback(() => {
    const candidateSeedIds = buildBenchmarkSeedSelection({
      existingSeedTrackIds: benchmarkSeedTrackIds,
      sortedLibrary,
      analysisStates,
      relevanceMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
      targetSeedCount: benchmarkSeedTargetCount,
    });
    if (candidateSeedIds.length < MIN_BENCHMARK_SEED_COUNT) {
      setUiError(
        `Benchmark set icin en az ${MIN_BENCHMARK_SEED_COUNT} hazir+labelli seed gerekli (mevcut ${candidateSeedIds.length}).`
      );
      return;
    }

    const nextIds = setBenchmarkSeedTrackIds(candidateSeedIds);
    setBenchmarkSeedTrackIdsState(nextIds);
    setBenchmarkAutoBootstrapPaused(false);
    setUiError(null);
  }, [
    analysisStates,
    benchmarkSeedTargetCount,
    benchmarkSeedTrackIds,
    relevanceMap,
    sortedLibrary,
  ]);

  const handleClearBenchmarkSeedSet = useCallback(() => {
    clearBenchmarkSeedTrackIds();
    setBenchmarkSeedTrackIdsState([]);
    setBenchmarkAutoBootstrapPaused(true);
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

  const advancedToolsContent = (
    <>
      <div className="border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
              Dataset & Veri
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              Dataset import ve yerel veri bakım araçları
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleResetAllData()}
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-red-300 hover:border-red-400/50"
            title="Yerel verileri temizle"
          >
            Veriyi Temizle
          </button>
        </div>
        <input
          ref={datasetImportInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(event) => {
            void handleImportDatasetFile(event);
          }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenDatasetImportPicker}
            disabled={isDatasetImporting}
            className="px-3 py-2 border border-white/10 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-60"
            title="dataset/output/playlist.moodverter.json dosyasini secip kutuphaneye ekle"
          >
            {isDatasetImporting ? 'Dataset Yükleniyor...' : 'Dataset JSON Yükle'}
          </button>
          {datasetImportSummary && (
            <span className="text-[10px] text-emerald-300 truncate">{datasetImportSummary}</span>
          )}
        </div>
      </div>

      <div className="border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Transition Efekti
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Geçiş karakteri: {transitionEffectStyle}
        </div>
        <div className="flex items-center gap-2">
          {(['clean', 'ambient', 'punchy'] as const).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setTransitionEffectStyle(style)}
              className={`px-2 py-1 text-[10px] border ${
                transitionEffectStyle === style
                  ? 'border-emerald-300 text-emerald-300'
                  : 'border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              {style}
            </button>
          ))}
        </div>
      </div>

      <div className="border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Benchmark Durumu
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Set: {benchmarkSeedTrackIdsResolved.length}/{benchmarkSeedTargetCount}
          {' | '} Min {MIN_BENCHMARK_SEED_COUNT}
          {' | '} Hazır {benchmarkProgressReport.readySeedCount}/{benchmarkProgressReport.totalSeedCount}
          {' | '} Etiket eksiği {benchmarkRelevantTargetGaps.length}
          {' | '} Uygun {benchmarkEligibleSeedTrackIds.length}
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Runtime kalibrasyon: {benchmarkRuntimeCalibration.summary}
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Auto-skip: {formatOptionalPercent(baselineResult?.autoTransitionSkipRate)}
          {' | '} Karar örneği {baselineResult?.autoTransitionDecisionSampleCount ?? 0}
          {' | '} Skip {baselineResult?.autoTransitionSkippedCount ?? 0}
        </div>
        {baselineResult && baselineResult.topAutoTransitionSkipReasons.length > 0 && (
          <div className="text-[11px] text-amber-400">
            Top skip reasons: {baselineResult.topAutoTransitionSkipReasons.join(', ')}
          </div>
        )}
        {baselineResult && baselineResult.autoTransitionSkipBySeed.length > 0 && (
          <div className="text-[11px] text-[var(--color-text-secondary)] border border-white/10 bg-black/10 px-2 py-1 space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">
              Skip Drilldown (Seed)
            </div>
            {baselineResult.autoTransitionSkipBySeed.map((seed) => {
              const trackName = libraryTrackMap.get(seed.trackId)?.name ?? seed.trackId;
              const reasonSummary = seed.topSkipReasons.length > 0
                ? seed.topSkipReasons
                    .map((reason) => `${reason.reason} ${formatPercent(reason.rate)} (${reason.count})`)
                    .join(', ')
                : 'neden yok';
              return (
                <div key={seed.trackId} className="truncate">
                  {trackName}: skip {formatOptionalPercent(seed.skipRate)} ({seed.skippedCount}/{seed.decisionSampleCount}) • {reasonSummary}
                </div>
              );
            })}
          </div>
        )}
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Handoff profili: duck {handoffProfile.duckPercent}% • ramp {handoffProfile.rampMs}ms • hold {handoffProfile.holdMs}ms
        </div>
        {benchmarkRuntimeDriftReport && (
          <div className={`text-[11px] ${
            benchmarkRuntimeDriftReport.overallStatus === 'degrading'
              ? 'text-amber-400'
              : benchmarkRuntimeDriftReport.overallStatus === 'improving'
                ? 'text-emerald-300'
                : 'text-[var(--color-text-secondary)]'
          }`}>
            {benchmarkRuntimeDriftReport.summary}
          </div>
        )}
        {benchmarkRelevantTargetGaps.length > 0 && (
          <div className="text-[11px] text-amber-400">
            Öncelik: {benchmarkRelevantTargetGaps
              .map((gap) => {
                const trackName = libraryTrackMap.get(gap.trackId)?.name ?? gap.trackId;
                return `${trackName} (+${gap.missingTargetCount})`;
              })
              .join(', ')}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerateBenchmarkSeedSet}
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Benchmark Oluştur
          </button>
          <button
            type="button"
            onClick={handleClearBenchmarkSeedSet}
            disabled={benchmarkSeedTrackIdsResolved.length === 0}
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            Benchmark Temizle
          </button>
        </div>
      </div>

      <div className="border border-white/10 bg-white/5 p-3 space-y-2">
        <div className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
          Baseline Araçları
        </div>
        <div className="text-[11px] text-[var(--color-text-secondary)]">
          Değerlendirme: Hazır {evaluationProgressReport.readySeedCount}/{evaluationProgressReport.totalSeedCount}
          {' | '} Etiket kapısı {evaluationProgressReport.labelGatePassedSeedCount}/{evaluationProgressReport.totalSeedCount}
          {' | '} Etiket eksiği {evaluationProgressReport.seedsNeedingLabels.length}
          {' | '} Analiz eksiği {evaluationProgressReport.seedsMissingAnalysis.length}
        </div>
        {(evaluationProgressReport.seedsNeedingLabels.length > 0 || evaluationProgressReport.seedsMissingAnalysis.length > 0) && (
          <div className="text-[11px] text-amber-400">
            Öncelik: {formatTrackNames(
              evaluationProgressReport.seedsNeedingLabels.length > 0
                ? evaluationProgressReport.seedsNeedingLabels
                : evaluationProgressReport.seedsMissingAnalysis,
              libraryTrackMap
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void handleRunBaseline('selected')}
            disabled={isBaselineLoading || !seedTrackId || !selectedSeedLabelGatePassed}
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {isBaselineLoading && baselineScope === 'selected' ? 'Baseline...' : 'Kaynak Baseline'}
          </button>
          <button
            type="button"
            onClick={() => void handleRunBaseline('all')}
            disabled={isBaselineLoading || sortedLibrary.length === 0 || !allScopeLabelGatePassed}
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {isBaselineLoading && baselineScope === 'all' ? 'Baseline...' : 'Tüm Baseline'}
          </button>
          <button
            type="button"
            onClick={() => void handleRunBaseline('benchmark')}
            disabled={
              isBaselineLoading
              || benchmarkSeedTrackIdsResolved.length < MIN_BENCHMARK_SEED_COUNT
              || !benchmarkLabelGatePassed
            }
            className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
          >
            {isBaselineLoading && baselineScope === 'benchmark' ? 'Baseline...' : 'Benchmark Baseline'}
          </button>
        </div>

        {baselineResult && (
          <div className="text-[11px] text-[var(--color-text-secondary)] border border-white/10 bg-black/10 px-2 py-1">
            Özet: Hit@3 {formatOptionalPercent(baselineResult.hitAt3)}
            {' | '} Hit@5 {formatOptionalPercent(baselineResult.hitAt5)}
            {' | '} Mean@{baselineResult.limit} {formatPercent(baselineResult.meanTopKScore)}
            {' | '} Coverage {formatPercent(baselineResult.coverageRate)}
            {' | '} Etiketli {baselineResult.labeledSeedCount}
          </div>
        )}
        {baselineResult && baselineResult.transitionRuntimeSampleCount > 0 && (
          <div className="text-[11px] text-[var(--color-text-secondary)] border border-white/10 bg-black/10 px-2 py-1">
            Runtime: p95 {formatOptionalMs(baselineResult.transitionLatencyP95Ms)}
            {' | '} Stall {formatOptionalPercent(baselineResult.transitionStallRate)}
            {' | '} Drop {formatOptionalPercent(baselineResult.transitionDropRate)}
            {' | '} Örnek {baselineResult.transitionRuntimeSampleCount}
          </div>
        )}
        {baselineResult && (
          <div className={`text-[11px] border px-2 py-1 ${
            baselineResult.runtimeGatePassed
              ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
              : 'text-amber-400 border-amber-400/30 bg-amber-500/10'
          }`}>
            Runtime Gate {formatGateLabel(baselineResult.runtimeGatePassed)}
            {baselineResult.runtimeGateSummary ? ` | ${baselineResult.runtimeGateSummary}` : ''}
          </div>
        )}
        {baselineResult && (
          <div className={`text-[11px] border px-2 py-1 ${
            baselineResult.tuningValidationPassed
              ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10'
              : 'text-amber-400 border-amber-400/30 bg-amber-500/10'
          }`}>
            Tuning Gate {formatGateLabel(baselineResult.tuningValidationPassed)}
            {baselineResult.tuningValidationSummary ? ` | ${baselineResult.tuningValidationSummary}` : ' | ilk benchmark karşılaştırması'}
          </div>
        )}
        {baselineHistory.length > 0 && (
          <div className="text-[11px] text-[var(--color-text-secondary)] border border-white/10 bg-black/10 px-2 py-1">
            Son koşular: {baselineHistory.length}
            {' | '} Son Hit@3 {formatOptionalPercent(baselineHistory[0].hitAt3)}
            {' | '} Son Hit@5 {formatOptionalPercent(baselineHistory[0].hitAt5)}
            {' | '} Son p95 {formatOptionalMs(baselineHistory[0].transitionLatencyP95Ms)}
          </div>
        )}
        {baselineResult?.regressionSummary && (
          <div className="text-[11px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
            Regresyon: {baselineResult.regressionSummary}
          </div>
        )}
        {baselineResult?.relevanceTargetGateSummary && (
          <div className="text-[11px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
            Etiket kapısı: {baselineResult.relevanceTargetGateSummary}
          </div>
        )}
        {baselineResult && baselineResult.tuningActions.length > 0 && (
          <div className="text-[11px] text-[var(--color-text-secondary)] border border-emerald-500/30 bg-emerald-500/10 px-2 py-1">
            Tuning önerisi: {baselineResult.tuningActions
              .map((action) => {
                const trackName = libraryTrackMap.get(action.trackId)?.name ?? action.trackId;
                const gateHint = action.gateFailDistribution.length > 0
                  ? ` | gate: ${action.gateFailDistribution
                    .map((item) => `${item.reason} ${formatPercent(item.rate)}`)
                    .join(', ')}`
                  : '';
                return `${trackName} -> ${formatTuningIssue(action.issue)} (${formatPercent(action.confidence)})${gateHint}`;
              })
              .join(' | ')}
          </div>
        )}
      </div>
    </>
  );

  const pageContent =
    activeTab === 'library' ? (
      <LibraryPage
        urlInput={urlInput}
        playlistUrlInput={playlistUrlInput}
        isSubmittingUrl={isSubmittingUrl}
        isPlaylistAnalyzing={isPlaylistAnalyzing}
        isPlaylistImporting={isPlaylistImporting}
        playlistAnalysis={playlistAnalysis}
        playlistImportProgress={playlistImportProgress}
        playlistImportSummary={playlistImportSummary}
        onUrlInputChange={setUrlInput}
        onPlaylistUrlInputChange={handlePlaylistUrlInputChange}
        onUrlSubmit={handleSubmitUrl}
        onAnalyzePlaylist={() => {
          void handleAnalyzePlaylist();
        }}
        onImportPlaylist={() => {
          void handleImportAnalyzedPlaylist();
        }}
        onCancelPlaylistImport={handleCancelPlaylistImport}
        tracks={sortedLibrary}
        isClearingLibrary={isClearingLibrary}
        onClearAllTracks={() => {
          void handleClearAllFromLibrary();
        }}
        analysisStates={analysisStates}
        onPlayTrack={(trackId) => {
          void handlePlayFromLibrary(trackId);
        }}
        onRemoveTrack={(trackId) => {
          void handleRemoveFromLibrary(trackId);
        }}
        onSelectSearchResult={(track) => {
          void handleSelectSearchResult(track);
        }}
        onAddSearchResultToLibrary={(track) => {
          void handleAddSearchResultToLibrary(track);
        }}
        initialScrollTop={libraryScrollTopRef.current}
        onLibraryScrollTopChange={(scrollTop) => {
          libraryScrollTopRef.current = scrollTop;
        }}
      />
    ) : activeTab === 'transition' ? (
      <TransitionPage
        currentTrack={currentTrack}
        transitionCandidates={transitionCandidates}
        libraryTrackMap={libraryTrackMap}
        isTransitionLoading={isTransitionLoading}
        transitionError={transitionError}
        isAutoTransitioning={isAutoTransitioning}
        autoTransitionLeadMs={autoTransitionLeadMs}
        lastAutoTransitionLatencyMs={lastAutoTransitionLatencyMs}
        autoDecisionSummary={autoDecisionSummary}
        onRefreshCandidates={() => {
          void refreshTransitionCandidates();
        }}
        onNowTransition={(candidate) => {
          void handleNowTransition(candidate);
        }}
      />
    ) : activeTab === 'history' ? (
      <HistoryPage />
    ) : (
      <SettingsPage advancedContent={advancedToolsContent} />
    );

  return (
    <AppFrame
      title="Moodverter"
      playerBar={(
        <PlayerBar
          currentTrack={currentTrack}
          progressMs={progressMs}
          durationMs={durationMs}
          isLoading={isLoading}
          errorMessage={effectiveError}
          isPlaying={Boolean(playbackState?.isPlaying)}
          onPrevious={() => { void previous(); }}
          onPlayPause={() => { void handlePlayPause(); }}
          onNext={() => { void skip(); }}
          onSeek={(value) => { void seek(value); }}
          formatTime={formatTime}
        />
      )}
      tabBar={(
        <BottomTabBar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
        />
      )}
    >
      {pageContent}
    </AppFrame>
  );
}

export default App;
