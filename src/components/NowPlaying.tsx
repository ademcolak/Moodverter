import { memo, useRef, useState, useCallback } from 'react';
import { Track } from '../types/track';

interface NowPlayingProps {
  track: Track | null;
  progress: number;
  duration: number;
  transitionPoint?: number;
  isAnalyzing?: boolean;
  onSeek?: (positionMs: number) => void;
}

export const NowPlaying = memo(function NowPlaying({ track, progress, duration, isAnalyzing, onSeek }: NowPlayingProps) {
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

  if (!track) {
    return (
      <div className="flex items-center gap-4 p-4 bg-[var(--color-surface)] border border-white/10">
        <div className="w-14 h-14 bg-[var(--color-surface-light)] flex items-center justify-center">
          <span className="text-xl text-[var(--color-text-secondary)]">🎵</span>
        </div>
        <div className="flex-1">
          <p className="text-sm text-[var(--color-text-secondary)]">Şarkı seçilmedi</p>
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
      <div className="flex items-center gap-4 mb-4">
        {track.albumArt ? (
          <img
            src={track.albumArt}
            alt={track.name}
            className="w-14 h-14 object-cover shrink-0"
          />
        ) : (
          <div className="w-14 h-14 bg-[var(--color-surface-light)] flex items-center justify-center shrink-0">
            <span className="text-xl">🎵</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className="text-sm font-semibold text-[var(--color-text-primary)] truncate"
              title={track.name}
            >
              {track.name}
            </h3>
            {isAnalyzing && (
              <div className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse" />
            )}
          </div>
          <p
            className="text-xs text-[var(--color-text-secondary)] truncate"
            title={track.artist}
          >
            {track.artist}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div
          ref={progressBarRef}
          className="h-1 bg-white/10 cursor-pointer"
          onClick={handleProgressClick}
          onMouseDown={handleMouseDown}
        >
          <div
            className="h-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${isDragging ? (dragProgress / duration) * 100 : progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-[var(--color-text-secondary)]">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
});