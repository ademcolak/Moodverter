import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCachedTracks,
  getCachedTrack,
  cacheTracks,
  cacheTrack,
  clearCache,
  cleanupCache,
  getCacheStats,
  getTrackCache,
  setTrackCache,
  needsFeatureUpdate,
  getTrackIdsNeedingFeatures,
  spotifyTrackToTrack,
} from '../../services/db/cache';
import { Track } from '../../types/track';
import { SpotifyTrack, SpotifyAudioFeatures } from '../../types/spotify';

// Helper to create a track with default values
const createTrack = (overrides: Partial<Track> = {}): Track => ({
  spotifyId: 'test-id-' + Math.random().toString(36).substr(2, 9),
  name: 'Test Track',
  artist: 'Test Artist',
  durationMs: 180000,
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
  acousticness: 0.3,
  instrumentalness: 0.1,
  key: 0,
  mode: 1,
  playCount: 0,
  ...overrides,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

describe('Cache Service', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  describe('getCachedTracks', () => {
    it('returns empty array when no cache exists', () => {
      const tracks = getCachedTracks();
      expect(tracks).toEqual([]);
    });

    it('returns cached tracks', () => {
      const track = createTrack({ spotifyId: 'track-1' });
      cacheTracks([track]);

      const tracks = getCachedTracks();
      expect(tracks).toHaveLength(1);
      expect(tracks[0].spotifyId).toBe('track-1');
    });

    it('returns empty array for invalid JSON', () => {
      localStorageMock.setItem('moodverter_track_cache', 'invalid json');

      const tracks = getCachedTracks();
      expect(tracks).toEqual([]);
    });

    it('clears cache and returns empty for wrong version', () => {
      localStorageMock.setItem('moodverter_track_cache', JSON.stringify({
        version: 999,
        tracks: { 'track-1': createTrack() },
        lastUpdated: Date.now(),
      }));

      const tracks = getCachedTracks();
      expect(tracks).toEqual([]);
    });
  });

  describe('getCachedTrack', () => {
    it('returns null when no cache exists', () => {
      const track = getCachedTrack('non-existent');
      expect(track).toBeNull();
    });

    it('returns null for non-existent track', () => {
      const track1 = createTrack({ spotifyId: 'track-1' });
      cacheTracks([track1]);

      const track = getCachedTrack('non-existent');
      expect(track).toBeNull();
    });

    it('returns cached track by id', () => {
      const track1 = createTrack({ spotifyId: 'track-1', name: 'First Track' });
      cacheTracks([track1]);

      const track = getCachedTrack('track-1');
      expect(track).not.toBeNull();
      expect(track?.name).toBe('First Track');
    });
  });

  describe('cacheTracks', () => {
    it('caches multiple tracks', () => {
      const tracks = [
        createTrack({ spotifyId: 'track-1' }),
        createTrack({ spotifyId: 'track-2' }),
        createTrack({ spotifyId: 'track-3' }),
      ];

      cacheTracks(tracks);

      const cached = getCachedTracks();
      expect(cached).toHaveLength(3);
    });

    it('updates existing tracks', () => {
      const track = createTrack({ spotifyId: 'track-1', name: 'Original Name' });
      cacheTracks([track]);

      const updatedTrack = createTrack({ spotifyId: 'track-1', name: 'Updated Name' });
      cacheTracks([updatedTrack]);

      const cached = getCachedTrack('track-1');
      expect(cached?.name).toBe('Updated Name');
    });

    it('adds to existing cache', () => {
      cacheTracks([createTrack({ spotifyId: 'track-1' })]);
      cacheTracks([createTrack({ spotifyId: 'track-2' })]);

      const cached = getCachedTracks();
      expect(cached).toHaveLength(2);
    });
  });

  describe('cacheTrack', () => {
    it('caches a single track', () => {
      const track = createTrack({ spotifyId: 'single-track' });
      cacheTrack(track);

      const cached = getCachedTrack('single-track');
      expect(cached).not.toBeNull();
    });
  });

  describe('clearCache', () => {
    it('removes all cached data', () => {
      cacheTracks([createTrack(), createTrack()]);
      expect(getCachedTracks()).toHaveLength(2);

      clearCache();

      expect(getCachedTracks()).toHaveLength(0);
    });
  });

  describe('cleanupCache', () => {
    it('returns 0 when no cache exists', () => {
      const removed = cleanupCache();
      expect(removed).toBe(0);
    });

    it('removes old tracks', () => {
      // Create cache with old track
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 days ago
      localStorageMock.setItem('moodverter_track_cache', JSON.stringify({
        version: 1,
        tracks: {
          'old-track': { ...createTrack({ spotifyId: 'old-track' }), cachedAt: oldDate },
        },
        lastUpdated: Date.now(),
      }));

      const removed = cleanupCache();
      expect(removed).toBe(1);
    });

    it('keeps recent tracks', () => {
      const track = createTrack({ spotifyId: 'recent-track' });
      cacheTracks([track]);

      const removed = cleanupCache();
      expect(removed).toBe(0);

      const cached = getCachedTrack('recent-track');
      expect(cached).not.toBeNull();
    });
  });

  describe('getCacheStats', () => {
    it('returns zeros for empty cache', () => {
      const stats = getCacheStats();
      expect(stats.trackCount).toBe(0);
      expect(stats.sizeKB).toBe(0);
      expect(stats.lastUpdated).toBeNull();
    });

    it('returns correct stats', () => {
      cacheTracks([createTrack(), createTrack(), createTrack()]);

      const stats = getCacheStats();
      expect(stats.trackCount).toBe(3);
      expect(stats.sizeKB).toBeGreaterThan(0);
      expect(stats.lastUpdated).not.toBeNull();
    });
  });

  describe('getTrackCache / setTrackCache', () => {
    it('setTrackCache replaces all tracks', () => {
      cacheTracks([createTrack({ spotifyId: 'old' })]);

      setTrackCache([
        createTrack({ spotifyId: 'new-1' }),
        createTrack({ spotifyId: 'new-2' }),
      ]);

      const tracks = getTrackCache();
      expect(tracks).toHaveLength(2);
      expect(tracks.find(t => t.spotifyId === 'old')).toBeUndefined();
    });

    it('getTrackCache is alias for getCachedTracks', () => {
      cacheTracks([createTrack({ spotifyId: 'test' })]);

      const tracks1 = getTrackCache();
      const tracks2 = getCachedTracks();

      expect(tracks1).toEqual(tracks2);
    });
  });

  describe('needsFeatureUpdate', () => {
    it('returns true for track with zero features', () => {
      const track = createTrack({
        energy: 0,
        valence: 0,
        tempo: 0,
      });

      expect(needsFeatureUpdate(track)).toBe(true);
    });

    it('returns false for track with features', () => {
      const track = createTrack({
        energy: 0.5,
        valence: 0.5,
        tempo: 120,
      });

      expect(needsFeatureUpdate(track)).toBe(false);
    });

    it('returns false if only some features are zero', () => {
      const track = createTrack({
        energy: 0.5,
        valence: 0,
        tempo: 0,
      });

      expect(needsFeatureUpdate(track)).toBe(false);
    });
  });

  describe('getTrackIdsNeedingFeatures', () => {
    it('returns empty array for empty cache', () => {
      const ids = getTrackIdsNeedingFeatures();
      expect(ids).toEqual([]);
    });

    it('returns IDs of tracks needing features', () => {
      setTrackCache([
        createTrack({ spotifyId: 'needs-1', energy: 0, valence: 0, tempo: 0 }),
        createTrack({ spotifyId: 'has-features', energy: 0.5, valence: 0.5, tempo: 120 }),
        createTrack({ spotifyId: 'needs-2', energy: 0, valence: 0, tempo: 0 }),
      ]);

      const ids = getTrackIdsNeedingFeatures();
      expect(ids).toContain('needs-1');
      expect(ids).toContain('needs-2');
      expect(ids).not.toContain('has-features');
    });

    it('respects limit parameter', () => {
      setTrackCache([
        createTrack({ spotifyId: 'needs-1', energy: 0, valence: 0, tempo: 0 }),
        createTrack({ spotifyId: 'needs-2', energy: 0, valence: 0, tempo: 0 }),
        createTrack({ spotifyId: 'needs-3', energy: 0, valence: 0, tempo: 0 }),
      ]);

      const ids = getTrackIdsNeedingFeatures(2);
      expect(ids).toHaveLength(2);
    });
  });

  describe('spotifyTrackToTrack', () => {
    it('converts Spotify track to internal Track type', () => {
      const spotifyTrack: SpotifyTrack = {
        id: 'spotify-123',
        name: 'Test Song',
        artists: [{ name: 'Artist 1' }, { name: 'Artist 2' }],
        album: {
          name: 'Test Album',
          images: [{ url: 'https://example.com/image.jpg' }],
          release_date: '2023-05-15',
        },
        duration_ms: 210000,
        uri: 'spotify:track:spotify-123',
      };

      const track = spotifyTrackToTrack(spotifyTrack);

      expect(track.spotifyId).toBe('spotify-123');
      expect(track.name).toBe('Test Song');
      expect(track.artist).toBe('Artist 1, Artist 2');
      expect(track.albumArt).toBe('https://example.com/image.jpg');
      expect(track.durationMs).toBe(210000);
      expect(track.releaseYear).toBe(2023);
      expect(track.playCount).toBe(0);
    });

    it('includes audio features when provided', () => {
      const spotifyTrack: SpotifyTrack = {
        id: 'spotify-123',
        name: 'Test Song',
        artists: [{ name: 'Artist' }],
        album: {
          name: 'Album',
          images: [],
          release_date: '2023',
        },
        duration_ms: 180000,
        uri: 'spotify:track:spotify-123',
      };

      const features: SpotifyAudioFeatures = {
        id: 'spotify-123',
        energy: 0.8,
        valence: 0.7,
        tempo: 128,
        danceability: 0.9,
        acousticness: 0.1,
        instrumentalness: 0.05,
        key: 5,
        mode: 1,
      };

      const track = spotifyTrackToTrack(spotifyTrack, features);

      expect(track.energy).toBe(0.8);
      expect(track.valence).toBe(0.7);
      expect(track.tempo).toBe(128);
      expect(track.danceability).toBe(0.9);
      expect(track.acousticness).toBe(0.1);
      expect(track.instrumentalness).toBe(0.05);
      expect(track.key).toBe(5);
      expect(track.mode).toBe(1);
    });

    it('uses default values when no features provided', () => {
      const spotifyTrack: SpotifyTrack = {
        id: 'spotify-123',
        name: 'Test',
        artists: [{ name: 'Artist' }],
        album: {
          name: 'Album',
          images: [],
          release_date: '2023',
        },
        duration_ms: 180000,
        uri: 'spotify:track:spotify-123',
      };

      const track = spotifyTrackToTrack(spotifyTrack);

      expect(track.energy).toBe(0);
      expect(track.valence).toBe(0);
      expect(track.tempo).toBe(0);
    });

    it('handles missing album art', () => {
      const spotifyTrack: SpotifyTrack = {
        id: 'spotify-123',
        name: 'Test',
        artists: [{ name: 'Artist' }],
        album: {
          name: 'Album',
          images: [],
          release_date: '2023',
        },
        duration_ms: 180000,
        uri: 'spotify:track:spotify-123',
      };

      const track = spotifyTrackToTrack(spotifyTrack);

      expect(track.albumArt).toBeUndefined();
    });
  });
});
