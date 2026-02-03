// YouTube Search Service
// Provides search functionality with yt-dlp backend and smart mood-based queries

import { extractVideoId } from './player';
import { searchYouTube, isYtDlpAvailable, SearchResult as YtDlpSearchResult } from './ytdlp';
import type { UnifiedTrack, AudioFeatures } from '../../types/provider';

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration?: number;
  viewCount?: number;
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
  audioFeatures?: AudioFeatures;
  analysis?: {
    suggestedMood: string;
    confidence: number;
    genres: string[];
    moods: string[];
    method: 'embedding' | 'keyword' | 'fallback';
  };
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

export function addToPlaylist(track: YouTubeSearchResult & Partial<PlaylistTrack>): void {
  const playlist = getPlaylist();

  // Check if already in playlist
  if (playlist.some(t => t.videoId === track.videoId)) {
    return;
  }

  const playlistTrack: PlaylistTrack = {
    ...track,
    addedAt: track.addedAt ?? Date.now(),
    audioFeatures: track.audioFeatures,
    analysis: track.analysis,
  };

  playlist.push(playlistTrack);
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
}

export function updatePlaylistTrack(
  videoId: string,
  updates: Partial<PlaylistTrack>
): void {
  const playlist = getPlaylist();
  const index = playlist.findIndex(t => t.videoId === videoId);
  if (index === -1) return;

  playlist[index] = {
    ...playlist[index],
    ...updates,
  };

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

// =============================================================================
// yt-dlp Enhanced Search
// =============================================================================

/**
 * Search YouTube using yt-dlp backend
 * Falls back to oEmbed method if yt-dlp is unavailable
 */
export async function searchVideos(
  query: string,
  limit: number = 10
): Promise<YouTubeSearchResult[]> {
  // Try yt-dlp first
  if (await isYtDlpAvailable()) {
    try {
      const results = await searchYouTube(query, limit);
      return results.map(ytdlpResultToSearchResult);
    } catch (error) {
      console.warn('yt-dlp search failed, falling back:', error);
    }
  }

  // Fallback: return empty (user can still paste URLs)
  console.warn('yt-dlp not available, search disabled');
  return [];
}

/**
 * Convert yt-dlp result to YouTubeSearchResult
 */
function ytdlpResultToSearchResult(result: YtDlpSearchResult): YouTubeSearchResult {
  // Parse title to extract artist
  const { artist, title } = parseVideoTitle(result.title, result.uploader);

  return {
    videoId: result.id,
    title,
    artist,
    thumbnail: result.thumbnail || `https://i.ytimg.com/vi/${result.id}/hqdefault.jpg`,
    duration: result.duration ? result.duration * 1000 : undefined, // Convert to ms
    viewCount: result.view_count ?? undefined,
  };
}

/**
 * Parse video title to extract artist and song name
 * Common formats:
 * - "Artist - Song Title"
 * - "Artist - Song Title (Official Video)"
 * - "Song Title | Artist"
 * - "Artist: Song Title"
 */
export function parseVideoTitle(
  title: string,
  uploader?: string | null
): { artist: string; title: string } {
  // Remove common suffixes
  let cleanTitle = title
    .replace(/\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\(Official\s*Audio\)/gi, '')
    .replace(/\(Lyric\s*Video\)/gi, '')
    .replace(/\(Lyrics\)/gi, '')
    .replace(/\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\[Official\s*Audio\]/gi, '')
    .replace(/\|.*Official/gi, '')
    .replace(/ft\.\s*[^-|]+/gi, '') // Remove featuring
    .replace(/feat\.\s*[^-|]+/gi, '')
    .trim();

  // Try "Artist - Title" format
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ');
    return {
      artist: parts[0].trim(),
      title: parts.slice(1).join(' - ').trim(),
    };
  }

  // Try "Title | Artist" format
  if (cleanTitle.includes(' | ')) {
    const parts = cleanTitle.split(' | ');
    return {
      artist: parts[parts.length - 1].trim(),
      title: parts.slice(0, -1).join(' | ').trim(),
    };
  }

  // Try "Artist: Title" format
  if (cleanTitle.includes(': ')) {
    const colonIndex = cleanTitle.indexOf(': ');
    return {
      artist: cleanTitle.substring(0, colonIndex).trim(),
      title: cleanTitle.substring(colonIndex + 2).trim(),
    };
  }

  // Use uploader as artist
  return {
    artist: uploader || 'Unknown Artist',
    title: cleanTitle,
  };
}

/**
 * Convert YouTubeSearchResult to UnifiedTrack
 */
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

// =============================================================================
// Smart Search - Mood-based Query Enhancement
// =============================================================================

