import {
  getYtDlpUserMessage,
  searchYouTube,
  type SearchResult as YtDlpSearchResult,
} from './ytdlp';
import type { UnifiedTrack } from '../../types/provider';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
  viewCount?: number;
}

const PLAYLIST_KEY = 'moodverter_youtube_playlist';
const RECENT_KEY = 'moodverter_youtube_recent';
const SEARCH_HISTORY_KEY = 'moodverter_youtube_search_history';
const MAX_RECENT = 20;
const MAX_SEARCH_HISTORY = 10;
const SEARCH_CACHE_TTL_MS = 60_000;

interface SearchCacheEntry {
  savedAt: number;
  results: YouTubeSearchResult[];
}

const searchCache = new Map<string, SearchCacheEntry>();

export interface PlaylistTrack extends YouTubeSearchResult {
  addedAt: number;
  duration?: number;
}

export async function getVideoInfo(videoId: string): Promise<YouTubeSearchResult | null> {
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);
    if (!response.ok) return null;

    const data = await response.json();
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

export function getPlaylist(): PlaylistTrack[] {
  try {
    const stored = localStorage.getItem(PLAYLIST_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as PlaylistTrack[];
  } catch {
    return [];
  }
}

export function addToPlaylist(track: YouTubeSearchResult & Partial<PlaylistTrack>): void {
  const playlist = getPlaylist();
  if (playlist.some((item) => item.videoId === track.videoId)) return;

  playlist.push({
    ...track,
    addedAt: track.addedAt ?? Date.now(),
  });
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
}

export function updatePlaylistTrack(
  videoId: string,
  patch: Partial<Pick<PlaylistTrack, 'title' | 'artist' | 'thumbnail' | 'duration'>>
): void {
  const playlist = getPlaylist();
  let updated = false;

  const nextPlaylist = playlist.map((item) => {
    if (item.videoId !== videoId) return item;
    updated = true;
    return {
      ...item,
      ...patch,
    };
  });

  if (updated) {
    localStorage.setItem(PLAYLIST_KEY, JSON.stringify(nextPlaylist));
  }
}

export function removeFromPlaylist(videoId: string): void {
  const playlist = getPlaylist();
  const filtered = playlist.filter((item) => item.videoId !== videoId);
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(filtered));
}

export function addToRecentlyPlayed(track: YouTubeSearchResult): void {
  let recent: PlaylistTrack[] = [];
  try {
    const stored = localStorage.getItem(RECENT_KEY);
    recent = stored ? (JSON.parse(stored) as PlaylistTrack[]) : [];
  } catch {
    recent = [];
  }

  const filtered = recent.filter((item) => item.videoId !== track.videoId);
  filtered.unshift({ ...track, addedAt: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
}

export function addToSearchHistory(query: string): void {
  const normalized = query.trim();
  if (!normalized) return;

  let history: string[] = [];
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    history = stored ? (JSON.parse(stored) as string[]) : [];
  } catch {
    history = [];
  }

  const filtered = history.filter((item) => item.toLowerCase() !== normalized.toLowerCase());
  filtered.unshift(normalized);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered.slice(0, MAX_SEARCH_HISTORY)));
}

export function getSearchSuggestions(limit = 5): string[] {
  try {
    const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
    if (!stored) return [];
    return (JSON.parse(stored) as string[]).slice(0, limit);
  } catch {
    return [];
  }
}

export function clearYouTubeLocalData(): void {
  localStorage.removeItem(PLAYLIST_KEY);
  localStorage.removeItem(RECENT_KEY);
  localStorage.removeItem(SEARCH_HISTORY_KEY);

  // Legacy cleanup from previous iterations.
  const legacyKeys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (
      key.startsWith('moodverter_') &&
      key !== 'moodverter_data_reset_20260209'
    ) {
      legacyKeys.push(key);
    }
  }
  legacyKeys.forEach((key) => localStorage.removeItem(key));

  searchCache.clear();
}

export async function searchVideos(query: string, limit = 10): Promise<YouTubeSearchResult[]> {
  const normalized = query.trim();
  if (!normalized) return [];
  if (normalized.length < 3) return [];

  const cacheKey = `${normalized.toLowerCase()}::${limit}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt <= SEARCH_CACHE_TTL_MS) {
    return cached.results;
  }

  try {
    const results = await searchYouTube(normalized, limit);
    const mapped = results.map(ytdlpResultToSearchResult);
    searchCache.set(cacheKey, {
      savedAt: Date.now(),
      results: mapped,
    });
    return mapped;
  } catch (error) {
    console.warn('yt-dlp search failed:', error);
    throw new Error(getYtDlpUserMessage(error));
  }
}

function ytdlpResultToSearchResult(result: YtDlpSearchResult): YouTubeSearchResult {
  const { artist, title } = parseVideoTitle(result.title, result.uploader);
  return {
    videoId: result.id,
    title,
    artist,
    thumbnail: result.thumbnail || `https://i.ytimg.com/vi/${result.id}/hqdefault.jpg`,
    duration: result.duration ? result.duration * 1000 : undefined,
    viewCount: result.view_count ?? undefined,
  };
}

function parseVideoTitle(title: string, uploader?: string | null): { artist: string; title: string } {
  const cleaned = title
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\(Official\s*Audio\)/gi, '')
    .replace(/\(Lyrics?\)/gi, '')
    .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\[Official\s*Audio\]/gi, '')
    .trim();

  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  }

  return { artist: uploader || 'Unknown Artist', title: cleaned };
}

export function searchResultToUnifiedTrack(result: YouTubeSearchResult): UnifiedTrack {
  return {
    id: result.videoId,
    provider: 'youtube',
    name: result.title,
    artist: result.artist,
    albumArt: result.thumbnail,
    durationMs: result.duration || 0,
    playCount: 0,
  };
}
