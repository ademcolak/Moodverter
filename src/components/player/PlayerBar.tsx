import type { UnifiedTrack } from '../../types/provider';

function PreviousIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="currentColor">
      <rect x="3" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M18.5 6.2v11.6c0 .7-.8 1.1-1.4.7L9 13.2a1 1 0 0 1 0-1.7l8.1-5.3c.6-.4 1.4 0 1.4.7Z" />
      <path d="M13.5 6.2v11.6c0 .7-.8 1.1-1.4.7L4 13.2a1 1 0 0 1 0-1.7l8.1-5.3c.6-.4 1.4 0 1.4.7Z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="currentColor">
      <rect x="18.5" y="5" width="2.5" height="14" rx="0.5" />
      <path d="M5.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.1-5.3a1 1 0 0 0 0-1.7L6.9 5.5c-.6-.4-1.4 0-1.4.7Z" />
      <path d="M10.5 6.2v11.6c0 .7.8 1.1 1.4.7l8.1-5.3a1 1 0 0 0 0-1.7l-8.1-5.3c-.6-.4-1.4 0-1.4.7Z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" aria-hidden="true" fill="currentColor">
      <path d="M7 5.8v12.4c0 .8.9 1.3 1.6.8l9.4-6.2a1 1 0 0 0 0-1.7L8.6 5c-.7-.5-1.6 0-1.6.8Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden="true" fill="currentColor">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export interface PlayerBarProps {
  currentTrack: UnifiedTrack | null;
  progressMs: number;
  durationMs: number;
  isLoading: boolean;
  errorMessage: string | null;
  isPlaying: boolean;
  onPrevious: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onSeek: (positionMs: number) => void;
  formatTime: (ms: number) => string;
}

export function PlayerBar({
  currentTrack,
  progressMs,
  durationMs,
  isLoading,
  errorMessage,
  isPlaying,
  onPrevious,
  onPlayPause,
  onNext,
  onSeek,
  formatTime,
}: PlayerBarProps) {
  return (
    <div className="border-t border-white/10 bg-[var(--color-surface)] p-3 space-y-2">
      {errorMessage && (
        <div className="px-2 py-1 text-xs text-red-400 border border-red-500/30 bg-red-500/10">
          {errorMessage}
        </div>
      )}

      <div className="flex items-center gap-3">
        {currentTrack?.albumArt ? (
          <img src={currentTrack.albumArt} alt={currentTrack.name} className="w-10 h-10 object-cover" />
        ) : (
          <div className="w-10 h-10 bg-white/10 flex items-center justify-center text-xs text-[var(--color-text-secondary)]">
            YT
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm text-[var(--color-text-primary)] truncate">
            {currentTrack?.name ?? 'Şarkı seç'}
          </div>
          <div className="text-xs text-[var(--color-text-secondary)] truncate">
            {currentTrack?.artist ?? 'YouTube player hazır'}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onPrevious}
            aria-label="Önceki"
            title="Önceki"
            className="w-10 h-10 inline-flex items-center justify-center border border-white/10 text-[var(--color-text-primary)] hover:bg-white/5"
          >
            <PreviousIcon />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            aria-label={isPlaying ? 'Duraklat' : 'Oynat'}
            title={isPlaying ? 'Duraklat' : 'Oynat'}
            className="w-10 h-10 inline-flex items-center justify-center border border-[var(--color-primary)] bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]"
          >
            {isPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="Sonraki"
            title="Sonraki"
            className="w-10 h-10 inline-flex items-center justify-center border border-white/10 text-[var(--color-text-primary)] hover:bg-white/5"
          >
            <NextIcon />
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <input
          type="range"
          min={0}
          max={Math.max(durationMs, 0)}
          value={Math.min(progressMs, Math.max(durationMs, 0))}
          onChange={(event) => onSeek(Number(event.target.value))}
          className="w-full accent-[var(--color-primary)]"
        />
        <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
          <span>{formatTime(progressMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>

      {isLoading && (
        <div className="text-[10px] text-[var(--color-text-secondary)]">Player hazırlanıyor...</div>
      )}
    </div>
  );
}
