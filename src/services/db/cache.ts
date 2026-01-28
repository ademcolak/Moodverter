import { Track } from '../../types/track';
import { SpotifyTrack, SpotifyAudioFeatures } from '../../types/spotify';

const CACHE_KEY = 'moodverter_track_cache';
const CACHE_VERSION = 1;
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheData {
  version: number;
  tracks: Record<string, Track>;
  lastUpdated: number;
}

// Get cached tracks
export const getCachedTracks = (): Track[] => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return [];

    const cache: CacheData = JSON.parse(data);
    
    // Check version
    if (cache.version !== CACHE_VERSION) {
      clearCache();
      return [];
    }

    return Object.values(cache.tracks);
  } catch (err) {
    console.error('Failed to read cache:', err);
    return [];
  }
};

// Get a single cached track
export const getCachedTrack = (spotifyId: string): Track | null => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return null;

    const cache: CacheData = JSON.parse(data);
    return cache.tracks[spotifyId] || null;
  } catch {
    return null;
  }
};

// Cache tracks
export const cacheTracks = (tracks: Track[]): void => {
  try {
    const existing = localStorage.getItem(CACHE_KEY);
    let cache: CacheData;

    if (existing) {
      cache = JSON.parse(existing);
      if (cache.version !== CACHE_VERSION) {
        cache = { version: CACHE_VERSION, tracks: {}, lastUpdated: Date.now() };
      }
    } else {
      cache = { version: CACHE_VERSION, tracks: {}, lastUpdated: Date.now() };
    }

    // Add/update tracks
    for (const track of tracks) {
      cache.tracks[track.spotifyId] = {
        ...track,
        cachedAt: new Date(),
      };
    }

    cache.lastUpdated = Date.now();
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error('Failed to cache tracks:', err);
  }
};

// Cache a single track
export const cacheTrack = (track: Track): void => {
  cacheTracks([track]);
};

// Update track with audio features
export const updateTrackFeatures = (
  spotifyId: string,
  features: SpotifyAudioFeatures
): void => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return;

    const cache: CacheData = JSON.parse(data);
    const track = cache.tracks[spotifyId];
    
    if (track) {
      cache.tracks[spotifyId] = {
        ...track,
        energy: features.energy,
        valence: features.valence,
        tempo: features.tempo,
        danceability: features.danceability,
        acousticness: features.acousticness,
        instrumentalness: features.instrumentalness,
        key: features.key,
        mode: features.mode,
      };
      
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.error('Failed to update track features:', err);
  }
};

// Convert Spotify track to our Track type
export const spotifyTrackToTrack = (
  spotifyTrack: SpotifyTrack,
  features?: SpotifyAudioFeatures
): Track => {
  return {
    spotifyId: spotifyTrack.id,
    name: spotifyTrack.name,
    artist: spotifyTrack.artists.map(a => a.name).join(', '),
    albumArt: spotifyTrack.album.images[0]?.url,
    durationMs: spotifyTrack.duration_ms,
    releaseYear: parseInt(spotifyTrack.album.release_date.split('-')[0]),
    energy: features?.energy || 0,
    valence: features?.valence || 0,
    tempo: features?.tempo || 0,
    danceability: features?.danceability || 0,
    acousticness: features?.acousticness || 0,
    instrumentalness: features?.instrumentalness || 0,
    key: features?.key || 0,
    mode: features?.mode || 0,
    playCount: 0,
  };
};

// Clear old cached tracks
export const cleanupCache = (): number => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) return 0;

    const cache: CacheData = JSON.parse(data);
    const now = Date.now();
    let removed = 0;

    for (const [id, track] of Object.entries(cache.tracks)) {
      if (track.cachedAt) {
        const cacheAge = now - new Date(track.cachedAt).getTime();
        if (cacheAge > CACHE_MAX_AGE_MS) {
          delete cache.tracks[id];
          removed++;
        }
      }
    }

    if (removed > 0) {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }

    return removed;
  } catch {
    return 0;
  }
};

// Clear all cached data
export const clearCache = (): void => {
  localStorage.removeItem(CACHE_KEY);
};

// Get cache stats
export const getCacheStats = (): { 
  trackCount: number; 
  sizeKB: number; 
  lastUpdated: Date | null;
  lastSync: number | null;
} => {
  try {
    const data = localStorage.getItem(CACHE_KEY);
    if (!data) {
      return { trackCount: 0, sizeKB: 0, lastUpdated: null, lastSync: null };
    }

    const cache: CacheData = JSON.parse(data);
    return {
      trackCount: Object.keys(cache.tracks).length,
      sizeKB: Math.round(data.length / 1024),
      lastUpdated: new Date(cache.lastUpdated),
      lastSync: cache.lastUpdated,
    };
  } catch {
    return { trackCount: 0, sizeKB: 0, lastUpdated: null, lastSync: null };
  }
};

// Get all tracks from cache (alias for getCachedTracks)
export const getTrackCache = (): Track[] => {
  return getCachedTracks();
};

// Set all tracks in cache (replaces existing)
export const setTrackCache = (tracks: Track[]): void => {
  try {
    const cache: CacheData = {
      version: CACHE_VERSION,
      tracks: {},
      lastUpdated: Date.now(),
    };

    for (const track of tracks) {
      cache.tracks[track.spotifyId] = {
        ...track,
        cachedAt: new Date(),
      };
    }

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.error('Failed to set track cache:', err);
  }
};

// Check if track needs feature update
export const needsFeatureUpdate = (track: Track): boolean => {
  return track.energy === 0 && track.valence === 0 && track.tempo === 0;
};

// Get track IDs that need feature updates
export const getTrackIdsNeedingFeatures = (limit = 100): string[] => {
  const tracks = getCachedTracks();
  return tracks
    .filter(needsFeatureUpdate)
    .slice(0, limit)
    .map(t => t.spotifyId);
};
