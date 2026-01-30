// YouTube Search Service
// Provides search functionality without API key

import { extractVideoId } from './player';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
}

// Parse user input - could be URL or search term
export function parseUserInput(input: string): {
  type: 'url' | 'search';
  videoId?: string;
  query?: string;
} {
  const trimmed = input.trim();

  // Try to extract video ID from URL
  const videoId = extractVideoId(trimmed);
  if (videoId) {
    return { type: 'url', videoId };
  }

  // Otherwise treat as search query
  return { type: 'search', query: trimmed };
}

// Get video info from oEmbed (no API key needed)
export async function getVideoInfo(videoId: string): Promise<YouTubeSearchResult | null> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    // Parse title to extract artist (common format: "Artist - Song Title")
    const titleParts = data.title.split(' - ');
    const artist = titleParts.length > 1 ? titleParts[0].trim() : data.author_name;
    const title = titleParts.length > 1 ? titleParts.slice(1).join(' - ').trim() : data.title;

    return {
      videoId,
      title,
      artist,
      thumbnail: data.thumbnail_url,
    };
  } catch (error) {
    console.error('Failed to fetch video info:', error);
    return null;
  }
}

// Build YouTube search URL (opens in browser)
export function buildSearchUrl(query: string): string {
  const encodedQuery = encodeURIComponent(query);
  return `https://www.youtube.com/results?search_query=${encodedQuery}`;
}

// Local playlist management (stored in localStorage)
const PLAYLIST_KEY = 'moodverter_youtube_playlist';

export interface PlaylistTrack extends YouTubeSearchResult {
  addedAt: number;
}

export function getPlaylist(): PlaylistTrack[] {
  try {
    const stored = localStorage.getItem(PLAYLIST_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addToPlaylist(track: YouTubeSearchResult): void {
  const playlist = getPlaylist();

  // Check if already in playlist
  if (playlist.some(t => t.videoId === track.videoId)) {
    return;
  }

  const playlistTrack: PlaylistTrack = {
    ...track,
    addedAt: Date.now(),
  };

  playlist.push(playlistTrack);
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
}

export function removeFromPlaylist(videoId: string): void {
  const playlist = getPlaylist();
  const filtered = playlist.filter(t => t.videoId !== videoId);
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(filtered));
}

export function clearPlaylist(): void {
  localStorage.removeItem(PLAYLIST_KEY);
}

// Recently played tracking
const RECENT_KEY = 'moodverter_youtube_recent';
const MAX_RECENT = 20;

export function getRecentlyPlayed(): PlaylistTrack[] {
  try {
    const stored = localStorage.getItem(RECENT_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addToRecentlyPlayed(track: YouTubeSearchResult): void {
  const recent = getRecentlyPlayed();

  // Remove if already exists
  const filtered = recent.filter(t => t.videoId !== track.videoId);

  // Add to front
  filtered.unshift({
    ...track,
    addedAt: Date.now(),
  });

  // Keep only MAX_RECENT items
  const trimmed = filtered.slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed));
}

// Search history
const SEARCH_HISTORY_KEY = 'moodverter_youtube_search_history';
const MAX_SEARCH_HISTORY = 10;

export function getSearchHistory(): string[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addToSearchHistory(query: string): void {
  const history = getSearchHistory();
  const trimmedQuery = query.trim();

  if (!trimmedQuery) return;

  // Remove if already exists
  const filtered = history.filter(q => q.toLowerCase() !== trimmedQuery.toLowerCase());

  // Add to front
  filtered.unshift(trimmedQuery);

  // Keep only MAX items
  const trimmed = filtered.slice(0, MAX_SEARCH_HISTORY);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(trimmed));
}

export function clearSearchHistory(): void {
  localStorage.removeItem(SEARCH_HISTORY_KEY);
}