// Mood to search query mappings
const MOOD_SEARCH_QUERIES: Record<string, string[]> = {
  energetic: ['energetic music', 'upbeat songs', 'high energy playlist'],
  happy: ['happy songs', 'feel good music', 'joyful playlist'],
  party: ['party music', 'dance hits', 'club music'],
  workout: ['workout music', 'gym playlist', 'exercise songs', 'pump up music'],
  confident: ['empowering songs', 'confidence boosting music', 'powerful anthems'],
  chill: ['chill music', 'relaxing songs', 'laid back vibes'],
  focused: ['focus music', 'study music', 'concentration playlist', 'deep work'],
  romantic: ['romantic songs', 'love songs', 'romantic playlist'],
  groovy: ['groovy music', 'funky songs', 'groove playlist'],
  dreamy: ['dreamy music', 'ethereal songs', 'ambient vibes'],
  calm: ['calm music', 'peaceful songs', 'tranquil playlist'],
  sleepy: ['sleep music', 'bedtime songs', 'relaxing sleep'],
  acoustic: ['acoustic songs', 'unplugged music', 'acoustic covers'],
  melancholic: ['melancholic music', 'bittersweet songs', 'emotional playlist'],
  sad: ['sad songs', 'emotional music', 'heartbreak playlist'],
  nostalgic: ['nostalgic songs', 'throwback music', '90s hits', '2000s hits'],
  angry: ['angry music', 'aggressive songs', 'metal playlist', 'rage music'],
  anxious: ['calming music for anxiety', 'stress relief songs'],
  driving: ['driving music', 'road trip playlist', 'highway songs'],
  cooking: ['cooking music', 'kitchen playlist', 'dinner party music'],
  morning: ['morning music', 'wake up songs', 'sunrise playlist'],
  late_night: ['late night music', 'midnight vibes', 'after hours'],
  indie: ['indie music', 'alternative songs', 'indie rock'],
  electronic: ['electronic music', 'edm', 'synth music', 'techno'],
  jazz: ['jazz music', 'smooth jazz', 'jazz classics'],
  classical: ['classical music', 'orchestra', 'piano classics'],
  lofi: ['lofi hip hop', 'chill beats', 'study beats', 'lofi music'],
};

// Genre modifiers for search refinement
const GENRE_MODIFIERS: Record<string, string[]> = {
  rock: ['rock music', 'rock songs'],
  pop: ['pop music', 'pop hits'],
  hiphop: ['hip hop', 'rap music'],
  rnb: ['r&b music', 'rnb songs'],
  electronic: ['electronic', 'edm'],
  jazz: ['jazz'],
  classical: ['classical'],
  country: ['country music'],
  metal: ['metal music', 'heavy metal'],
  folk: ['folk music', 'folk songs'],
};

/**
 * Build smart search query based on mood
 */
export function buildMoodSearchQuery(
  mood: string,
  genre?: string,
  additionalTerms?: string
): string {
  const normalizedMood = mood.toLowerCase().replace(/[^a-z_]/g, '');

  // Get mood-specific queries
  const moodQueries = MOOD_SEARCH_QUERIES[normalizedMood] || [`${mood} music`];
  const baseQuery = moodQueries[Math.floor(Math.random() * moodQueries.length)];

  let query = baseQuery;

  // Add genre modifier
  if (genre) {
    const normalizedGenre = genre.toLowerCase();
    const genreTerms = GENRE_MODIFIERS[normalizedGenre];
    if (genreTerms) {
      query = `${baseQuery} ${genreTerms[0]}`;
    } else {
      query = `${baseQuery} ${genre}`;
    }
  }

  // Add additional terms
  if (additionalTerms) {
    query = `${query} ${additionalTerms}`;
  }

  return query;
}

/**
 * Search videos based on mood parameters
 */
export async function searchByMood(
  mood: string,
  options?: {
    genre?: string;
    additionalTerms?: string;
    limit?: number;
  }
): Promise<YouTubeSearchResult[]> {
  const query = buildMoodSearchQuery(
    mood,
    options?.genre,
    options?.additionalTerms
  );

  addToSearchHistory(query);
  return searchVideos(query, options?.limit || 10);
}

/**
 * Get search suggestions based on current mood and history
 */
export function getSearchSuggestions(
  currentMood?: string,
  limit: number = 5
): string[] {
  const suggestions: string[] = [];

  // Add mood-based suggestions
  if (currentMood) {
    const normalizedMood = currentMood.toLowerCase().replace(/[^a-z_]/g, '');
    const moodQueries = MOOD_SEARCH_QUERIES[normalizedMood];
    if (moodQueries) {
      suggestions.push(...moodQueries.slice(0, 2));
    }
  }

  // Add recent searches
  const history = getSearchHistory();
  suggestions.push(...history.slice(0, 3));

  // Return unique suggestions
  return [...new Set(suggestions)].slice(0, limit);
}
