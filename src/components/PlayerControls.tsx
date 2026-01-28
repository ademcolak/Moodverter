import { memo } from 'react';

interface PlayerControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onSkipNext: () => void;
  onSkipPrevious: () => void;
  disabled?: boolean;
}

// Tooltip wrapper component
const Tooltip = ({ 
  children, 
  text 
}: { 
  children: React.ReactNode; 
  text: string;
}) => (
  <div className="relative group">
    {children}
    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 
                    bg-[var(--color-surface-light)] text-[var(--color-text-primary)] 
                    text-xs rounded shadow-lg whitespace-nowrap
                    opacity-0 group-hover:opacity-100 pointer-events-none
                    transition-opacity duration-200 z-10">
      {text}
      <div className="absolute top-full left-1/2 -translate-x-1/2 
                      border-4 border-transparent border-t-[var(--color-surface-light)]" />
    </div>
  </div>
);

export const PlayerControls = memo(function PlayerControls({
  isPlaying,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
  disabled = false,
}: PlayerControlsProps) {
  return (
    <div className="flex items-center justify-center gap-6">
      {/* Previous */}
      <Tooltip text="Previous">
        <button
          onClick={onSkipPrevious}
          disabled={disabled}
          className="p-2 text-[var(--color-text-secondary)] 
                     hover:text-[var(--color-text-primary)] hover:scale-110
                     active:scale-95
                     transition-all duration-150 
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          aria-label="Previous track"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6V6zm3.5 6l8.5 6V6l-8.5 6z" />
          </svg>
        </button>
      </Tooltip>

      {/* Play/Pause */}
      <Tooltip text={isPlaying ? 'Pause' : 'Play'}>
        <button
          onClick={onPlayPause}
          disabled={disabled}
          className="p-3 bg-[var(--color-text-primary)] rounded-full 
                     hover:scale-110 hover:shadow-lg hover:shadow-white/20
                     active:scale-95
                     transition-all duration-150
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:hover:shadow-none"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <svg className="w-6 h-6 text-[var(--color-background)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-[var(--color-background)]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7L8 5z" />
            </svg>
          )}
        </button>
      </Tooltip>

      {/* Next */}
      <Tooltip text="Next">
        <button
          onClick={onSkipNext}
          disabled={disabled}
          className="p-2 text-[var(--color-text-secondary)] 
                     hover:text-[var(--color-text-primary)] hover:scale-110
                     active:scale-95
                     transition-all duration-150 
                     disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          aria-label="Next track"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm2 0V6l6.5 6L8 18zM16 6v12h2V6h-2z" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
});
