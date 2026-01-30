// Provider Factory and Utilities

import type {
  MusicProvider,
  ProviderType,
  UnifiedTrack,
  AudioFeatures,
  ProviderStatus,
} from '../../types/provider';
import type { Track } from '../../types/track';

// Provider registry - providers register themselves here
const providerRegistry = new Map<ProviderType, () => MusicProvider>();

export function registerProvider(
  type: ProviderType,
  factory: () => MusicProvider
): void {
  providerRegistry.set(type, factory);
}

export function createProvider(type: ProviderType): MusicProvider {
  const factory = providerRegistry.get(type);
  if (!factory) {
    throw new Error(`Provider "${type}" is not registered`);
  }
  return factory();
}

export function getAvailableProviders(): ProviderType[] {
  return Array.from(providerRegistry.keys());
}

export function isProviderRegistered(type: ProviderType): boolean {
  return providerRegistry.has(type);
}

// Track conversion utilities

export function extractAudioFeatures(track: Track): AudioFeatures {
  return {
    energy: track.energy,
    valence: track.valence,
    tempo: track.tempo,
    danceability: track.danceability,
    acousticness: track.acousticness,
    instrumentalness: track.instrumentalness,
    key: track.key,
    mode: track.mode,
  };
}

export function legacyTrackToUnified(
  track: Track,
  provider: ProviderType = 'spotify'
): UnifiedTrack {
  return {
    id: track.spotifyId,
    provider,
    name: track.name,
    artist: track.artist,
    albumArt: track.albumArt,
    durationMs: track.durationMs,
    releaseYear: track.releaseYear,
    audioFeatures: extractAudioFeatures(track),
    introEndMs: track.introEndMs,
    outroStartMs: track.outroStartMs,
    lastPlayed: track.lastPlayed,
    playCount: track.playCount,
    cachedAt: track.cachedAt,
  };
}

export function unifiedToLegacyTrack(unified: UnifiedTrack): Track {
  const features = unified.audioFeatures ?? {
    energy: 0.5,
    valence: 0.5,
    tempo: 120,
    danceability: 0.5,
    acousticness: 0.5,
    instrumentalness: 0,
    key: 0,
    mode: 1,
  };

  return {
    spotifyId: unified.id,
    name: unified.name,
    artist: unified.artist,
    albumArt: unified.albumArt,
    durationMs: unified.durationMs,
    releaseYear: unified.releaseYear,
    energy: features.energy,
    valence: features.valence,
    tempo: features.tempo,
    danceability: features.danceability,
    acousticness: features.acousticness,
    instrumentalness: features.instrumentalness,
    key: features.key,
    mode: features.mode,
    introEndMs: unified.introEndMs,
    outroStartMs: unified.outroStartMs,
    lastPlayed: unified.lastPlayed,
    playCount: unified.playCount,
    cachedAt: unified.cachedAt,
  };
}

// Default audio features for when analysis isn't available
export const DEFAULT_AUDIO_FEATURES: AudioFeatures = {
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
  acousticness: 0.5,
  instrumentalness: 0,
  key: 0,
  mode: 1,
};

// Provider status check utility
export async function checkProviderStatus(
  provider: MusicProvider
): Promise<ProviderStatus> {
  try {
    const isAuthenticated = provider.isAuthenticated();
    return {
      type: provider.name,
      isAvailable: true,
      isAuthenticated,
    };
  } catch (error) {
    return {
      type: provider.name,
      isAvailable: false,
      isAuthenticated: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
