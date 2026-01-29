import { useState, KeyboardEvent } from 'react';

interface MoodInputProps {
  onMoodSubmit: (mood: string) => void;
  isProcessing: boolean;
}

// Preset mood options with icons
const PRESET_MOODS = [
  { label: 'Energetic', icon: '⚡', mood: 'energetic upbeat' },
  { label: 'Chill', icon: '🌙', mood: 'chill relaxed calm' },
  { label: 'Focus', icon: '🎯', mood: 'focused concentration instrumental' },
  { label: 'Party', icon: '🎉', mood: 'party dance upbeat happy' },
  { label: 'Happy', icon: '😊', mood: 'happy cheerful positive' },
  { label: 'Sad', icon: '💙', mood: 'sad melancholic emotional' },
];

export const MoodInput = ({ onMoodSubmit, isProcessing }: MoodInputProps) => {
  const [mood, setMood] = useState('');

  const handleSubmit = () => {
    if (mood.trim() && !isProcessing) {
      onMoodSubmit(mood.trim());
      setMood('');
    }
  };

  const handlePresetClick = (presetMood: string) => {
    if (!isProcessing) {
      onMoodSubmit(presetMood);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="w-full space-y-3">
      {/* Preset mood buttons */}
      <div className="flex flex-wrap gap-2">
        {PRESET_MOODS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset.mood)}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-[var(--color-surface)] rounded-full
                       text-sm text-[var(--color-text-primary)]
                       hover:bg-[var(--color-surface-hover)]
                       active:scale-95 transition-all duration-150
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-1.5"
            title={preset.mood}
          >
            <span>{preset.icon}</span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Custom mood input */}
      <div className="relative">
        <input
          type="text"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Or describe your mood..."
          disabled={isProcessing}
          className="w-full px-4 py-3 bg-[var(--color-surface)] rounded-lg
                     text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]
                     border border-transparent focus:border-[var(--color-primary)]
                     focus:outline-none transition-all duration-200
                     disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          onClick={handleSubmit}
          disabled={!mood.trim() || isProcessing}
          className="absolute right-2 top-1/2 -translate-y-1/2
                     px-4 py-1.5 bg-[var(--color-primary)] rounded-md
                     text-white text-sm font-medium
                     hover:bg-[var(--color-primary-dark)] transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? '...' : 'Go'}
        </button>
      </div>
    </div>
  );
};
