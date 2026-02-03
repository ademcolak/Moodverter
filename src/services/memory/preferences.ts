// User Preferences - Track user behavior and preferences

const PREFERENCES_KEY = 'moodverter_user_preferences';
const SKIP_HISTORY_KEY = 'moodverter_skip_history';
const LISTEN_HISTORY_KEY = 'moodverter_listen_history';

export interface UserPreferences {
  // Genre preferences (genre -> weight, positive = liked, negative = disliked)
  genreWeights: Record<string, number>;

  // Artist preferences
  likedArtists: Set<string>;
  dislikedArtists: Set<string>;

  // Tempo preferences
  preferredTempo: {
    min: number;
    max: number;
    samples: number;
  };

  // Time-based mood preferences
  timeBasedMoods: Record<string, string>; // "morning" -> "energetic"

  // Feature preferences (learned over time)
  featurePreferences: {
    energy: { sum: number; count: number };
    valence: { sum: number; count: number };
    danceability: { sum: number; count: number };
    acousticness: { sum: number; count: number };
  };
}

export interface SkipRecord {
  trackId: string;
  artist: string;
  genres: string[];
  timestamp: number;
  progressPercent: number; // How far into song when skipped
}

export interface ListenRecord {
  trackId: string;
  artist: string;
  genres: string[];
  timestamp: number;
  listenPercent: number; // How much of song was listened
  energy: number;
  valence: number;
  tempo: number;
}

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  genreWeights: {},
  likedArtists: new Set(),
  dislikedArtists: new Set(),
  preferredTempo: { min: 80, max: 140, samples: 0 },
  timeBasedMoods: {},
  featurePreferences: {
    energy: { sum: 0, count: 0 },
    valence: { sum: 0, count: 0 },
    danceability: { sum: 0, count: 0 },
    acousticness: { sum: 0, count: 0 },
  },
};

// In-memory cache
let preferences: UserPreferences = { ...DEFAULT_PREFERENCES };
let skipHistory: SkipRecord[] = [];
let listenHistory: ListenRecord[] = [];

// =============================================================================
// Persistence
// =============================================================================

function loadPreferences(): void {
  try {
    const stored = localStorage.getItem(PREFERENCES_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      preferences = {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        likedArtists: new Set(parsed.likedArtists || []),
        dislikedArtists: new Set(parsed.dislikedArtists || []),
      };
    }
  } catch {
    preferences = { ...DEFAULT_PREFERENCES };
  }
}

function savePreferences(): void {
  try {
    const toSave = {
      ...preferences,
      likedArtists: Array.from(preferences.likedArtists),
      dislikedArtists: Array.from(preferences.dislikedArtists),
    };
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore
  }
}

function loadSkipHistory(): void {
  try {
    const stored = localStorage.getItem(SKIP_HISTORY_KEY);
    if (stored) {
      skipHistory = JSON.parse(stored);
    }
  } catch {
    skipHistory = [];
  }
}

