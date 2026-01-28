import { Track } from '../../types/track';
import { MoodParameters } from '../../types/mood';

const HISTORY_KEY = 'moodverter_play_history';
const MOOD_HISTORY_KEY = 'moodverter_mood_history';
const MAX_HISTORY_LENGTH = 1000;

interface PlayHistoryEntry {
  trackId: string;
  trackName: string;
  artist: string;
  playedAt: number;
  moodParams?: MoodParameters;
  skipped: boolean;
  skipPositionMs?: number;
}

interface MoodHistoryEntry {
  text: string;
  params: MoodParameters;
  createdAt: number;
}

// Add track to play history
export const addToPlayHistory = (
  track: Track,
  moodParams?: MoodParameters,
  skipped = false,
  skipPositionMs?: number
): void => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    let history: PlayHistoryEntry[] = data ? JSON.parse(data) : [];

    // Add new entry
    history.unshift({
      trackId: track.spotifyId,
      trackName: track.name,
      artist: track.artist,
      playedAt: Date.now(),
      moodParams,
      skipped,
      skipPositionMs,
    });

    // Limit history length
    if (history.length > MAX_HISTORY_LENGTH) {
      history = history.slice(0, MAX_HISTORY_LENGTH);
    }

    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save play history:', err);
  }
};

// Get play history
export const getPlayHistory = (limit = 50): PlayHistoryEntry[] => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return [];

    const history: PlayHistoryEntry[] = JSON.parse(data);
    return history.slice(0, limit);
  } catch {
    return [];
  }
};

// Get recently played track IDs
export const getRecentlyPlayedIds = (limit = 20): string[] => {
  const history = getPlayHistory(limit);
  return history.map(h => h.trackId);
};

// Check if track was recently played
export const wasRecentlyPlayed = (trackId: string, withinMinutes = 60): boolean => {
  const history = getPlayHistory(100);
  const cutoff = Date.now() - withinMinutes * 60 * 1000;

  return history.some(
    h => h.trackId === trackId && h.playedAt > cutoff
  );
};

// Get skip statistics for a track
export const getSkipStats = (trackId: string): { playCount: number; skipCount: number; skipRate: number } => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) return { playCount: 0, skipCount: 0, skipRate: 0 };

    const history: PlayHistoryEntry[] = JSON.parse(data);
    const trackHistory = history.filter(h => h.trackId === trackId);
    
    const playCount = trackHistory.length;
    const skipCount = trackHistory.filter(h => h.skipped).length;
    
    return {
      playCount,
      skipCount,
      skipRate: playCount > 0 ? skipCount / playCount : 0,
    };
  } catch {
    return { playCount: 0, skipCount: 0, skipRate: 0 };
  }
};

// Add mood to history
export const addToMoodHistory = (text: string, params: MoodParameters): void => {
  try {
    const data = localStorage.getItem(MOOD_HISTORY_KEY);
    let history: MoodHistoryEntry[] = data ? JSON.parse(data) : [];

    history.unshift({
      text,
      params,
      createdAt: Date.now(),
    });

    // Keep only last 50 moods
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    localStorage.setItem(MOOD_HISTORY_KEY, JSON.stringify(history));
  } catch (err) {
    console.error('Failed to save mood history:', err);
  }
};

// Get mood history
export const getMoodHistory = (limit = 10): MoodHistoryEntry[] => {
  try {
    const data = localStorage.getItem(MOOD_HISTORY_KEY);
    if (!data) return [];

    const history: MoodHistoryEntry[] = JSON.parse(data);
    return history.slice(0, limit);
  } catch {
    return [];
  }
};

// Get last mood
export const getLastMood = (): MoodHistoryEntry | null => {
  const history = getMoodHistory(1);
  return history[0] || null;
};

// Clear all history
export const clearAllHistory = (): void => {
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(MOOD_HISTORY_KEY);
};

// Get listening analytics
export const getListeningAnalytics = (): {
  totalPlays: number;
  totalSkips: number;
  averageSkipRate: number;
  topArtists: { artist: string; count: number }[];
  listeningByHour: number[];
} => {
  try {
    const data = localStorage.getItem(HISTORY_KEY);
    if (!data) {
      return {
        totalPlays: 0,
        totalSkips: 0,
        averageSkipRate: 0,
        topArtists: [],
        listeningByHour: new Array(24).fill(0),
      };
    }

    const history: PlayHistoryEntry[] = JSON.parse(data);
    
    const totalPlays = history.length;
    const totalSkips = history.filter(h => h.skipped).length;
    
    // Count artists
    const artistCounts: Record<string, number> = {};
    const listeningByHour = new Array(24).fill(0);
    
    for (const entry of history) {
      artistCounts[entry.artist] = (artistCounts[entry.artist] || 0) + 1;
      const hour = new Date(entry.playedAt).getHours();
      listeningByHour[hour]++;
    }
    
    const topArtists = Object.entries(artistCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([artist, count]) => ({ artist, count }));

    return {
      totalPlays,
      totalSkips,
      averageSkipRate: totalPlays > 0 ? totalSkips / totalPlays : 0,
      topArtists,
      listeningByHour,
    };
  } catch {
    return {
      totalPlays: 0,
      totalSkips: 0,
      averageSkipRate: 0,
      topArtists: [],
      listeningByHour: new Array(24).fill(0),
    };
  }
};
