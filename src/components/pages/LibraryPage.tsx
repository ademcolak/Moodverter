import type { ChangeEvent, FormEvent } from 'react';
import { LibrarySearch } from '../LibrarySearch';
import type { AnalysisState } from '../../services/transition';
import type { YouTubeSearchResult } from '../../services/youtube/search';
import type { UnifiedTrack } from '../../types/provider';

export interface LibraryPageProps {
  urlInput: string;
  isSubmittingUrl: boolean;
  onUrlInputChange: (value: string) => void;
  onUrlSubmit: (event: FormEvent<HTMLFormElement>) => void;
  tracks: UnifiedTrack[];
  analysisStates: Record<string, AnalysisState>;
  onPlayTrack: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
  onSelectSearchResult: (track: YouTubeSearchResult) => void;
  onAddSearchResultToLibrary: (track: YouTubeSearchResult) => void;
}

export function LibraryPage({
  urlInput,
  isSubmittingUrl,
  onUrlInputChange,
  onUrlSubmit,
  tracks,
  analysisStates,
  onPlayTrack,
  onRemoveTrack,
  onSelectSearchResult,
  onAddSearchResultToLibrary,
}: LibraryPageProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
      <section className="bg-[var(--color-surface)] border border-white/10 p-3">
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)] mb-2">
          YouTube Link Ekle
        </h2>
        <form onSubmit={onUrlSubmit} className="flex gap-2">
          <input
            value={urlInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) => onUrlInputChange(event.target.value)}
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
            onTrackSelect={onSelectSearchResult}
            onAddToLibrary={onAddSearchResultToLibrary}
          />
        </div>
      </section>

      <section className="bg-[var(--color-surface)] border border-white/10 p-3 flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-2 gap-2">
          <h2 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            Kütüphane
          </h2>
          <span className="text-[10px] text-[var(--color-text-secondary)]">{tracks.length} şarkı</span>
        </div>

        {tracks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-sm text-[var(--color-text-secondary)]">
            Henüz şarkı eklenmedi.
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
            {tracks.map((track) => (
              <div
                key={track.id}
                role="button"
                tabIndex={0}
                onClick={() => onPlayTrack(track.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onPlayTrack(track.id);
                  }
                }}
                className="flex items-center gap-2 p-2 bg-white/5 border border-transparent hover:border-white/10 cursor-pointer"
                title="Şarkıyı oynat"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[var(--color-text-primary)] truncate">{track.name}</div>
                  <div className="text-xs text-[var(--color-text-secondary)] truncate">
                    {track.artist} • analiz: {analysisStates[track.id]?.status ?? 'yok'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemoveTrack(track.id);
                  }}
                  className="px-2 py-1 text-xs text-[var(--color-text-secondary)] border border-white/10 hover:text-red-400 hover:border-red-500/50"
                  title="Şarkıyı kaldır"
                >
                  Kaldır
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
