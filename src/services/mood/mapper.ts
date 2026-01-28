import { MoodParameters } from '../../types/mood';

// Keyword-based mood mapping (fallback when AI is unavailable)
const MOOD_KEYWORDS: Record<string, Partial<MoodParameters>> = {
  // Energy keywords
  'energetic': { energy: 0.9, valence: 0.8, tempo_min: 120, tempo_max: 180 },
  'hype': { energy: 0.95, valence: 0.85, danceability: 0.9, tempo_min: 130, tempo_max: 180 },
  'pumped': { energy: 0.9, valence: 0.7, danceability: 0.8, tempo_min: 120, tempo_max: 160 },
  'workout': { energy: 0.9, valence: 0.7, danceability: 0.85, tempo_min: 125, tempo_max: 170 },
  'party': { energy: 0.85, valence: 0.9, danceability: 0.9, tempo_min: 115, tempo_max: 140 },
  
  // Calm keywords
  'calm': { energy: 0.2, valence: 0.5, acousticness: 0.6, tempo_min: 60, tempo_max: 90 },
  'peaceful': { energy: 0.15, valence: 0.6, acousticness: 0.7, tempo_min: 55, tempo_max: 85 },
  'relaxed': { energy: 0.25, valence: 0.6, acousticness: 0.5, tempo_min: 60, tempo_max: 95 },
  'chill': { energy: 0.3, valence: 0.6, danceability: 0.4, tempo_min: 70, tempo_max: 100 },
  'sleepy': { energy: 0.1, valence: 0.4, acousticness: 0.7, tempo_min: 50, tempo_max: 75 },
  
  // Happy keywords
  'happy': { energy: 0.7, valence: 0.9, danceability: 0.7, tempo_min: 100, tempo_max: 140 },
  'joyful': { energy: 0.75, valence: 0.95, danceability: 0.7, tempo_min: 105, tempo_max: 145 },
  'cheerful': { energy: 0.65, valence: 0.85, danceability: 0.65, tempo_min: 95, tempo_max: 130 },
  'upbeat': { energy: 0.7, valence: 0.8, danceability: 0.75, tempo_min: 110, tempo_max: 140 },
  'positive': { energy: 0.6, valence: 0.8, tempo_min: 90, tempo_max: 130 },
  
  // Sad keywords
  'sad': { energy: 0.25, valence: 0.15, acousticness: 0.5, tempo_min: 55, tempo_max: 85 },
  'melancholic': { energy: 0.3, valence: 0.2, acousticness: 0.45, tempo_min: 60, tempo_max: 90 },
  'heartbroken': { energy: 0.2, valence: 0.1, acousticness: 0.5, tempo_min: 50, tempo_max: 80 },
  'nostalgic': { energy: 0.35, valence: 0.4, acousticness: 0.4, tempo_min: 65, tempo_max: 95 },
  'lonely': { energy: 0.2, valence: 0.2, acousticness: 0.5, tempo_min: 55, tempo_max: 85 },
  
  // Angry keywords
  'angry': { energy: 0.9, valence: 0.2, acousticness: 0.1, tempo_min: 130, tempo_max: 180 },
  'aggressive': { energy: 0.95, valence: 0.15, acousticness: 0.05, tempo_min: 140, tempo_max: 190 },
  'frustrated': { energy: 0.7, valence: 0.25, acousticness: 0.2, tempo_min: 110, tempo_max: 150 },
  'intense': { energy: 0.85, valence: 0.35, acousticness: 0.15, tempo_min: 120, tempo_max: 160 },
  
  // Focus keywords
  'focused': { energy: 0.5, valence: 0.5, danceability: 0.3, tempo_min: 80, tempo_max: 120 },
  'productive': { energy: 0.55, valence: 0.55, danceability: 0.35, tempo_min: 85, tempo_max: 125 },
  'studying': { energy: 0.35, valence: 0.5, acousticness: 0.4, tempo_min: 70, tempo_max: 100 },
  'coding': { energy: 0.45, valence: 0.5, danceability: 0.3, tempo_min: 75, tempo_max: 115 },
  'working': { energy: 0.5, valence: 0.5, danceability: 0.3, tempo_min: 80, tempo_max: 120 },
  
  // Romantic keywords
  'romantic': { energy: 0.4, valence: 0.7, acousticness: 0.5, tempo_min: 70, tempo_max: 110 },
  'love': { energy: 0.45, valence: 0.75, acousticness: 0.45, tempo_min: 75, tempo_max: 115 },
  'sensual': { energy: 0.35, valence: 0.65, acousticness: 0.4, tempo_min: 65, tempo_max: 100 },
  
  // Adventure/Epic keywords
  'epic': { energy: 0.8, valence: 0.6, acousticness: 0.2, tempo_min: 100, tempo_max: 150 },
  'adventure': { energy: 0.75, valence: 0.7, acousticness: 0.25, tempo_min: 95, tempo_max: 140 },
  'triumphant': { energy: 0.85, valence: 0.8, acousticness: 0.2, tempo_min: 110, tempo_max: 150 },
  
  // Turkish keywords
  'enerjik': { energy: 0.9, valence: 0.8, tempo_min: 120, tempo_max: 180 },
  'sakin': { energy: 0.2, valence: 0.5, acousticness: 0.6, tempo_min: 60, tempo_max: 90 },
  'mutlu': { energy: 0.7, valence: 0.9, danceability: 0.7, tempo_min: 100, tempo_max: 140 },
  'üzgün': { energy: 0.25, valence: 0.15, acousticness: 0.5, tempo_min: 55, tempo_max: 85 },
  'hüzünlü': { energy: 0.3, valence: 0.2, acousticness: 0.45, tempo_min: 60, tempo_max: 90 },
  'kızgın': { energy: 0.9, valence: 0.2, acousticness: 0.1, tempo_min: 130, tempo_max: 180 },
  'odaklanmış': { energy: 0.5, valence: 0.5, danceability: 0.3, tempo_min: 80, tempo_max: 120 },
  'romantik': { energy: 0.4, valence: 0.7, acousticness: 0.5, tempo_min: 70, tempo_max: 110 },
};

