import {
  SpotifyUser,
  SpotifyTrack,
  SpotifyAudioFeatures,
  SpotifyAudioAnalysis,
  SpotifyPlaylist,
  SpotifySavedTrack,
  SpotifyPagination,
} from '../../types/spotify';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// Rate limiting helper
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // ms between requests

const rateLimit = async () => {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
};

// API request helper
const apiRequest = async <T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> => {
  await rateLimit();

  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 429) {
    // Rate limited - wait and retry
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return apiRequest(endpoint, accessToken, options);
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  // Handle empty responses
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
};

// Get current user profile
export const getCurrentUser = async (accessToken: string): Promise<SpotifyUser> => {
  return apiRequest<SpotifyUser>('/me', accessToken);
};

// Get user's saved tracks (library)
export const getSavedTracks = async (
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPagination<SpotifySavedTrack>> => {
  return apiRequest<SpotifyPagination<SpotifySavedTrack>>(
    `/me/tracks?limit=${limit}&offset=${offset}`,
    accessToken
  );
};

// Get all saved tracks (handles pagination)
export const getAllSavedTracks = async (
  accessToken: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<SpotifySavedTrack[]> => {
  const allTracks: SpotifySavedTrack[] = [];
  let offset = 0;
  const limit = 50;
  
  // First request to get total
  const firstPage = await getSavedTracks(accessToken, limit, 0);
  allTracks.push(...firstPage.items);
  const total = firstPage.total;
  
  onProgress?.(allTracks.length, total);

  // Fetch remaining pages
  while (allTracks.length < total) {
    offset += limit;
    const page = await getSavedTracks(accessToken, limit, offset);
    allTracks.push(...page.items);
    onProgress?.(allTracks.length, total);
  }

  return allTracks;
};

// Get user's playlists
export const getPlaylists = async (
  accessToken: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPagination<SpotifyPlaylist>> => {
  return apiRequest<SpotifyPagination<SpotifyPlaylist>>(
    `/me/playlists?limit=${limit}&offset=${offset}`,
    accessToken
  );
};

// Get tracks from a playlist
export const getPlaylistTracks = async (
  accessToken: string,
  playlistId: string,
  limit = 100,
  offset = 0
): Promise<SpotifyPagination<{ track: SpotifyTrack }>> => {
  return apiRequest<SpotifyPagination<{ track: SpotifyTrack }>>(
    `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
    accessToken
  );
};

// Get audio features for a single track
export const getAudioFeatures = async (
  accessToken: string,
  trackId: string
): Promise<SpotifyAudioFeatures> => {
  return apiRequest<SpotifyAudioFeatures>(
    `/audio-features/${trackId}`,
    accessToken
  );
};

// Get audio features for multiple tracks (batch, max 100)
export const getAudioFeaturesBatch = async (
  accessToken: string,
  trackIds: string[]
): Promise<SpotifyAudioFeatures[]> => {
  if (trackIds.length === 0) return [];
  if (trackIds.length > 100) {
    throw new Error('Maximum 100 tracks per batch');
  }

  const response = await apiRequest<{ audio_features: (SpotifyAudioFeatures | null)[] }>(
    `/audio-features?ids=${trackIds.join(',')}`,
    accessToken
  );

  // Filter out null values (tracks without audio features)
  return response.audio_features.filter((f): f is SpotifyAudioFeatures => f !== null);
};

// Get audio analysis for a track (detailed)
export const getAudioAnalysis = async (
  accessToken: string,
  trackId: string
): Promise<SpotifyAudioAnalysis> => {
  return apiRequest<SpotifyAudioAnalysis>(
    `/audio-analysis/${trackId}`,
    accessToken
  );
};

// Get recommendations based on seed tracks
export const getRecommendations = async (
  accessToken: string,
  options: {
    seedTracks?: string[];
    seedArtists?: string[];
    seedGenres?: string[];
    limit?: number;
    targetEnergy?: number;
    targetValence?: number;
    targetTempo?: number;
    targetDanceability?: number;
    targetAcousticness?: number;
    minTempo?: number;
    maxTempo?: number;
  }
): Promise<{ tracks: SpotifyTrack[] }> => {
  const params = new URLSearchParams();
  
  if (options.seedTracks?.length) {
    params.set('seed_tracks', options.seedTracks.slice(0, 5).join(','));
  }
  if (options.seedArtists?.length) {
    params.set('seed_artists', options.seedArtists.slice(0, 5).join(','));
  }
  if (options.seedGenres?.length) {
    params.set('seed_genres', options.seedGenres.slice(0, 5).join(','));
  }
  
  params.set('limit', String(options.limit || 20));
  
  if (options.targetEnergy !== undefined) {
    params.set('target_energy', String(options.targetEnergy));
  }
  if (options.targetValence !== undefined) {
    params.set('target_valence', String(options.targetValence));
  }
  if (options.targetTempo !== undefined) {
    params.set('target_tempo', String(options.targetTempo));
  }
  if (options.targetDanceability !== undefined) {
    params.set('target_danceability', String(options.targetDanceability));
  }
  if (options.targetAcousticness !== undefined) {
    params.set('target_acousticness', String(options.targetAcousticness));
  }
  if (options.minTempo !== undefined) {
    params.set('min_tempo', String(options.minTempo));
  }
  if (options.maxTempo !== undefined) {
    params.set('max_tempo', String(options.maxTempo));
  }

  return apiRequest<{ tracks: SpotifyTrack[] }>(
    `/recommendations?${params.toString()}`,
    accessToken
  );
};

// Search for tracks
export const searchTracks = async (
  accessToken: string,
  query: string,
  limit = 20
): Promise<{ tracks: SpotifyPagination<SpotifyTrack> }> => {
  const params = new URLSearchParams({
    q: query,
    type: 'track',
    limit: String(limit),
  });

  return apiRequest<{ tracks: SpotifyPagination<SpotifyTrack> }>(
    `/search?${params.toString()}`,
    accessToken
  );
};

// Get a specific track
export const getTrack = async (
  accessToken: string,
  trackId: string
): Promise<SpotifyTrack> => {
  return apiRequest<SpotifyTrack>(`/tracks/${trackId}`, accessToken);
};

// Get multiple tracks
export const getTracks = async (
  accessToken: string,
  trackIds: string[]
): Promise<{ tracks: SpotifyTrack[] }> => {
  if (trackIds.length === 0) return { tracks: [] };
  if (trackIds.length > 50) {
    throw new Error('Maximum 50 tracks per request');
  }

  return apiRequest<{ tracks: SpotifyTrack[] }>(
    `/tracks?ids=${trackIds.join(',')}`,
    accessToken
  );
};
