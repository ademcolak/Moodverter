import { describe, it, expect, beforeEach } from 'vitest';
import type { VideoMetadata } from '../../../types/youtube';
import {
  detectGenresAndMoods,
  parseMetadata,
  cacheMetadata,
  getCachedMetadata,
  clearMetadataCache,
} from '../../../services/youtube/metadata';

describe('YouTube metadata parser', () => {
  beforeEach(() => {
    clearMetadataCache();
  });

  it('detects genres and moods from metadata text', () => {
    const result = detectGenresAndMoods(
      'Energetic Rock Workout Mix',
      'Upbeat tracks for gym and training motivation',
      ['rock', 'workout', 'hype']
    );

    expect(result.genres).toContain('rock');
    expect(result.moods).toContain('energetic');
    expect(result.moods).toContain('workout');
  });

  it('parses metadata into structured output with confidence', () => {
    const metadata: VideoMetadata = {
      videoId: 'video-1',
      title: 'Artist - Song Name',
      artist: 'Artist',
      songName: 'Song Name',
      uploader: 'Artist Channel',
      description: 'Detailed description with genre hints and context for parser confidence.',
      genres: ['rock'],
      moods: ['energetic'],
      tags: ['rock', 'workout'],
      duration: 180000,
      thumbnail: 'thumb.jpg',
      parsedAt: Date.now(),
    };

    const result = parseMetadata(metadata);

    expect(result.artist).toBe('Artist');
    expect(result.songName).toBe('Song Name');
    expect(result.genres).toEqual(['rock']);
    expect(result.moods).toEqual(['energetic']);
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it('caches and reads metadata by video id', () => {
    const metadata: VideoMetadata = {
      videoId: 'video-2',
      title: 'Test Title',
      artist: 'Test Artist',
      songName: 'Test Song',
      uploader: 'Test Uploader',
      genres: ['indie'],
      moods: ['chill'],
      tags: [],
      duration: 120000,
      thumbnail: 'thumb-2.jpg',
      parsedAt: Date.now(),
    };

    cacheMetadata(metadata);
    const cached = getCachedMetadata('video-2');

    expect(cached).not.toBeNull();
    expect(cached?.artist).toBe('Test Artist');
  });
});