// Default parameters
const DEFAULT_PARAMS: MoodParameters = {
  energy: 0.5,
  valence: 0.5,
  danceability: 0.5,
  acousticness: 0.3,
  tempo_min: 80,
  tempo_max: 130,
};

// Map mood from keywords (fallback method)
export const mapMoodFromKeywords = (moodText: string): MoodParameters => {
  const words = moodText.toLowerCase().split(/\s+/);
  const matchedParams: Partial<MoodParameters>[] = [];

  // Find all matching keywords
  for (const word of words) {
    // Direct match
    if (MOOD_KEYWORDS[word]) {
      matchedParams.push(MOOD_KEYWORDS[word]);
      continue;
    }

    // Partial match
    for (const [keyword, params] of Object.entries(MOOD_KEYWORDS)) {
      if (word.includes(keyword) || keyword.includes(word)) {
        matchedParams.push(params);
        break;
      }
    }
  }

  // If no matches, return default
  if (matchedParams.length === 0) {
    return { ...DEFAULT_PARAMS };
  }

  // Average all matched parameters
  const avgParams: MoodParameters = {
    energy: 0,
    valence: 0,
    danceability: 0,
    acousticness: 0,
    tempo_min: 0,
    tempo_max: 0,
  };

  const counts = {
    energy: 0,
    valence: 0,
    danceability: 0,
    acousticness: 0,
    tempo_min: 0,
    tempo_max: 0,
  };

  for (const params of matchedParams) {
    if (params.energy !== undefined) {
      avgParams.energy += params.energy;
      counts.energy++;
    }
    if (params.valence !== undefined) {
      avgParams.valence += params.valence;
      counts.valence++;
    }
    if (params.danceability !== undefined) {
      avgParams.danceability += params.danceability;
      counts.danceability++;
    }
    if (params.acousticness !== undefined) {
      avgParams.acousticness += params.acousticness;
      counts.acousticness++;
    }
    if (params.tempo_min !== undefined) {
      avgParams.tempo_min += params.tempo_min;
      counts.tempo_min++;
    }
    if (params.tempo_max !== undefined) {
      avgParams.tempo_max += params.tempo_max;
      counts.tempo_max++;
    }
  }

  return {
    energy: counts.energy > 0 ? avgParams.energy / counts.energy : DEFAULT_PARAMS.energy,
    valence: counts.valence > 0 ? avgParams.valence / counts.valence : DEFAULT_PARAMS.valence,
    danceability: counts.danceability > 0 ? avgParams.danceability / counts.danceability : DEFAULT_PARAMS.danceability,
    acousticness: counts.acousticness > 0 ? avgParams.acousticness / counts.acousticness : DEFAULT_PARAMS.acousticness,
    tempo_min: counts.tempo_min > 0 ? Math.round(avgParams.tempo_min / counts.tempo_min) : DEFAULT_PARAMS.tempo_min,
    tempo_max: counts.tempo_max > 0 ? Math.round(avgParams.tempo_max / counts.tempo_max) : DEFAULT_PARAMS.tempo_max,
  };
};

// Map audio features to mood description
export const describeMood = (params: MoodParameters): string => {
  const descriptions: string[] = [];

  // Energy description
  if (params.energy > 0.7) {
    descriptions.push('energetic');
  } else if (params.energy < 0.3) {
    descriptions.push('calm');
  }

  // Valence description
  if (params.valence > 0.7) {
    descriptions.push('happy');
  } else if (params.valence < 0.3) {
    descriptions.push('melancholic');
  }

  // Danceability
  if (params.danceability > 0.7) {
    descriptions.push('danceable');
  }

  // Acousticness
  if (params.acousticness > 0.6) {
    descriptions.push('acoustic');
  }

  if (descriptions.length === 0) {
    return 'balanced';
  }

  return descriptions.join(', ');
};
