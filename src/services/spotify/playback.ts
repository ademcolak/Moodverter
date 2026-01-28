import { SpotifyPlaybackState } from '../../types/spotify';

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

// API request helper
const apiRequest = async <T>(
  endpoint: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T | null> => {
  const response = await fetch(`${SPOTIFY_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `API request failed: ${response.status}`);
  }

  return response.json();
};

// Get current playback state
export const getPlaybackState = async (
  accessToken: string
): Promise<SpotifyPlaybackState | null> => {
  return apiRequest<SpotifyPlaybackState>('/me/player', accessToken);
};

// Get currently playing track
export const getCurrentlyPlaying = async (
  accessToken: string
): Promise<SpotifyPlaybackState | null> => {
  return apiRequest<SpotifyPlaybackState>('/me/player/currently-playing', accessToken);
};

// Start/resume playback
export const play = async (
  accessToken: string,
  deviceId?: string
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  await apiRequest<void>(`/me/player/play${params}`, accessToken, {
    method: 'PUT',
  });
};

// Pause playback
export const pause = async (
  accessToken: string,
  deviceId?: string
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  await apiRequest<void>(`/me/player/pause${params}`, accessToken, {
    method: 'PUT',
  });
};

// Skip to next track
export const skipToNext = async (
  accessToken: string,
  deviceId?: string
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  await apiRequest<void>(`/me/player/next${params}`, accessToken, {
    method: 'POST',
  });
};

// Skip to previous track
export const skipToPrevious = async (
  accessToken: string,
  deviceId?: string
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  await apiRequest<void>(`/me/player/previous${params}`, accessToken, {
    method: 'POST',
  });
};

// Seek to position
export const seek = async (
  accessToken: string,
  positionMs: number,
  deviceId?: string
): Promise<void> => {
  const params = new URLSearchParams({
    position_ms: String(positionMs),
  });
  if (deviceId) {
    params.set('device_id', deviceId);
  }
  
  await apiRequest<void>(`/me/player/seek?${params.toString()}`, accessToken, {
    method: 'PUT',
  });
};

// Play a specific track
export const playTrack = async (
  accessToken: string,
  trackUri: string,
  deviceId?: string,
  positionMs?: number
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  
  const body: { uris: string[]; position_ms?: number } = {
    uris: [trackUri],
  };
  
  if (positionMs !== undefined) {
    body.position_ms = positionMs;
  }

  await apiRequest<void>(`/me/player/play${params}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
};

// Play tracks from a context (album, playlist)
export const playContext = async (
  accessToken: string,
  contextUri: string,
  deviceId?: string,
  offset?: { position?: number; uri?: string }
): Promise<void> => {
  const params = deviceId ? `?device_id=${deviceId}` : '';
  
  const body: { context_uri: string; offset?: typeof offset } = {
    context_uri: contextUri,
  };
  
  if (offset) {
    body.offset = offset;
  }

  await apiRequest<void>(`/me/player/play${params}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
};

// Add track to queue
export const addToQueue = async (
  accessToken: string,
  trackUri: string,
  deviceId?: string
): Promise<void> => {
  const params = new URLSearchParams({
    uri: trackUri,
  });
  if (deviceId) {
    params.set('device_id', deviceId);
  }

  await apiRequest<void>(`/me/player/queue?${params.toString()}`, accessToken, {
    method: 'POST',
  });
};

// Set playback volume
export const setVolume = async (
  accessToken: string,
  volumePercent: number,
  deviceId?: string
): Promise<void> => {
  const params = new URLSearchParams({
    volume_percent: String(Math.round(volumePercent)),
  });
  if (deviceId) {
    params.set('device_id', deviceId);
  }

  await apiRequest<void>(`/me/player/volume?${params.toString()}`, accessToken, {
    method: 'PUT',
  });
};

// Set shuffle state
export const setShuffle = async (
  accessToken: string,
  state: boolean,
  deviceId?: string
): Promise<void> => {
  const params = new URLSearchParams({
    state: String(state),
  });
  if (deviceId) {
    params.set('device_id', deviceId);
  }

  await apiRequest<void>(`/me/player/shuffle?${params.toString()}`, accessToken, {
    method: 'PUT',
  });
};

// Set repeat mode
export const setRepeat = async (
  accessToken: string,
  state: 'off' | 'track' | 'context',
  deviceId?: string
): Promise<void> => {
  const params = new URLSearchParams({
    state,
  });
  if (deviceId) {
    params.set('device_id', deviceId);
  }

  await apiRequest<void>(`/me/player/repeat?${params.toString()}`, accessToken, {
    method: 'PUT',
  });
};

// Get available devices
export const getDevices = async (
  accessToken: string
): Promise<{ devices: Array<{
  id: string;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
  volume_percent: number;
}> }> => {
  const result = await apiRequest<{ devices: Array<{
    id: string;
    is_active: boolean;
    is_private_session: boolean;
    is_restricted: boolean;
    name: string;
    type: string;
    volume_percent: number;
  }> }>(`/me/player/devices`, accessToken);
  return result || { devices: [] };
};

// Transfer playback to a device
export const transferPlayback = async (
  accessToken: string,
  deviceId: string,
  play = true
): Promise<void> => {
  await apiRequest<void>('/me/player', accessToken, {
    method: 'PUT',
    body: JSON.stringify({
      device_ids: [deviceId],
      play,
    }),
  });
};
