// History Service - Track playback history and stats

import type { HistoryEntry } from '../../types/history';

const HISTORY_LIMIT = 100;
const STORAGE_KEY = 'moodverter_history';
const DEFAULT_ALGORITHM_VERSION = 'phase4-v1';

export function addToHistory(entry: Omit<HistoryEntry, 'playedAt'>): HistoryEntry {
  const newEntry: HistoryEntry = {
    ...entry,
    playedAt: Date.now(),
    decisionSource: entry.decisionSource ?? 'unknown',
    algorithmVersion: entry.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
  };

  const history = getHistory(HISTORY_LIMIT);
  const updated = [newEntry, ...history].slice(0, HISTORY_LIMIT);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore
  }

  return newEntry;
}

export function getHistory(limit: number = HISTORY_LIMIT): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as HistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, limit).map((entry) => ({
      ...entry,
      decisionSource: entry.decisionSource ?? 'unknown',
      algorithmVersion: entry.algorithmVersion ?? DEFAULT_ALGORITHM_VERSION,
    }));
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function getHistoryStats(): {
  totalTracks: number;
  totalListenTime: number;
  topArtists: { artist: string; count: number }[];
  topMoods: { mood: string; count: number }[];
} {
  const history = getHistory(HISTORY_LIMIT);
  let totalListenTime = 0;

  const artistCounts = new Map<string, number>();
  const moodCounts = new Map<string, number>();

  for (const entry of history) {
    totalListenTime += entry.listenDuration || 0;
    const artist = entry.track.artist || 'Unknown';
    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);

    if (entry.mood) {
      moodCounts.set(entry.mood, (moodCounts.get(entry.mood) || 0) + 1);
    }
  }

  const topArtists = Array.from(artistCounts.entries())
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topMoods = Array.from(moodCounts.entries())
    .map(([mood, count]) => ({ mood, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalTracks: history.length,
    totalListenTime,
    topArtists,
    topMoods,
  };
}
