import { invoke } from '@tauri-apps/api/core';

export interface SearchResult {
  id: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  view_count: number | null;
  thumbnail: string | null;
}

export class YtDlpError extends Error {
  constructor(
    message: string,
    public readonly code: 'BINARY_NOT_FOUND' | 'NETWORK_ERROR' | 'UNKNOWN'
  ) {
    super(message);
    this.name = 'YtDlpError';
  }
}

let ytdlpAvailable: boolean | null = null;

export async function isYtDlpAvailable(): Promise<boolean> {
  if (ytdlpAvailable !== null) return ytdlpAvailable;
  try {
    await invoke('search_youtube', { query: 'test', limit: 1 });
    ytdlpAvailable = true;
    return true;
  } catch (error) {
    console.warn('yt-dlp not available:', error);
    ytdlpAvailable = false;
    return false;
  }
}

export async function searchYouTube(query: string, limit = 10): Promise<SearchResult[]> {
  try {
    return await invoke<SearchResult[]>('search_youtube', { query, limit });
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
