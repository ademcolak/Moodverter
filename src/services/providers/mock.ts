// MockProvider - Implements MusicProvider interface for demo/development

import type {
  MusicProvider,
  UnifiedTrack,
  AudioFeatures,
  PlaybackState,
} from '../../types/provider';
import type { Track } from '../../types/track';
import {
  MOCK_TRACKS,
  getMockState,
  mockPlay,
  mockPause,
  mockSkipNext,
  mockSkipPrevious,
  mockSeek,
  mockPlayTrack,
  mockGetCurrentTrack,
  mockGetLibrary,
  resetMockState,
  onMockStateChange,
} from '../mock';
import { registerProvider, extractAudioFeatures } from './index';

export class MockProvider implements MusicProvider {
  readonly name = 'mock' as const;
  private volume = 100;
  private stateChangeCallback: ((state: PlaybackState) => void) | null = null;

  constructor() {
    // Subscribe to mock state changes
    onMockStateChange(state => {
      if (this.stateChangeCallback) {
        this.stateChangeCallback(this.mockStateToPlaybackState(state));
      }
    });
  }

  // Authentication (always authenticated in mock mode)

  isAuthenticated(): boolean {
    return true;
  }

  async authenticate(): Promise<void> {
    // No-op for mock
  }

  logout(): void {
    resetMockState();
  }

  // Library access

  async getLibrary(): Promise<UnifiedTrack[]> {
    const library = mockGetLibrary();
    return library.map(track => this.legacyTrackToUnified(track));
  }

  async search(query: string): Promise<UnifiedTrack[]> {
    const library = mockGetLibrary();
    const lowerQuery = query.toLowerCase();

    const filtered = library.filter(
      track =>
        track.name.toLowerCase().includes(lowerQuery) ||
        track.artist.toLowerCase().includes(lowerQuery)
    );

    return filtered.map(track => this.legacyTrackToUnified(track));
  }

  // Playback control

  async play(trackId: string): Promise<void> {
    mockPlayTrack(trackId);
  }

  async pause(): Promise<void> {
    mockPause();
  }

  async resume(): Promise<void> {
    mockPlay();
  }

  async skip(): Promise<void> {
    mockSkipNext();
  }

  async previous(): Promise<void> {
    mockSkipPrevious();
  }

  async seek(positionMs: number): Promise<void> {
    mockSeek(positionMs);
  }

  async setVolume(percent: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, percent));
  }

  // State

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    const track = mockGetCurrentTrack();
    if (!track) return null;
    return this.legacyTrackToUnified(track);
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    const state = getMockState();
    return this.mockStateToPlaybackState(state);
  }

  // Audio features

  async getAudioFeatures(trackId: string): Promise<AudioFeatures | null> {
    const track = MOCK_TRACKS.find(t => t.spotifyId === trackId);
    if (!track) return null;
    return extractAudioFeatures(track);
  }

  async getAudioFeaturesForTracks(
    trackIds: string[]
  ): Promise<Map<string, AudioFeatures>> {
    const result = new Map<string, AudioFeatures>();

    for (const id of trackIds) {
      const track = MOCK_TRACKS.find(t => t.spotifyId === id);
      if (track) {
        result.set(id, extractAudioFeatures(track));
      }
    }

    return result;
  }

  // Conversion helpers

  private legacyTrackToUnified(track: Track): UnifiedTrack {
    return {
      id: track.spotifyId,
      provider: 'mock',
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

  private mockStateToPlaybackState(state: {
    isPlaying: boolean;
    currentTrackIndex: number;
    progress: number;
    library: Track[];
  }): PlaybackState {
    const currentTrack = state.library[state.currentTrackIndex];

    return {
      isPlaying: state.isPlaying,
      currentTrack: currentTrack ? this.legacyTrackToUnified(currentTrack) : null,
      progressMs: state.progress,
      durationMs: currentTrack?.durationMs ?? 0,
      volume: this.volume,
      deviceName: 'Mock Player',
    };
  }

  // Subscribe to state changes
  onStateChange(callback: (state: PlaybackState) => void): void {
    this.stateChangeCallback = callback;
  }
}

// Register the provider
registerProvider('mock', () => new MockProvider());

// Export singleton instance
let mockProviderInstance: MockProvider | null = null;

export function getMockProvider(): MockProvider {
  if (!mockProviderInstance) {
    mockProviderInstance = new MockProvider();
  }
  return mockProviderInstance;
}
