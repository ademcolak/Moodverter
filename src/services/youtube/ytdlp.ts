// yt-dlp Frontend Bindings
// Wrapper for Tauri yt-dlp commands

import { invoke } from '@tauri-apps/api/core';

// Types matching Rust structs
export interface VideoInfo {
  id: string;
  title: string;
  uploader: string | null;
  channel: string | null;
  duration: number | null;
  view_count: number | null;
  description: string | null;
  thumbnail: string | null;
  tags: string[] | null;
  categories: string[] | null;
  upload_date: string | null;
}

export interface SearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  view_count: number | null;
  thumbnail: string | null;
}

export interface AudioStream {
  url: string;
  format: string;
  quality: 'high' | 'medium' | 'low';
  expires_at: number | null;
}

// Error types
export class YtDlpError extends Error {
  constructor(
    message: string,
    public readonly code: 'BINARY_NOT_FOUND' | 'NETWORK_ERROR' | 'PARSE_ERROR' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'YtDlpError';
  }
}

// Check if yt-dlp is available
let ytdlpAvailable: boolean | null = null;

export async function isYtDlpAvailable(): Promise<boolean> {
  if (ytdlpAvailable !== null) {
    return ytdlpAvailable;
  }

  try {
    // Try a simple search to check if binary works
    await invoke('search_youtube', { query: 'test', limit: 1 });
    ytdlpAvailable = true;
    return true;
  } catch (error) {
    console.warn('yt-dlp not available:', error);
    ytdlpAvailable = false;
    return false;
  }
}

// Reset availability check (useful after updates)
export function resetAvailabilityCheck(): void {
  ytdlpAvailable = null;
}

/**
 * Search YouTube for videos
 * @param query - Search query string
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of search results
 */
export async function searchYouTube(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  try {
    const results = await invoke<SearchResult[]>('search_youtube', {
      query,
      limit,
    });
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Failed to spawn')) {
      throw new YtDlpError('yt-dlp binary not found', 'BINARY_NOT_FOUND');
    }
    if (message.includes('network') || message.includes('connection')) {
      throw new YtDlpError('Network error during search', 'NETWORK_ERROR');
    }

    throw new YtDlpError(message, 'UNKNOWN');
  }
}

/**
 * Get detailed video information
 * @param videoId - YouTube video ID
 * @returns Detailed video info including tags, description, etc.
 */
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  try {
    const info = await invoke<VideoInfo>('get_video_info', { videoId });
    return info;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Failed to spawn')) {
      throw new YtDlpError('yt-dlp binary not found', 'BINARY_NOT_FOUND');
    }
    if (message.includes('Failed to parse')) {
      throw new YtDlpError('Failed to parse video metadata', 'PARSE_ERROR');
    }

    throw new YtDlpError(message, 'UNKNOWN');
  }
}

/**
 * Get audio stream URL for a video
 * @param videoId - YouTube video ID
 * @returns Audio stream information including URL
 */
export async function getAudioUrl(videoId: string): Promise<AudioStream> {
  try {
    const stream = await invoke<AudioStream>('get_audio_url', { videoId });
    return stream;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('Failed to spawn')) {
      throw new YtDlpError('yt-dlp binary not found', 'BINARY_NOT_FOUND');
    }

    throw new YtDlpError(message, 'UNKNOWN');
  }
}

/**
 * Fetch audio data from URL (CORS bypass via Tauri)
 * @param url - Audio stream URL
 * @returns Audio data as Uint8Array
 */
export async function fetchAudioData(url: string): Promise<Uint8Array> {
  try {
    const data = await invoke<number[]>('fetch_audio_data', { url });
    return new Uint8Array(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new YtDlpError(message, 'NETWORK_ERROR');
  }
}

// Convenience function: get audio buffer for analysis
export async function getAudioBuffer(videoId: string): Promise<ArrayBuffer> {
  const stream = await getAudioUrl(videoId);
  const data = await fetchAudioData(stream.url);
  return data.buffer;
}

// Cache for audio URLs (they expire after ~6 hours)
const audioUrlCache = new Map<string, { stream: AudioStream; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 60 * 1000; // 5 hours (with margin)

/**
 * Get cached audio URL or fetch new one
 * @param videoId - YouTube video ID
 * @returns Cached or fresh audio stream
 */
export async function getCachedAudioUrl(videoId: string): Promise<AudioStream> {
  const cached = audioUrlCache.get(videoId);
  const now = Date.now();

  if (cached) {
    const age = now - cached.fetchedAt;
    // Also check expires_at if available
    const expired = cached.stream.expires_at
      ? cached.stream.expires_at * 1000 < now
      : age > CACHE_TTL_MS;

    if (!expired) {
      return cached.stream;
    }
  }

  const stream = await getAudioUrl(videoId);
  audioUrlCache.set(videoId, { stream, fetchedAt: now });

  // Clean old entries
  if (audioUrlCache.size > 50) {
    const entries = Array.from(audioUrlCache.entries());
    entries
      .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)
      .slice(0, 25)
      .forEach(([key]) => audioUrlCache.delete(key));
  }

  return stream;
}

// Clear cache
export function clearAudioUrlCache(): void {
  audioUrlCache.clear();
}
