import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LibrarySearch } from './components/LibrarySearch';
import type { UnifiedTrack } from './types/provider';
import type { YouTubeSearchResult } from './services/youtube/search';
import { clearYouTubeLocalData, searchResultToUnifiedTrack } from './services/youtube/search';
import { getYouTubeProvider } from './services/providers/youtube';
import { useProvider } from './hooks/useProvider';
import {
  analyzeTrackWithHeuristicV1,
  buildEvaluationProgressReport,
  clearBenchmarkSeedTrackIds,
  clearTransitionData,
  clearManualListeningChecklistMap,
  computeMeanTransitionScore,
  findTransitionCandidates,
  getAnalysisState,
  getBaselineRunHistory,
  getBenchmarkSeedTrackIds,
  getManualListeningChecklistMap,
  getTransitionRelevanceMap,
  setTransitionRelevanceMap,
  setBenchmarkSeedTrackIds,
  type AnalysisState,
  type BaselineEvaluationResult,
  type BaselineRunArtifact,
  type EvaluationProgressReport,
  type ManualListeningChecklistMap,
  type TransitionRelevanceMap,
  runBaselineEvaluation,
  type TransitionCandidate,
} from './services/transition';

const ONE_TIME_DATA_RESET_KEY = 'moodverter_data_reset_20260209';
type BaselineScope = 'selected' | 'all' | 'benchmark';
const REQUIRED_RELEVANT_TARGETS_PER_SEED = 2;
const TARGET_BENCHMARK_SEED_COUNT = 10;
const AUTO_TRANSITION_LEAD_MS = 900;

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const [manualListeningChecklistMap, setManualListeningChecklistMap] = useState<ManualListeningChecklistMap>({});
  const autoLabelSkippedSeedIdsRef = useRef<Set<string>>(new Set());
  const autoTransitionedSourceTrackIdRef = useRef<string | null>(null);

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
    setManualListeningChecklistMap(getManualListeningChecklistMap());
    setBenchmarkSeedTrackIdsState(getBenchmarkSeedTrackIds());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(ONE_TIME_DATA_RESET_KEY) === '1') return;

    clearYouTubeLocalData();
    clearTransitionData();
    clearManualListeningChecklistMap();
    window.localStorage.setItem(ONE_TIME_DATA_RESET_KEY, '1');

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
    setManualListeningChecklistMap({});
    setBenchmarkSeedTrackIdsState([]);
    void refreshLibrary();
  }, [refreshLibrary]);

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

  const handlePlayTransitionCandidate = useCallback(async (candidate: TransitionCandidate) => {
    setUiError(null);
    try {
      const targetTrack = library.find((track) => track.id === candidate.targetTrackId);
      const targetTimeMs = clampTimeToTrackDuration(candidate.targetTimeMs, targetTrack?.durationMs);
      await play(candidate.targetTrackId);
      await wait(450);
      await seek(targetTimeMs);
      // second seek improves reliability while YT iframe finalizes state
      await wait(250);
      await seek(targetTimeMs);
    } catch (error) {
      console.error('Failed to play transition candidate:', error);
      setUiError('Transition adayi calinamadi.');
    }
  }, [library, play, seek]);

  const handlePreviewTransitionAB = useCallback(async (candidate: TransitionCandidate) => {
    setUiError(null);
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
    }
  }, [library, play, seek]);

  useEffect(() => {
    const currentTrackId = playbackState?.currentTrack?.id ?? null;
    if (!currentTrackId || !playbackState?.isPlaying) return;
    if (autoTransitionedSourceTrackIdRef.current === currentTrackId) return;

    const candidate = transitionCandidates.find((item) => item.sourceTrackId === currentTrackId);
    if (!candidate) return;

    const triggerAtMs = clampTimeToTrackDuration(
      pinnedSourceTimeMs ?? candidate.sourceTimeMs,
      playbackState.durationMs ?? undefined
    );
    const transitionStartMs = Math.max(0, triggerAtMs - AUTO_TRANSITION_LEAD_MS);
    const progressNowMs = playbackState.progressMs ?? 0;

    if (progressNowMs < Math.max(0, transitionStartMs - 300)) return;
    if (progressNowMs > triggerAtMs + 3000) {
      autoTransitionedSourceTrackIdRef.current = currentTrackId;
      return;
    }

    autoTransitionedSourceTrackIdRef.current = currentTrackId;
    void (async () => {
      setIsAutoTransitioning(true);
      await handlePlayTransitionCandidate(candidate);
      setIsAutoTransitioning(false);
    })();
  }, [
    handlePlayTransitionCandidate,
    pinnedSourceTimeMs,
    playbackState?.currentTrack?.id,
    playbackState?.durationMs,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    transitionCandidates,
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
  const allScopeLabelGatePassed = allScopeSeedsBelowRelevantMinimum.length === 0;
  const evaluationProgressReport: EvaluationProgressReport = useMemo(() => {
    const seedTrackIds = Array.from(new Set([
      ...sortedLibrary.map((track) => track.id),
      ...Object.keys(relevanceMap),
      ...Object.keys(manualListeningChecklistMap),
      ...Object.keys(analysisStates),
    ]));
    return buildEvaluationProgressReport({
      seedTrackIds,
      analysisStates,
      relevanceMap,
      manualChecklistMap: manualListeningChecklistMap,
      requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
    });
  }, [analysisStates, manualListeningChecklistMap, relevanceMap, sortedLibrary]);
  const benchmarkProgressReport: EvaluationProgressReport = useMemo(() => buildEvaluationProgressReport({
    seedTrackIds: benchmarkSeedTrackIdsResolved,
    analysisStates,
    relevanceMap,
    manualChecklistMap: manualListeningChecklistMap,
    requiredRelevantTargetsPerSeed: REQUIRED_RELEVANT_TARGETS_PER_SEED,
  }), [
    analysisStates,
    benchmarkSeedTrackIdsResolved,
    manualListeningChecklistMap,
    relevanceMap,
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
        scopeId: scope === 'benchmark' ? 'benchmark-v1' : undefined,
        enforceRegressionGate: scope === 'benchmark',
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

  const extractAutoRelevantTargetIds = useCallback(async (seedId: string): Promise<string[]> => {
    const candidates = await findTransitionCandidates({
      trackId: seedId,
      limit: 10,
    });
    return Array.from(new Set(candidates.map((candidate) => candidate.targetTrackId)))
      .filter((targetTrackId) => targetTrackId !== seedId)
      .slice(0, REQUIRED_RELEVANT_TARGETS_PER_SEED);
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
    autoLabelSkippedSeedIdsRef.current.clear();
  }, [sortedLibraryIdSignature]);

  useEffect(() => {
    if (sortedLibrary.length < 2 || isAutoLabeling) return;
    const candidateSeedIds = allScopeSeedsBelowRelevantMinimum.filter(
      (seedId) => !autoLabelSkippedSeedIdsRef.current.has(seedId)
    );
    if (candidateSeedIds.length === 0) return;

    const run = async () => {
      setIsAutoLabeling(true);
      try {
        let nextMap = getTransitionRelevanceMap();
        let hasChanges = false;

        for (const seedId of candidateSeedIds) {
          await ensureTrackAnalyzed(seedId);
          const autoTargets = await extractAutoRelevantTargetIds(seedId);
          if (autoTargets.length === 0) {
            autoLabelSkippedSeedIdsRef.current.add(seedId);
            continue;
          }

          const previousTargets = nextMap[seedId] ?? [];
          const mergedTargets = Array.from(new Set([...previousTargets, ...autoTargets]));
          if (mergedTargets.length !== previousTargets.length) {
            nextMap = { ...nextMap, [seedId]: mergedTargets };
            hasChanges = true;
          }

          if (mergedTargets.length >= REQUIRED_RELEVANT_TARGETS_PER_SEED) {
            autoLabelSkippedSeedIdsRef.current.delete(seedId);
          } else {
            autoLabelSkippedSeedIdsRef.current.add(seedId);
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
    allScopeSeedsBelowRelevantMinimum,
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
    const candidateSeedIds = sortedLibrary
      .filter((track) => analysisStates[track.id]?.status === 'ready')
      .slice(0, TARGET_BENCHMARK_SEED_COUNT)
      .map((track) => track.id);
    if (candidateSeedIds.length < TARGET_BENCHMARK_SEED_COUNT) {
      setUiError(
        `Benchmark set olusturmak icin en az ${TARGET_BENCHMARK_SEED_COUNT} hazir analizli seed gerekli.`
      );
      return;
    }

    const nextIds = setBenchmarkSeedTrackIds(candidateSeedIds);
    setBenchmarkSeedTrackIdsState(nextIds);
    setUiError(null);
  }, [analysisStates, sortedLibrary]);

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
      clearManualListeningChecklistMap();
      clearBenchmarkSeedTrackIds();

      setLibrary([]);
      setAnalysisStates({});
      setSeedTrackId(null);
      setTransitionCandidates([]);
      setPinnedSourceTimeMs(null);
      setSourceSliderTimeMs(0);
      setBaselineResult(null);
      setBaselineHistory([]);
      setTransitionError(null);
      setUiError(null);
      setUrlInput('');
      setIsSubmittingUrl(false);
      setRelevanceMap({});
      setManualListeningChecklistMap({});
      setBenchmarkSeedTrackIdsState([]);

      await refreshLibrary();
      await youtubeProvider.authenticate();
      await refreshLibrary();
    } catch (error) {
      console.error('Failed to reset local data:', error);
      setUiError('Veri temizleme basarisiz oldu.');
    }
  }, [refreshLibrary]);

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
            YouTube Linki Ekle ve Cal
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
                {showTransitionPanel ? 'Transition Gizle' : 'Transition Goster'}
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
                  Kaynak Analiz
                </button>
              </div>

              <div className="text-[10px] text-[var(--color-text-secondary)]">
                MeanScore@{transitionCandidates.length}: {formatPercent(meanCandidateScore)}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                Oto Gecis: {isAutoTransitioning ? 'gecis yapiliyor...' : 'aktif'}
              </div>
              <div className="text-[10px] text-[var(--color-text-secondary)]">
                Label Durumu: {selectedSeedRelevantTargets.length}/{REQUIRED_RELEVANT_TARGETS_PER_SEED}
              </div>
              <div className="border border-white/10 bg-white/5 px-2 py-1 space-y-1">
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Eval Progress: Ready {evaluationProgressReport.readySeedCount}/{evaluationProgressReport.totalSeedCount}
                  {' | '}
                  Label Gate {evaluationProgressReport.labelGatePassedSeedCount}/{evaluationProgressReport.totalSeedCount}
                </div>
                {evaluationProgressReport.seedsNeedingLabels.length > 0 && (
                  <div className="text-[10px] text-amber-400 truncate">
                    Label eksigi: {formatTrackNames(evaluationProgressReport.seedsNeedingLabels, libraryTrackMap)}
                  </div>
                )}
                {evaluationProgressReport.seedsMissingAnalysis.length > 0 && (
                  <div className="text-[10px] text-amber-400 truncate">
                    Analiz eksigi: {formatTrackNames(evaluationProgressReport.seedsMissingAnalysis, libraryTrackMap)}
                  </div>
                )}
              </div>
              <div className="border border-white/10 bg-white/5 px-2 py-1 space-y-1">
                <div className="text-[10px] text-[var(--color-text-secondary)]">
                  Benchmark Set: {benchmarkSeedTrackIdsResolved.length}/{TARGET_BENCHMARK_SEED_COUNT}
                  {' | '}
                  Ready {benchmarkProgressReport.readySeedCount}/{benchmarkProgressReport.totalSeedCount}
                </div>
                {benchmarkSeedsBelowRelevantMinimum.length > 0 && (
                  <div className="text-[10px] text-amber-400 truncate">
                    Benchmark label eksigi: {formatTrackNames(benchmarkSeedsBelowRelevantMinimum, libraryTrackMap)}
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
                  {isBaselineLoading && baselineScope === 'selected' ? 'Baseline...' : 'Seed Baseline'}
                </button>
                <button
                  onClick={() => void handleRunBaseline('all')}
                  disabled={isBaselineLoading || sortedLibrary.length === 0 || !allScopeLabelGatePassed}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {isBaselineLoading && baselineScope === 'all' ? 'Baseline...' : 'Tum Seed Baseline'}
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
                {baselineResult && (
                  <div className="text-[10px] text-[var(--color-text-secondary)]">
                    Scope {baselineScope === 'selected' ? 'Seed' : baselineScope === 'all' ? 'Tum' : 'Benchmark'}
                    {' | '}
                    Coverage {formatPercent(baselineResult.coverageRate)}
                    {' | '}
                    Good {formatPercent(baselineResult.goodCandidateRate)}
                  </div>
                )}
              </div>

              {baselineResult && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Top1 {formatPercent(baselineResult.meanTop1Score)} | Top{baselineResult.limit} {formatPercent(baselineResult.meanTopKScore)} | Seed {baselineResult.seedWithCandidates}/{baselineResult.seedCount}
                </div>
              )}
              {baselineResult && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Hit@3 {formatOptionalPercent(baselineResult.hitAt3)} | Hit@5 {formatOptionalPercent(baselineResult.hitAt5)} | Labelled Seed {baselineResult.labeledSeedCount}
                </div>
              )}
              {baselineHistory.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Son runlar: {baselineHistory.length} | Son Hit@3 {formatOptionalPercent(baselineHistory[0].hitAt3)} | Son Hit@5 {formatOptionalPercent(baselineHistory[0].hitAt5)}
                </div>
              )}
              {baselineResult?.regressionSummary && (
                <div className="text-[10px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
                  Regression gate: {baselineResult.regressionSummary}
                </div>
              )}
              {baselineResult?.relevanceTargetGateSummary && (
                <div className="text-[10px] text-amber-400 border border-amber-400/30 bg-amber-500/10 px-2 py-1">
                  Label gate: {baselineResult.relevanceTargetGateSummary}
                </div>
              )}
              {baselineResult && baselineResult.bottomSeeds.length > 0 && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Bottom-{baselineResult.bottomSeeds.length} seed:{' '}
                  {baselineResult.bottomSeeds
                    .map((seed) => {
                      const trackName = libraryTrackMap.get(seed.trackId)?.name ?? seed.trackId;
                      return `${trackName} (${formatPercent(seed.meanTopKScore)})`;
                    })
                    .join(' | ')}
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
                            Score {formatPercent(candidate.score.finalScore)} | Event {formatPercent(candidate.score.eventMatchScore)} | Driver {candidate.diagnostic.primaryDriver}
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
              Transition paneli kapali. Gormek icin "Transition Goster" butonunu kullan.
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
