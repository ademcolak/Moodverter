import { useState, KeyboardEvent } from 'react';

interface MoodInputProps {
  onMoodSubmit: (mood: string) => void;
  isProcessing: boolean;
}

export const MoodInput = ({ onMoodSubmit, isProcessing }: MoodInputProps) => {
  const [mood, setMood] = useState('');

  const handleSubmit = () => {
    if (mood.trim() && !isProcessing) {
      onMoodSubmit(mood.trim());
      setMood('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="w-full">
      <div className="relative">
        <input
          type="text"
          value={mood}
          onChange={(e) => setMood(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="How are you feeling?"
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
