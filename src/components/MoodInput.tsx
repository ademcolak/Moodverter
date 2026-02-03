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
    <div className="w-full space-y-6">
      {/* Custom mood input - TOP */}
      <div className="flex gap-2">
        <input
          type="text"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Bugün nasıl hissediyorsun?"
          disabled={isProcessing}
          className="flex-1 px-4 py-3 bg-[var(--color-surface)]
                     text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)]/50
                     border border-white/10 focus:border-[var(--color-primary)]
                     focus:outline-none transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed
                     text-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={!mood.trim() || isProcessing}
          className="w-11 h-11 flex items-center justify-center shrink-0
                     bg-[var(--color-primary)] text-white
                     hover:bg-[var(--color-primary-dark)] transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          )}
        </button>
      </div>

      {/* Preset mood buttons - BOTTOM */}
      <div className="grid grid-cols-3 gap-1.5">
        {PRESET_MOODS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset.mood)}
            disabled={isProcessing}
            className="px-2 py-1.5 bg-[var(--color-surface)] border border-white/10
                       text-[11px] font-medium text-[var(--color-text-secondary)]
                       hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] hover:border-white/20
                       active:scale-95 transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center justify-center gap-1"
            title={preset.mood}
          >
            <span className="text-xs">{preset.icon}</span>
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};