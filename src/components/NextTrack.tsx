import { memo } from 'react';
import { Track } from '../types/track';

interface NextTrackProps {
  track: Track | null;
  transitionIn?: number;
}

export const NextTrack = memo(function NextTrack({ track, transitionIn }: NextTrackProps) {
  if (!track) {
    return null;
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-3 bg-[var(--color-surface)] rounded-lg border border-[var(--color-surface-light)]">
      <div className="flex items-center gap-3">
        <div className="text-[var(--color-text-secondary)] text-xs uppercase tracking-wider">
          Next
        </div>
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {track.albumArt ? (
            <img 
              src={track.albumArt} 
              alt={track.name}
              className="w-8 h-8 rounded object-cover"
            />
          ) : (
            <div className="w-8 h-8 bg-[var(--color-surface-light)] rounded flex items-center justify-center">
              <span className="text-sm">🎵</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[var(--color-text-primary)] text-sm truncate">
              {track.name}
            </p>
            <p className="text-[var(--color-text-secondary)] text-xs truncate">
              {track.artist}
            </p>
          </div>
        </div>
        {transitionIn !== undefined && transitionIn > 0 && (
          <div className="text-[var(--color-text-secondary)] text-xs">
            in {formatTime(transitionIn)}
          </div>
        )}
      </div>
    </div>
  );
});
