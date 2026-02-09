import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LibrarySearch } from './components/LibrarySearch';
import type { UnifiedTrack } from './types/provider';
import type { YouTubeSearchResult } from './services/youtube/search';
import { clearYouTubeLocalData, searchResultToUnifiedTrack } from './services/youtube/search';
import { getYouTubeProvider } from './services/providers/youtube';
import { useProvider } from './hooks/useProvider';
import {
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  computeMeanTransitionScore,
  findTransitionCandidates,
  getAnalysisState,
  type AnalysisState,
  type BaselineEvaluationResult,
  runBaselineEvaluation,
  type TransitionCandidate,
} from './services/transition';

const ONE_TIME_DATA_RESET_KEY = 'moodverter_data_reset_20260209';

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
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [showTransitionPanel, setShowTransitionPanel] = useState(false);
  const [isBaselineLoading, setIsBaselineLoading] = useState(false);
  const [baselineResult, setBaselineResult] = useState<BaselineEvaluationResult | null>(null);

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
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(ONE_TIME_DATA_RESET_KEY) === '1') return;

    clearYouTubeLocalData();
    clearTransitionData();
    window.localStorage.setItem(ONE_TIME_DATA_RESET_KEY, '1');

    setLibrary([]);
    setAnalysisStates({});
    setSeedTrackId(null);
    setTransitionCandidates([]);
    setBaselineResult(null);
    setTransitionError(null);
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
    if (seedTrackId) return;
    if (playbackState?.currentTrack?.id) {
      setSeedTrackId(playbackState.currentTrack.id);
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
      const candidates = await findTransitionCandidates({ trackId: seedTrackId, limit: 5 });
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
  }, [seedTrackId]);

  useEffect(() => {
    if (!showTransitionPanel) return;
    void refreshTransitionCandidates();
  }, [refreshTransitionCandidates, showTransitionPanel]);

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

  const currentTrack = playbackState?.currentTrack ?? null;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = playbackState?.durationMs ?? currentTrack?.durationMs ?? 0;
  const effectiveError = providerError ?? uiError;

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => b.playCount - a.playCount),
    [library]
  );
  const libraryTrackMap = useMemo(
    () => new Map(library.map((track) => [track.id, track])),
    [library]
  );
  const meanCandidateScore = useMemo(
    () => computeMeanTransitionScore(transitionCandidates),
    [transitionCandidates]
  );

  const handleRunBaseline = useCallback(async () => {
    setIsBaselineLoading(true);
    try {
      const result = await runBaselineEvaluation({
        seedTrackIds: sortedLibrary.map((track) => track.id),
        limit: 5,
        goodThreshold: 0.6,
      });
      setBaselineResult(result);
    } catch (error) {
      console.error('Failed to run baseline evaluation:', error);
      setUiError('Baseline degerlendirmesi basarisiz oldu.');
    } finally {
      setIsBaselineLoading(false);
    }
  }, [sortedLibrary]);

  const handleResetAllData = useCallback(async () => {
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.logout();

      clearYouTubeLocalData();
      clearTransitionData();

      setLibrary([]);
      setAnalysisStates({});
      setSeedTrackId(null);
      setTransitionCandidates([]);
      setBaselineResult(null);
      setTransitionError(null);
      setUiError(null);
      setUrlInput('');
      setIsSubmittingUrl(false);

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

      <div className="flex-1 overflow-hidden p-4 space-y-4">
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

        <section className="bg-[var(--color-surface)] border border-white/10 p-3 flex-1 overflow-hidden flex flex-col">
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
            <div className="border border-white/10 bg-[var(--color-background)] p-2 mb-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">Seed</span>
                <select
                  value={seedTrackId ?? ''}
                  onChange={(event) => setSeedTrackId(event.target.value || null)}
                  className="flex-1 bg-white/5 border border-white/10 text-xs text-[var(--color-text-primary)] px-2 py-1"
                >
                  <option value="">Seciniz</option>
                  {sortedLibrary.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.name} - {track.artist}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    if (!seedTrackId) return;
                    void handleAnalyzeTrack(seedTrackId);
                  }}
                  disabled={!seedTrackId}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  Seed Analiz
                </button>
              </div>

              <div className="text-[10px] text-[var(--color-text-secondary)]">
                MeanScore@{transitionCandidates.length}: {formatPercent(meanCandidateScore)}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => void handleRunBaseline()}
                  disabled={isBaselineLoading || sortedLibrary.length === 0}
                  className="px-2 py-1 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-50"
                >
                  {isBaselineLoading ? 'Baseline...' : 'Baseline Calistir'}
                </button>
                {baselineResult && (
                  <div className="text-[10px] text-[var(--color-text-secondary)]">
                    Coverage {formatPercent(baselineResult.coverageRate)} | Good {formatPercent(baselineResult.goodCandidateRate)}
                  </div>
                )}
              </div>

              {baselineResult && (
                <div className="text-[10px] text-[var(--color-text-secondary)] border border-white/10 bg-white/5 px-2 py-1">
                  Top1 {formatPercent(baselineResult.meanTop1Score)} | Top{baselineResult.limit} {formatPercent(baselineResult.meanTopKScore)} | Seed {baselineResult.seedWithCandidates}/{baselineResult.seedCount}
                </div>
              )}

              {isTransitionLoading ? (
                <div className="text-xs text-[var(--color-text-secondary)]">Transition adaylari hesaplanıyor...</div>
              ) : transitionError ? (
                <div className="text-xs text-amber-400">{transitionError}</div>
              ) : (
                <div className="space-y-1 max-h-24 overflow-y-auto">
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
                            Score {formatPercent(candidate.score.finalScore)} | Event {formatPercent(candidate.score.eventMatchScore)}
                          </div>
                          <button
                            onClick={() => void handlePlayTransitionCandidate(candidate)}
                            className="px-2 py-0.5 text-[10px] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                            title="Bu adayi cal"
                          >
                            Cal
                          </button>
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
            <div className="flex-1 overflow-y-auto space-y-1">
              {sortedLibrary.map((track) => (
                <div key={track.id} className="flex items-center gap-2 p-2 bg-white/5 border border-transparent hover:border-white/10">
                  <button
                    onClick={() => void handlePlayFromLibrary(track.id)}
                    className="w-8 h-8 bg-[var(--color-primary)] text-white text-xs hover:bg-[var(--color-primary-dark)] shrink-0"
                    title="Cal"
                  >
                    ▶
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-[var(--color-text-primary)] truncate">{track.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)] truncate">
                      {track.artist} • analiz: {analysisStates[track.id]?.status ?? 'yok'}
                    </div>
                  </div>
                  <button
                    onClick={() => setSeedTrackId(track.id)}
                    className="px-2 py-1 text-xs border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    title="Seed yap"
                  >
                    Seed
                  </button>
                  <button
                    onClick={() => void handleAnalyzeTrack(track.id)}
                    className="px-2 py-1 text-xs border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                    title="Analiz et"
                  >
                    Analiz
                  </button>
                  <button
                    onClick={() => void handleRemoveFromLibrary(track.id)}
                    className="px-2 py-1 text-xs text-[var(--color-text-secondary)] border border-white/10 hover:text-red-400 hover:border-red-500/50"
                    title="Kaldir"
                  >
                    Sil
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
              {playbackState?.isPlaying ? 'Duraklat' : 'Cal'}
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
