// Mood related types

// New format - used by mood engine
export interface MoodParams {
  energy: number;         // 0.0 - 1.0
  valence: number;        // 0.0 - 1.0 (positivity)
  danceability: number;   // 0.0 - 1.0
  tempo: { min: number; max: number }; // BPM range
  acousticness?: number;  // 0.0 - 1.0 (optional)
  instrumentalness?: number; // 0.0 - 1.0 (optional)
}

// Legacy format - for backwards compatibility
export interface MoodParameters {
  energy: number;         // 0.0 - 1.0
  valence: number;        // 0.0 - 1.0 (positivity)
  danceability: number;   // 0.0 - 1.0
  acousticness: number;   // 0.0 - 1.0
  tempo_min: number;      // BPM
  tempo_max: number;      // BPM
}

export interface MoodInput {
  text: string;
  timestamp: number;
}

export interface MoodHistory {
  inputs: MoodInput[];
  parameters: MoodParameters[];
}

export interface MoodDeviation {
  fromMood: MoodParameters;
  toTrack: {
    energy: number;
    valence: number;
    danceability: number;
    acousticness: number;
    tempo: number;
  };
  deviationScore: number;
  isSignificant: boolean;
}

export interface MoodState {
  current: MoodParameters | null;
  history: MoodHistory;
  isProcessing: boolean;
  error: string | null;
}

// Preset moods for future feature
export interface MoodPreset {
  id: string;
  name: string;
  emoji: string;
  parameters: MoodParameters;
}

export const DEFAULT_MOOD_PRESETS: MoodPreset[] = [
  {
    id: 'energetic',
    name: 'Energetic',
    emoji: '⚡',
    parameters: {
      energy: 0.9,
      valence: 0.8,
      danceability: 0.8,
      acousticness: 0.1,
      tempo_min: 120,
      tempo_max: 180,
    },
  },
  {
    id: 'chill',
    name: 'Chill',
    emoji: '😌',
    parameters: {
      energy: 0.3,
      valence: 0.6,
      danceability: 0.4,
      acousticness: 0.6,
      tempo_min: 60,
      tempo_max: 100,
    },
  },
  {
    id: 'melancholic',
    name: 'Melancholic',
    emoji: '🌧️',
    parameters: {
      energy: 0.3,
      valence: 0.2,
      danceability: 0.3,
      acousticness: 0.5,
      tempo_min: 60,
      tempo_max: 90,
    },
  },
  {
    id: 'happy',
    name: 'Happy',
    emoji: '😊',
    parameters: {
      energy: 0.7,
      valence: 0.9,
      danceability: 0.7,
      acousticness: 0.3,
      tempo_min: 100,
      tempo_max: 140,
    },
  },
  {
    id: 'focused',
    name: 'Focused',
    emoji: '🎯',
    parameters: {
      energy: 0.5,
      valence: 0.5,
      danceability: 0.3,
      acousticness: 0.4,
      tempo_min: 80,
      tempo_max: 120,
    },
  },
];
