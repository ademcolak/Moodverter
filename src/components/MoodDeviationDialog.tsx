import { MoodDeviation } from '../types/mood';
import { Track } from '../types/track';

interface MoodDeviationDialogProps {
  isOpen: boolean;
  deviation: MoodDeviation | null;
  track: Track | null;
  onAdaptMood: () => void;
  onKeepMood: () => void;
  onDismiss: () => void;
}

export const MoodDeviationDialog = ({
  isOpen,
  deviation,
  track,
  onAdaptMood,
  onKeepMood,
  onDismiss,
}: MoodDeviationDialogProps) => {
  if (!isOpen || !deviation || !track) return null;

  const deviationPercent = Math.round(deviation.deviationScore * 100);
  
  // Determine which parameters changed most
  const getSignificantChanges = () => {
    const changes: string[] = [];
    const energyDiff = Math.abs(deviation.fromMood.energy - deviation.toTrack.energy);
    const valenceDiff = Math.abs(deviation.fromMood.valence - deviation.toTrack.valence);
    
    if (energyDiff > 0.3) {
      changes.push(deviation.toTrack.energy > deviation.fromMood.energy ? 'more energetic' : 'calmer');
    }
    if (valenceDiff > 0.3) {
      changes.push(deviation.toTrack.valence > deviation.fromMood.valence ? 'happier' : 'more melancholic');
    }
    
    return changes;
  };

  const changes = getSignificantChanges();
  const changeDescription = changes.length > 0 
    ? `This track is ${changes.join(' and ')} than your current mood.`
    : `This track differs ${deviationPercent}% from your mood.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onDismiss}
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-[320px] bg-[var(--color-surface)] rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="px-4 py-3 bg-[var(--color-surface-light)] border-b border-white/5">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Mood Change Detected
          </h3>
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Track info */}
          <div className="flex items-center gap-3">
            {track.albumArt && (
              <img 
                src={track.albumArt} 
                alt={track.name}
                className="w-12 h-12 rounded-lg object-cover"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                {track.name}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">
                {track.artist}
              </p>
            </div>
          </div>
          
          {/* Deviation indicator */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-[var(--color-background)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[var(--color-primary)] to-amber-500 rounded-full transition-all"
                style={{ width: `${Math.min(deviationPercent * 2, 100)}%` }}
              />
            </div>
            <span className="text-xs text-[var(--color-text-secondary)] w-12 text-right">
              {deviationPercent}%
            </span>
          </div>
          
          {/* Description */}
          <p className="text-xs text-[var(--color-text-secondary)]">
            {changeDescription}
          </p>
          
          {/* Question */}
          <p className="text-sm text-[var(--color-text-primary)]">
            Would you like to update your mood?
          </p>
        </div>
        
        {/* Actions */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={onKeepMood}
            className="flex-1 px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] 
                       bg-[var(--color-background)] hover:bg-[var(--color-surface-light)]
                       rounded-lg transition-colors"
          >
            Keep Mood
          </button>
          <button
            onClick={onAdaptMood}
            className="flex-1 px-3 py-2 text-sm font-medium text-white
                       bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]
                       rounded-lg transition-colors"
          >
            Adapt Mood
          </button>
        </div>
      </div>
    </div>
  );
};
