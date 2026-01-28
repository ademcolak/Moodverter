import { memo } from 'react';
import { Track } from '../types/track';

interface NowPlayingProps {
  track: Track | null;
  progress: number;
  duration: number;
  transitionPoint?: number;
}

export const NowPlaying = memo(function NowPlaying({ track, progress, duration, transitionPoint }: NowPlayingProps) {
  if (!track) {
    return (
      <div className="flex items-center gap-4 p-4 bg-[var(--color-surface)] rounded-lg">
        <div className="w-16 h-16 bg-[var(--color-surface-light)] rounded-md animate-pulse" />
        <div className="flex-1">
          <div className="h-4 bg-[var(--color-surface-light)] rounded w-3/4 mb-2 animate-pulse" />
          <div className="h-3 bg-[var(--color-surface-light)] rounded w-1/2 animate-pulse" />
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
    <div className="p-4 bg-[var(--color-surface)] rounded-lg hover:bg-[var(--color-surface-light)] transition-colors duration-200 group">
      <div className="flex items-center gap-4 mb-3">
        {track.albumArt ? (
          <div className="relative">
            <img 
              src={track.albumArt} 
              alt={track.name}
              className="w-16 h-16 rounded-md object-cover shadow-lg group-hover:shadow-xl transition-shadow duration-200"
            />
            {/* Album art hover glow effect */}
            <div className="absolute inset-0 rounded-md bg-[var(--color-primary)] opacity-0 group-hover:opacity-10 transition-opacity duration-200" />
          </div>
        ) : (
          <div className="w-16 h-16 bg-[var(--color-surface-light)] rounded-md flex items-center justify-center group-hover:bg-[var(--color-background)] transition-colors">
            <span className="text-2xl">🎵</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 
            className="text-[var(--color-text-primary)] font-semibold truncate cursor-default"
            title={track.name}
          >
            {track.name}
          </h3>
          <p 
            className="text-[var(--color-text-secondary)] text-sm truncate cursor-default hover:text-[var(--color-primary)] transition-colors"
            title={track.artist}
          >
            {track.artist}
          </p>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="relative group/progress">
        <div className="h-1 bg-[var(--color-background)] rounded-full overflow-hidden cursor-pointer group-hover/progress:h-1.5 transition-all duration-150">
          <div 
            className="h-full bg-[var(--color-primary)] transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        
        {/* Transition point marker */}
        {transitionPercent && (
          <div 
            className="absolute top-0 w-0.5 h-3 -mt-1 bg-yellow-400 rounded cursor-help group/marker"
            style={{ left: `${transitionPercent}%` }}
          >
            {/* Tooltip for transition point */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-0.5 
                            bg-yellow-400 text-black text-xs rounded whitespace-nowrap
                            opacity-0 group-hover/marker:opacity-100 pointer-events-none transition-opacity">
              Transition
            </div>
          </div>
        )}
        
        <div className="flex justify-between mt-1 text-xs text-[var(--color-text-secondary)]">
          <span>{formatTime(progress)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
});
