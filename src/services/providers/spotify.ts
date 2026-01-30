// SpotifyProvider - Implements MusicProvider interface for Spotify

import type {
  MusicProvider,
  UnifiedTrack,
  AudioFeatures,
  PlaybackState,
} from '../../types/provider';
import type {
  SpotifyTrack,
  SpotifyAudioFeatures,
  SpotifyTokens,
} from '../../types/spotify';
import * as auth from '../spotify/auth';
import * as api from '../spotify/api';
import * as playback from '../spotify/playback';
import { registerProvider } from './index';

export class SpotifyProvider implements MusicProvider {
  readonly name = 'spotify' as const;
  private tokens: SpotifyTokens | null = null;
  private deviceId: string | null = null;

  constructor() {
    this.loadTokens();
  }

  private async loadTokens(): Promise<void> {
    this.tokens = await auth.getStoredTokens();
  }

  private async getAccessToken(): Promise<string> {
    if (!this.tokens) {
      this.tokens = await auth.getStoredTokens();
    }

    if (!this.tokens) {
      throw new Error('Not authenticated with Spotify');
    }

    // Check if token is expired
    if (this.tokens.expires_at < Date.now()) {
      const refreshed = await auth.refreshAccessToken(this.tokens.refresh_token);
      if (!refreshed) {
        throw new Error('Failed to refresh Spotify token');
      }
      this.tokens = refreshed;
    }

    return this.tokens.access_token;
  }

  // Authentication

  isAuthenticated(): boolean {
    return this.tokens !== null;
  }

  async authenticate(): Promise<void> {
    const tokens = await auth.login();
    if (tokens) {
      this.tokens = tokens;
    }
  }

  logout(): void {
    auth.logout();
    this.tokens = null;
  }

  // Library access

  async getLibrary(): Promise<UnifiedTrack[]> {
    const accessToken = await this.getAccessToken();
    const savedTracks = await api.getAllSavedTracks(accessToken);

    return savedTracks.map(item => this.spotifyTrackToUnified(item.track));
  }

  async search(query: string): Promise<UnifiedTrack[]> {
    const accessToken = await this.getAccessToken();
    const result = await api.searchTracks(accessToken, query);

    return result.tracks.items.map(track => this.spotifyTrackToUnified(track));
  }

  // Playback control

  async play(trackId: string): Promise<void> {
    const accessToken = await this.getAccessToken();
    const trackUri = `spotify:track:${trackId}`;
    await playback.playTrack(accessToken, trackUri, this.deviceId ?? undefined);
  }

  async pause(): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.pause(accessToken, this.deviceId ?? undefined);
  }

  async resume(): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.play(accessToken, this.deviceId ?? undefined);
  }

  async skip(): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.skipToNext(accessToken, this.deviceId ?? undefined);
  }

  async previous(): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.skipToPrevious(accessToken, this.deviceId ?? undefined);
  }

  async seek(positionMs: number): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.seek(accessToken, positionMs, this.deviceId ?? undefined);
  }

  async setVolume(percent: number): Promise<void> {
    const accessToken = await this.getAccessToken();
    await playback.setVolume(accessToken, percent, this.deviceId ?? undefined);
  }

  // State

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    const accessToken = await this.getAccessToken();
    const state = await playback.getPlaybackState(accessToken);

    if (!state?.item) {
      return null;
    }

    return this.spotifyTrackToUnified(state.item);
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    const accessToken = await this.getAccessToken();
    const state = await playback.getPlaybackState(accessToken);

    if (!state) {
      return null;
    }

    // Update device ID for future calls
    if (state.device?.id) {
      this.deviceId = state.device.id;
    }

    return {
      isPlaying: state.is_playing,
      currentTrack: state.item ? this.spotifyTrackToUnified(state.item) : null,
      progressMs: state.progress_ms,
      durationMs: state.item?.duration_ms ?? 0,
      volume: state.device?.volume_percent ?? 100,
      deviceName: state.device?.name,
    };
  }

  // Audio features

  async getAudioFeatures(trackId: string): Promise<AudioFeatures | null> {
    try {
      const accessToken = await this.getAccessToken();
      const features = await api.getAudioFeatures(accessToken, trackId);
      return this.spotifyFeaturesToAudioFeatures(features);
    } catch {
      return null;
    }
  }

  async getAudioFeaturesForTracks(
    trackIds: string[]
  ): Promise<Map<string, AudioFeatures>> {
    const result = new Map<string, AudioFeatures>();

    if (trackIds.length === 0) {
      return result;
    }

    const accessToken = await this.getAccessToken();

    // Batch in groups of 100 (Spotify API limit)
    for (let i = 0; i < trackIds.length; i += 100) {
      const batch = trackIds.slice(i, i + 100);
      try {
        const features = await api.getAudioFeaturesBatch(accessToken, batch);
        for (const feature of features) {
          result.set(feature.id, this.spotifyFeaturesToAudioFeatures(feature));
        }
      } catch (error) {
        console.error('Failed to fetch audio features batch:', error);
      }
    }

    return result;
  }

  // Conversion helpers

  private spotifyTrackToUnified(track: SpotifyTrack): UnifiedTrack {
    const releaseYear = track.album.release_date
      ? parseInt(track.album.release_date.split('-')[0], 10)
      : undefined;

    return {
      id: track.id,
      provider: 'spotify',
      name: track.name,
      artist: track.artists.map(a => a.name).join(', '),
      albumArt: track.album.images[0]?.url,
      durationMs: track.duration_ms,
      releaseYear,
      playCount: 0,
      providerData: {
        uri: track.uri,
        popularity: track.popularity,
        explicit: track.explicit,
        previewUrl: track.preview_url,
      },
    };
  }

  private spotifyFeaturesToAudioFeatures(
    features: SpotifyAudioFeatures
  ): AudioFeatures {
    return {
      energy: features.energy,
      valence: features.valence,
      tempo: features.tempo,
      danceability: features.danceability,
      acousticness: features.acousticness,
      instrumentalness: features.instrumentalness,
      key: features.key,
      mode: features.mode,
    };
  }

  // Spotify-specific methods

  async getDevices() {
    const accessToken = await this.getAccessToken();
    return playback.getDevices(accessToken);
  }

  async transferPlayback(deviceId: string, play = true) {
    const accessToken = await this.getAccessToken();
    await playback.transferPlayback(accessToken, deviceId, play);
    this.deviceId = deviceId;
  }

  setActiveDevice(deviceId: string) {
    this.deviceId = deviceId;
  }
}

// Register the provider
registerProvider('spotify', () => new SpotifyProvider());

// Export singleton instance
let spotifyProviderInstance: SpotifyProvider | null = null;

export function getSpotifyProvider(): SpotifyProvider {
  if (!spotifyProviderInstance) {
    spotifyProviderInstance = new SpotifyProvider();
  }
  return spotifyProviderInstance;
}
