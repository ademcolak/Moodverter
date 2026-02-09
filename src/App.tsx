import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { LibrarySearch } from './components/LibrarySearch';
import type { UnifiedTrack } from './types/provider';
import type { YouTubeSearchResult } from './services/youtube/search';
import { searchResultToUnifiedTrack } from './services/youtube/search';
import { getYouTubeProvider } from './services/providers/youtube';
import { useProvider } from './hooks/useProvider';

function formatTime(ms: number): string {
  if (!ms || ms < 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

function App() {
  const {
    provider,
    isLoading,
    error: providerError,
    playbackState,
    play,
    pause,
    resume,
    skip,
    previous,
    seek,
  } = useProvider();

  const [library, setLibrary] = useState<UnifiedTrack[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);

  const refreshLibrary = useCallback(async () => {
    if (!provider) return;
    try {
      const tracks = await provider.getLibrary();
      setLibrary(tracks);
    } catch (error) {
      console.error('Failed to refresh YouTube library:', error);
      setUiError('Kutuphane yuklenemedi.');
    }
  }, [provider]);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  const handlePlayPause = useCallback(async () => {
    if (playbackState?.isPlaying) {
      await pause();
      return;
    }
    await resume();
  }, [pause, playbackState?.isPlaying, resume]);

  const handleSelectSearchResult = useCallback(async (track: YouTubeSearchResult) => {
    setUiError(null);
    try {
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
      await play(addedTrack.id);
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

  const currentTrack = playbackState?.currentTrack ?? null;
  const progressMs = playbackState?.progressMs ?? 0;
  const durationMs = playbackState?.durationMs ?? currentTrack?.durationMs ?? 0;
  const effectiveError = providerError ?? uiError;

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => b.playCount - a.playCount),
    [library]
  );

  return (
    <div className="w-full h-screen bg-[var(--color-background)] overflow-hidden flex flex-col border border-white/10">
      <div
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 bg-[var(--color-surface)] no-select cursor-default relative z-20 shrink-0 border-b border-white/10"
      >
        <span data-tauri-drag-region className="text-sm font-semibold text-[var(--color-text-primary)] pointer-events-none">
          Moodverter
        </span>
        <span className="text-xs text-[var(--color-text-secondary)]">
          YouTube • {library.length} sarki
        </span>
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
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
            Kutuphane
          </h2>

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
                    <div className="text-xs text-[var(--color-text-secondary)] truncate">{track.artist}</div>
                  </div>
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
