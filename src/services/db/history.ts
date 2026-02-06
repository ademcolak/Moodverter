import type { Track } from '../../types/track';
import type { MoodParameters } from '../../types/mood';
import type { HistoryEntry } from '../../types/history';
import { legacyTrackToUnified } from '../providers';
import { addToHistory, getHistory, clearHistory } from '../history';

const MOOD_HISTORY_KEY = 'moodverter_mood_history';

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

function toPlayHistoryEntry(entry: HistoryEntry): PlayHistoryEntry {
  return {
    trackId: entry.track.id,
    trackName: entry.track.name,
    artist: entry.track.artist,
    playedAt: entry.playedAt,
    skipped: entry.completedPercent < 80,
    skipPositionMs: entry.listenDuration,
  };
}

export const addToPlayHistory = (
  track: Track,
  moodParams?: MoodParameters,
  skipped = false,
  skipPositionMs?: number
): void => {
  const duration = track.durationMs || 1;
  const listenDuration = skipped ? (skipPositionMs ?? Math.min(duration, duration * 0.2)) : duration;
  const completedPercent = Math.max(0, Math.min(100, (listenDuration / duration) * 100));

  addToHistory({
    track: legacyTrackToUnified(track, 'spotify'),
    listenDuration,
    completedPercent,
    mood: moodParams ? JSON.stringify(moodParams) : undefined,
    source: 'library',
    decisionSource: skipped ? 'manual' : 'library_selector',
    algorithmVersion: 'phase4-v1',
  });
};

export const getPlayHistory = (limit = 50): PlayHistoryEntry[] => {
  return getHistory(limit).map(toPlayHistoryEntry);
};

export const getRecentlyPlayedIds = (limit = 20): string[] => {
  return getHistory(limit).map((entry) => entry.track.id);
};

export const wasRecentlyPlayed = (trackId: string, withinMinutes = 60): boolean => {
  const cutoff = Date.now() - withinMinutes * 60 * 1000;
  return getHistory(200).some((entry) => entry.track.id === trackId && entry.playedAt > cutoff);
};

export const getSkipStats = (trackId: string): { playCount: number; skipCount: number; skipRate: number } => {
  const entries = getHistory(1000).filter((entry) => entry.track.id === trackId);
  const playCount = entries.length;
  const skipCount = entries.filter((entry) => entry.completedPercent < 80).length;

  return {
    playCount,
    skipCount,
    skipRate: playCount > 0 ? skipCount / playCount : 0,
  };
};

export const addToMoodHistory = (text: string, params: MoodParameters): void => {
  try {
    const data = localStorage.getItem(MOOD_HISTORY_KEY);
    const history: MoodHistoryEntry[] = data ? JSON.parse(data) : [];
    const next = [{ text, params, createdAt: Date.now() }, ...history].slice(0, 50);
    localStorage.setItem(MOOD_HISTORY_KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to save mood history:', err);
  }
};

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

export const getLastMood = (): MoodHistoryEntry | null => {
  const history = getMoodHistory(1);
  return history[0] || null;
};

export const clearAllHistory = (): void => {
  clearHistory();
  localStorage.removeItem(MOOD_HISTORY_KEY);
};

export const getListeningAnalytics = (): {
  totalPlays: number;
  totalSkips: number;
  averageSkipRate: number;
  topArtists: { artist: string; count: number }[];
  listeningByHour: number[];
} => {
  const entries = getHistory(1000);
  const totalPlays = entries.length;
  const totalSkips = entries.filter((entry) => entry.completedPercent < 80).length;
  const listeningByHour = new Array(24).fill(0);
  const artistCounts = new Map<string, number>();

  for (const entry of entries) {
    const artist = entry.track.artist || 'Unknown';
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);
    const hour = new Date(entry.playedAt).getHours();
    listeningByHour[hour] += 1;
  }

  const topArtists = Array.from(artistCounts.entries())
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
};
