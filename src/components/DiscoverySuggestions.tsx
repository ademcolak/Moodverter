import type { UnifiedTrack } from '../types/provider';

interface DiscoverySuggestionsProps {
  suggestions: UnifiedTrack[];
  isLoading: boolean;
  onSelect: (track: UnifiedTrack) => void;
  onQueue: (track: UnifiedTrack) => void;
  onBlock: (track: UnifiedTrack) => void;
  onAddToLibrary: (track: UnifiedTrack) => void;
  onDismiss: () => void;
  onLoadMore?: () => void;
  autoplayCountdownSec?: number | null;
}

export const DiscoverySuggestions = ({
  suggestions,
  isLoading,
  onSelect,
  onQueue,
  onBlock,
  onAddToLibrary,
  onDismiss,
  onLoadMore,
  autoplayCountdownSec,
}: DiscoverySuggestionsProps) => {
  return (
    <div className="bg-[var(--color-surface)] border border-white/10">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="text-sm">💡</span>
          <span className="text-xs text-[var(--color-text-primary)]">Kesif Onerileri</span>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          aria-label="Kapat"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="px-3 py-2 text-[10px] text-[var(--color-text-secondary)]">
        Kutuphanende bu mood'a uygun sarki az. Iste sana birkac oneri:
      </div>

      {typeof autoplayCountdownSec === 'number' && autoplayCountdownSec > 0 && (
        <div className="px-3 pb-2 text-[10px] text-[var(--color-primary)]">
          Sessizlik olusmamasi icin {autoplayCountdownSec}s sonra ilk oneri calinacak.
        </div>
      )}

      {isLoading ? (
        <div className="px-3 py-4 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="px-3 py-4 text-[10px] text-[var(--color-text-secondary)]">
          Su an uygun oneri bulunamadi.
        </div>
      ) : (
        <div className="px-2 pb-2 space-y-1">
          {suggestions.map((track) => (
            <div
              key={`${track.provider}:${track.id}`}
              className="flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs text-[var(--color-text-primary)] truncate">
                  {track.name}
                </div>
                <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                  {track.artist}
                </div>
              </div>
              <button
                onClick={() => onAddToLibrary(track)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                title="Kutuphaneye ekle"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              <button
                onClick={() => onQueue(track)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                title="Siraya al"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h10" />
                </svg>
              </button>
              <button
                onClick={() => onBlock(track)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-red-400"
                title="Bu oneri engelle"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
                </svg>
              </button>
              <button
                onClick={() => onSelect(track)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                title="Hemen cal"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7L8 5z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {onLoadMore && !isLoading && (
        <div className="px-3 pb-3">
          <button
            onClick={onLoadMore}
            className="text-[10px] text-[var(--color-primary)] hover:underline"
          >
            Daha fazla goster
          </button>
        </div>
      )}
    </div>
  );
};
