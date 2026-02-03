import { memo, useRef, useState, useCallback } from 'react';
import { Track } from '../types/track';

interface NowPlayingProps {
  track: Track | null;
  progress: number;
  duration: number;
  transitionPoint?: number;
  isAnalyzing?: boolean;
  isPlaying?: boolean;
  onSeek?: (positionMs: number) => void;
  onPlayPause?: () => void;
  onSkipNext?: () => void;
  onSkipPrevious?: () => void;
}

export const NowPlaying = memo(function NowPlaying({
  track,
  progress,
  duration,
  isAnalyzing,
  isPlaying,
  onSeek,
  onPlayPause,
  onSkipNext,
  onSkipPrevious,
}: NowPlayingProps) {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragProgress, setDragProgress] = useState(0);

  const calculatePositionFromEvent = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!progressBarRef.current || duration <= 0) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = x / rect.width;
    return Math.floor(percent * duration);
  }, [duration]);

  const handleProgressClick = useCallback((e: React.MouseEvent) => {
    if (!onSeek) return;
    const position = calculatePositionFromEvent(e);
    onSeek(position);
  }, [onSeek, calculatePositionFromEvent]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onSeek) return;
    setIsDragging(true);
    setDragProgress(calculatePositionFromEvent(e));

    const handleMouseMove = (e: MouseEvent) => {
      setDragProgress(calculatePositionFromEvent(e));
    };

    const handleMouseUp = (e: MouseEvent) => {
      const position = calculatePositionFromEvent(e);
      onSeek(position);
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [onSeek, calculatePositionFromEvent]);

  const [isHovering, setIsHovering] = useState(false);

  if (!track) {
    return (
      <div className="p-4 bg-[var(--color-surface)] border border-white/10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[var(--color-surface-light)] flex items-center justify-center shrink-0">
            <span className="text-lg text-[var(--color-text-secondary)]">🎵</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-[var(--color-text-secondary)]">Şarkı seçilmedi</p>
          </div>
          {/* Playback controls even when no track */}
          {onPlayPause && (
            <div className="flex items-center gap-2">
              <button
                onClick={onSkipPrevious}
                className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors opacity-50"
                disabled
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
              </button>
              <button
                onClick={onPlayPause}
                className="w-10 h-10 bg-[var(--color-primary)]/50 flex items-center justify-center text-white transition-all"
                disabled
              >
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
              </button>
              <button
                onClick={onSkipNext}
                className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors opacity-50"
                disabled
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 bg-[var(--color-surface)] border border-white/10">
      <div className="flex items-center gap-3">
        {/* Album art */}
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt={track.name}
            className="w-12 h-12 object-cover shrink-0"
          />
        ) : (
          <div className="w-12 h-12 bg-[var(--color-surface-light)] flex items-center justify-center shrink-0">
            <span className="text-lg">🎵</span>
          </div>
        )}

        {/* Track info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold text-[var(--color-text-primary)] truncate"
              title={track.name}
            >
              {track.name}
            </h3>
            {isAnalyzing && (
              <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse shrink-0" />
            )}
          </div>
          <p
            className="text-xs text-[var(--color-text-secondary)] truncate"
            title={track.artist}
          >
            {track.artist}
          </p>
        </div>

        {/* Playback controls */}
        {onPlayPause && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onSkipPrevious}
              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button
              onClick={onPlayPause}
              className="w-10 h-10 bg-[var(--color-primary)] flex items-center justify-center text-white hover:bg-[var(--color-primary-dark)] active:scale-95 transition-all"
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              ) : (
                <svg className="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
              )}
            </button>
            <button
              onClick={onSkipNext}
              className="p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Progress bar - improved */}
      <div className="mt-3 space-y-1">
        <div
          ref={progressBarRef}
          className="relative h-1.5 bg-white/10 cursor-pointer group"
          onClick={handleProgressClick}
          onMouseDown={handleMouseDown}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => !isDragging && setIsHovering(false)}
        >
          {/* Progress fill */}
          <div
            className="h-full bg-[var(--color-primary)] transition-all relative"
            style={{ width: `${isDragging ? (dragProgress / duration) * 100 : progressPercent}%` }}
          >
            {/* Thumb/handle on hover or drag */}
            {(isHovering || isDragging) && (
              <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3 h-3 bg-[var(--color-primary)] rounded-full shadow-lg" />
            )}
          </div>
          {/* Hover expand effect */}
          <div className="absolute inset-0 bg-transparent group-hover:bg-white/5 transition-colors" />
        </div>

        <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
          <span>{formatTime(isDragging ? dragProgress : progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
});