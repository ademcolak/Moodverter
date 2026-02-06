import { describe, it, expect, vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  searchYouTube,
  getVideoInfo,
  getCachedAudioUrl,
  isYtDlpAvailable,
  resetAvailabilityCheck,
  clearAudioUrlCache,
} from '../../../services/youtube/ytdlp';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe('yt-dlp wrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAvailabilityCheck();
    clearAudioUrlCache();
  });

  it('searches YouTube successfully', async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: 'abc123',
        title: 'Test Video',
        uploader: 'Artist',
        duration: 120,
        view_count: 1000,
        thumbnail: 'thumb.jpg',
      },
    ]);

    const result = await searchYouTube('test query', 5);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('abc123');
    expect(mockInvoke).toHaveBeenCalledWith('search_youtube', {
      query: 'test query',
      limit: 5,
    });
  });

  it('maps binary-not-found errors', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Failed to spawn command'));

    await expect(searchYouTube('query')).rejects.toMatchObject({
      code: 'BINARY_NOT_FOUND',
    });
  });

  it('maps parse errors for video info', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('Failed to parse video metadata'));

    await expect(getVideoInfo('abc123')).rejects.toMatchObject({
      code: 'PARSE_ERROR',
    });
  });

  it('caches availability checks', async () => {
    mockInvoke.mockResolvedValueOnce([]);

    const first = await isYtDlpAvailable();
    const second = await isYtDlpAvailable();

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it('caches audio urls', async () => {
    mockInvoke.mockResolvedValueOnce({
      url: 'https://audio.example/stream',
      format: 'mp3',
      quality: 'high',
      expires_at: null,
    });

    const first = await getCachedAudioUrl('video-1');
    const second = await getCachedAudioUrl('video-1');

    expect(first.url).toBe('https://audio.example/stream');
    expect(second.url).toBe('https://audio.example/stream');
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });
});
