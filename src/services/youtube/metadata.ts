// YouTube Video Metadata Extraction and Parsing
// Extracts rich metadata from YouTube videos including genre and mood detection

import { getVideoInfo as getYtDlpVideoInfo, isYtDlpAvailable } from './ytdlp';
import { parseVideoTitle } from './search';
import type { VideoMetadata, MetadataParseResult } from '../../types/youtube';
import { GENRE_KEYWORDS, MOOD_KEYWORDS } from '../../types/youtube';

// LocalStorage cache key
const METADATA_CACHE_KEY = 'moodverter_video_metadata_cache';
const CACHE_MAX_SIZE = 200;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// =============================================================================
// Cache Management
// =============================================================================

interface MetadataCache {
  [videoId: string]: {
    data: VideoMetadata;
    cachedAt: number;
  };
}

function getCache(): MetadataCache {
  try {
    const stored = localStorage.getItem(METADATA_CACHE_KEY);
    if (!stored) return {};
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function saveCache(cache: MetadataCache): void {
  // Prune old entries if cache is too large
  const entries = Object.entries(cache);
  if (entries.length > CACHE_MAX_SIZE) {
    entries.sort((a, b) => b[1].cachedAt - a[1].cachedAt);
    const pruned = entries.slice(0, CACHE_MAX_SIZE);
    cache = Object.fromEntries(pruned);
  }

  localStorage.setItem(METADATA_CACHE_KEY, JSON.stringify(cache));
}

export function getCachedMetadata(videoId: string): VideoMetadata | null {
  const cache = getCache();
  const entry = cache[videoId];

  if (!entry) return null;

  // Check if cache is expired
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    delete cache[videoId];
    saveCache(cache);
    return null;
  }

  return entry.data;
}

export function cacheMetadata(metadata: VideoMetadata): void {
  const cache = getCache();
  cache[metadata.videoId] = {
    data: metadata,
    cachedAt: Date.now(),
  };
  saveCache(cache);
}

export function clearMetadataCache(): void {
  localStorage.removeItem(METADATA_CACHE_KEY);
}

// =============================================================================
// Metadata Extraction
// =============================================================================

/**
 * Extract comprehensive metadata from a YouTube video
 */
export async function extractVideoMetadata(videoId: string): Promise<VideoMetadata | null> {
  // Check cache first
  const cached = getCachedMetadata(videoId);
  if (cached) {
    return cached;
  }

  // Try yt-dlp for rich metadata
  if (await isYtDlpAvailable()) {
    try {
      const info = await getYtDlpVideoInfo(videoId);

      // Parse title to extract artist and song
      const { artist, title: songName } = parseVideoTitle(
        info.title,
        info.uploader || info.channel
      );

      // Detect genres and moods
      const { genres, moods } = detectGenresAndMoods(
        info.title,
        info.description || '',
        info.tags || []
      );

      const metadata: VideoMetadata = {
        videoId: info.id,
        title: info.title,
        artist,
        songName,
        uploader: info.uploader || info.channel || 'Unknown',
        channel: info.channel || undefined,
        description: info.description || undefined,
        genres,
        moods,
        tags: info.tags || [],
        duration: (info.duration || 0) * 1000, // Convert to ms
        viewCount: info.view_count || undefined,
        thumbnail: info.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        uploadDate: info.upload_date || undefined,
        parsedAt: Date.now(),
      };

      cacheMetadata(metadata);
      return metadata;
    } catch (error) {
      console.warn('yt-dlp metadata extraction failed:', error);
    }
  }

  // Fallback: oEmbed (limited metadata)
  try {
    const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const response = await fetch(oEmbedUrl);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const { artist, title: songName } = parseVideoTitle(data.title, data.author_name);
    const { genres, moods } = detectGenresAndMoods(data.title, '', []);

    const metadata: VideoMetadata = {
      videoId,
      title: data.title,
      artist,
      songName,
      uploader: data.author_name,
      genres,
      moods,
      tags: [],
      duration: 0, // Not available from oEmbed
      thumbnail: data.thumbnail_url,
      parsedAt: Date.now(),
    };

    cacheMetadata(metadata);
    return metadata;
  } catch (error) {
    console.error('Failed to extract video metadata:', error);
    return null;
  }
}

// =============================================================================
// Genre and Mood Detection
// =============================================================================

/**
 * Detect genres and moods from video metadata
 */
export function detectGenresAndMoods(
  title: string,
  description: string,
  tags: string[]
): { genres: string[]; moods: string[] } {
  const searchText = [
    title.toLowerCase(),
    description.toLowerCase(),
    ...tags.map(t => t.toLowerCase()),
  ].join(' ');

  const detectedGenres: Set<string> = new Set();
  const detectedMoods: Set<string> = new Set();

  // Detect genres
  for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        detectedGenres.add(genre);
        break;
      }
    }
  }

  // Detect moods
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword)) {
        detectedMoods.add(mood);
        break;
      }
    }
  }

  return {
    genres: Array.from(detectedGenres),
    moods: Array.from(detectedMoods),
  };
}

/**
 * Parse metadata to extract structured song info
 */
export function parseMetadata(metadata: VideoMetadata): MetadataParseResult {
  // Calculate confidence based on available data
  let confidence = 0.5; // Base confidence

  // Title parsing confidence
  if (metadata.title.includes(' - ')) {
    confidence += 0.2;
  }

  // Tags available
  if (metadata.tags.length > 0) {
    confidence += 0.1;
  }

  // Description available
  if (metadata.description && metadata.description.length > 50) {
    confidence += 0.1;
  }

  // Genres detected
  if (metadata.genres.length > 0) {
    confidence += 0.1;
  }

  return {
    artist: metadata.artist,
    songName: metadata.songName,
    genres: metadata.genres,
    moods: metadata.moods,
    confidence: Math.min(1, confidence),
  };
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Extract metadata for multiple videos
 */
export async function extractMetadataBatch(
  videoIds: string[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, VideoMetadata>> {
  const results = new Map<string, VideoMetadata>();

  for (let i = 0; i < videoIds.length; i++) {
    const videoId = videoIds[i];

    try {
      const metadata = await extractVideoMetadata(videoId);
      if (metadata) {
        results.set(videoId, metadata);
      }
    } catch (error) {
      console.warn(`Failed to extract metadata for ${videoId}:`, error);
    }

    onProgress?.(i + 1, videoIds.length);
  }

  return results;
}

/**
 * Get all cached metadata
 */
export function getAllCachedMetadata(): VideoMetadata[] {
  const cache = getCache();
  return Object.values(cache).map(entry => entry.data);
}