function saveSkipHistory(): void {
  try {
    // Keep only last 100 skips
    const toSave = skipHistory.slice(-100);
    localStorage.setItem(SKIP_HISTORY_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore
  }
}

function loadListenHistory(): void {
  try {
    const stored = localStorage.getItem(LISTEN_HISTORY_KEY);
    if (stored) {
      listenHistory = JSON.parse(stored);
    }
  } catch {
    listenHistory = [];
  }
}

function saveListenHistory(): void {
  try {
    // Keep only last 200 listens
    const toSave = listenHistory.slice(-200);
    localStorage.setItem(LISTEN_HISTORY_KEY, JSON.stringify(toSave));
  } catch {
    // Ignore
  }
}

// Initialize
loadPreferences();
loadSkipHistory();
loadListenHistory();

// =============================================================================
// Public API
// =============================================================================

/**
 * Record a skip event (negative signal)
 */
export function recordSkip(
  trackId: string,
  artist: string,
  genres: string[],
  progressPercent: number
): void {
  const record: SkipRecord = {
    trackId,
    artist: artist.toLowerCase(),
    genres: genres.map(g => g.toLowerCase()),
    timestamp: Date.now(),
    progressPercent,
  };

  skipHistory.push(record);
  saveSkipHistory();

  // Update preferences based on skip
  updatePreferencesFromSkip(record);
  savePreferences();
}

/**
 * Record a listen event (positive signal)
 */
export function recordListen(
  trackId: string,
  artist: string,
  genres: string[],
  listenPercent: number,
  features: { energy: number; valence: number; tempo: number }
): void {
  const record: ListenRecord = {
    trackId,
    artist: artist.toLowerCase(),
    genres: genres.map(g => g.toLowerCase()),
    timestamp: Date.now(),
    listenPercent,
    energy: features.energy,
    valence: features.valence,
    tempo: features.tempo,
  };

  listenHistory.push(record);
  saveListenHistory();

  // Update preferences based on listen
  updatePreferencesFromListen(record);
  savePreferences();
}

/**
 * Get preference score for a track (bonus/penalty)
 */
export function getPreferenceScore(
  trackId: string,
  artist: string,
  genres: string[],
  features?: { energy: number; valence: number; tempo: number }
): number {
  let score = 0;

  const normalizedArtist = artist.toLowerCase();
  const normalizedGenres = genres.map(g => g.toLowerCase());

  // Check if track was skipped recently
  const recentSkips = skipHistory.slice(-50);
  const wasSkipped = recentSkips.some(s => s.trackId === trackId);
  if (wasSkipped) {
    score -= 0.2; // Skip penalty
  }

  // Artist preference
  if (preferences.likedArtists.has(normalizedArtist)) {
    score += 0.15;
  }
  if (preferences.dislikedArtists.has(normalizedArtist)) {
    score -= 0.2;
  }

  // Genre preference
  for (const genre of normalizedGenres) {
    const weight = preferences.genreWeights[genre] || 0;
    score += weight * 0.1;
  }

  // Feature preference matching
  if (features && preferences.featurePreferences.energy.count > 5) {
    const avgEnergy = preferences.featurePreferences.energy.sum /
      preferences.featurePreferences.energy.count;
    const energyDiff = Math.abs(features.energy - avgEnergy);
    score += (1 - energyDiff) * 0.05;
  }

  // Clamp score
  return Math.max(-0.5, Math.min(0.5, score));
}

/**
 * Get current user preferences
 */
export function getPreferences(): UserPreferences {
  return { ...preferences };
}

/**
 * Get skip history
 */
export function getSkipHistory(): SkipRecord[] {
  return [...skipHistory];
}

/**
 * Get listen history
 */
export function getListenHistory(): ListenRecord[] {
  return [...listenHistory];
}

/**
 * Get average preferred features
 */
export function getAverageFeatures(): {
  energy: number;
  valence: number;
  danceability: number;
  acousticness: number;
} | null {
  const fp = preferences.featurePreferences;

  if (fp.energy.count < 5) {
    return null;
  }

  return {
    energy: fp.energy.sum / fp.energy.count,
    valence: fp.valence.sum / fp.valence.count,
    danceability: fp.danceability.sum / fp.danceability.count,
    acousticness: fp.acousticness.sum / fp.acousticness.count,
  };
}

/**
 * Clear all preference data
 */
export function clearPreferences(): void {
  preferences = { ...DEFAULT_PREFERENCES };
  skipHistory = [];
  listenHistory = [];

  localStorage.removeItem(PREFERENCES_KEY);
  localStorage.removeItem(SKIP_HISTORY_KEY);
  localStorage.removeItem(LISTEN_HISTORY_KEY);
}

// =============================================================================
// Internal Helpers
// =============================================================================

function updatePreferencesFromSkip(record: SkipRecord): void {
  // Early skip (< 20%) = strong dislike signal
  const isEarlySkip = record.progressPercent < 0.2;

  // Update genre weights
  for (const genre of record.genres) {
    const currentWeight = preferences.genreWeights[genre] || 0;
    const delta = isEarlySkip ? -0.1 : -0.05;
    preferences.genreWeights[genre] = Math.max(-1, currentWeight + delta);
  }

  // Update artist preference if skipped very early
  if (isEarlySkip) {
    // Count how many times this artist was skipped early
    const artistSkips = skipHistory.filter(
      s => s.artist === record.artist && s.progressPercent < 0.2
    ).length;

    if (artistSkips >= 3) {
      preferences.dislikedArtists.add(record.artist);
      preferences.likedArtists.delete(record.artist);
    }
  }
}

function updatePreferencesFromListen(record: ListenRecord): void {
  // Full listen (> 80%) = positive signal
  const isFullListen = record.listenPercent > 0.8;

  if (isFullListen) {
    // Update genre weights
    for (const genre of record.genres) {
      const currentWeight = preferences.genreWeights[genre] || 0;
      preferences.genreWeights[genre] = Math.min(1, currentWeight + 0.05);
    }

    // Update artist preference
    const artistListens = listenHistory.filter(
      l => l.artist === record.artist && l.listenPercent > 0.8
    ).length;

    if (artistListens >= 3) {
      preferences.likedArtists.add(record.artist);
      preferences.dislikedArtists.delete(record.artist);
    }

    // Update feature preferences
    const fp = preferences.featurePreferences;
    fp.energy.sum += record.energy;
    fp.energy.count += 1;
    fp.valence.sum += record.valence;
    fp.valence.count += 1;

    // Update tempo preference
    const tempo = preferences.preferredTempo;
    if (tempo.samples < 10) {
      tempo.min = Math.min(tempo.min, record.tempo - 10);
      tempo.max = Math.max(tempo.max, record.tempo + 10);
      tempo.samples += 1;
    } else {
      // Weighted update
      tempo.min = tempo.min * 0.9 + (record.tempo - 10) * 0.1;
      tempo.max = tempo.max * 0.9 + (record.tempo + 10) * 0.1;
    }
  }
}
