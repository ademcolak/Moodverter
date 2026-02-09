// Provider Types - YouTube-only abstraction

export type ProviderType = 'youtube';

export type PlaybackEventType =
  | 'track_started'
  | 'track_ended'
  | 'playback_paused'
  | 'playback_resumed'
  | 'playback_error';

export interface PlaybackEvent {
  type: PlaybackEventType;
  provider: ProviderType;
  timestamp: number;
  track?: UnifiedTrack | null;
  previousTrack?: UnifiedTrack | null;
  reason?: 'natural' | 'skip' | 'previous' | 'manual' | 'error';
  progressMs?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export type PlaybackEventListener = (event: PlaybackEvent) => void;

// Platform-agnostic track representation
export interface UnifiedTrack {
  id: string;
  provider: ProviderType;
  name: string;
  artist: string;
  albumArt?: string;
  durationMs: number;
  playCount: number;
  providerData?: Record<string, unknown>;
}

// Playback state across providers
export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: UnifiedTrack | null;
  progressMs: number;
  durationMs: number;
  volume: number;          // 0-100
  deviceName?: string;
}

// Music provider interface - all providers must implement this
export interface MusicProvider {
  readonly name: ProviderType;

  // Authentication
  isAuthenticated(): boolean;
  authenticate(): Promise<void>;
  logout(): void;

  // Library access
  getLibrary(): Promise<UnifiedTrack[]>;
  search(query: string): Promise<UnifiedTrack[]>;

  // Playback control
  play(trackId: string): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  previous(): Promise<void>;
  seek(positionMs: number): Promise<void>;

  // State
  getCurrentTrack(): Promise<UnifiedTrack | null>;
  getPlaybackState(): Promise<PlaybackState | null>;
  onPlaybackEvent(listener: PlaybackEventListener): () => void;
}
