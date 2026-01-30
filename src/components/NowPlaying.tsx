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

export const NowPlaying = memo(function NowPlaying({ track, progress, duration, transitionPoint, isAnalyzing, onSeek }: NowPlayingProps) {
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
      <div className="flex items-center gap-4 p-4 bg-[var(--color-surface)] border border-white/5">
        <div className="w-16 h-16 bg-[var(--color-surface-light)] animate-pulse" />
        <div className="flex-1">
          <div className="h-4 bg-[var(--color-surface-light)] w-3/4 mb-2 animate-pulse" />
          <div className="h-3 bg-[var(--color-surface-light)] w-1/2 animate-pulse" />
        </div>
      </div>
    );
  }

  const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;
  const transitionPercent = transitionPoint && duration > 0 
    ? (transitionPoint / duration) * 100 
    : null;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-5 glass-panel group transition-all duration-500 hover:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.7)]">
      <div className="flex items-center gap-5 mb-6">
        {track.albumArt ? (
          <div className="relative shrink-0">
            <div className="absolute -inset-2 bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
            <img 
              src={track.albumArt} 
              alt={track.name}
              className="relative w-20 h-20 object-cover shadow-2xl transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="w-20 h-20 bg-[var(--color-surface-light)] flex items-center justify-center shadow-inner">
            <span className="text-3xl animate-bounce-slow">🎵</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 
              className="text-lg font-black text-gradient truncate cursor-default leading-tight uppercase"
              title={track.name}
            >
              {track.name}
            </h3>
            {isAnalyzing && (
              <div className="flex gap-0.5 items-end h-3 mb-1">
                {[...Array(3)].map((_, i) => (
                  <div 
                    key={i}
                    className="w-1 bg-[var(--color-primary)] animate-pulse"
                    style={{ 
                      height: `${40 + Math.random() * 60}%`,
                      animationDelay: `${i * 0.15}s`
                    }}
                  />
                ))}
              </div>
            )}
          </div>
          <p 
            className="text-[var(--color-text-secondary)] text-sm font-bold uppercase tracking-wider truncate cursor-default opacity-80"
            title={track.artist}
          >
            {track.artist}
          </p>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="space-y-3">
        <div className="relative h-2 group/progress">
          <div
            ref={progressBarRef}
            className="absolute inset-0 bg-white/5 overflow-hidden cursor-pointer"
            onClick={handleProgressClick}
            onMouseDown={handleMouseDown}
          >
            <div
              className="h-full bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] transition-all duration-300 relative"
              style={{ width: `${isDragging ? (dragProgress / duration) * 100 : progressPercent}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-8 bg-white/20 blur-md" />
            </div>
          </div>

          {/* Transition point marker */}
          {transitionPercent && (
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white shadow-[0_0_8px_white] z-10"
              style={{ left: `${transitionPercent}%` }}
            />
          )}
        </div>
        
        <div className="flex justify-between items-center text-[10px] font-black text-[var(--color-text-secondary)] uppercase tracking-widest opacity-50">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
});