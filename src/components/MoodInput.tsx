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
    <div className="w-full space-y-5">
      {/* Preset mood buttons */}
      <div className="flex flex-wrap gap-2 justify-center">
        {PRESET_MOODS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset.mood)}
            disabled={isProcessing}
            className="px-4 py-2 bg-white/5 border border-white/5
                       text-xs font-bold text-[var(--color-text-secondary)]
                       hover:text-white hover:bg-white/10 hover:border-white/10
                       active:scale-95 transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed
                       flex items-center gap-2 group shadow-sm"
            title={preset.mood}
          >
            <span className="text-sm group-hover:scale-110 transition-transform">{preset.icon}</span>
            <span className="uppercase tracking-wider">{preset.label}</span>
          </button>
        ))}
      </div>

      {/* Custom mood input */}
      <div className="relative group">
        <div className="absolute -inset-1 bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-accent)] blur opacity-20 group-focus-within:opacity-40 transition duration-500"></div>
        <div className="relative">
          <input
            type="text"
            value={mood}
            onChange={(e) => setMood(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="How's the vibe today?"
            disabled={isProcessing}
            className="w-full px-5 py-4 bg-[var(--color-surface)]
                       text-[var(--color-text-primary)] placeholder-white/20
                       border border-white/10 focus:border-[var(--color-primary)]/50
                       focus:outline-none transition-all duration-300
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-inner text-lg font-medium"
          />
          <button
            onClick={handleSubmit}
            disabled={!mood.trim() || isProcessing}
            className="absolute right-2 top-1/2 -translate-y-1/2
                       w-12 h-12 flex items-center justify-center
                       btn-primary text-white
                       disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-none animate-spin" />
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};