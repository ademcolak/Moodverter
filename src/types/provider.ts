// Provider Types - Multi-platform music provider abstraction

export type ProviderType = 'spotify' | 'youtube' | 'mock';

// Standardized audio features (0-1 normalized where applicable)
export interface AudioFeatures {
  energy: number;          // 0-1
  valence: number;         // 0-1 (positivity/happiness)
  tempo: number;           // BPM
  danceability: number;    // 0-1
  acousticness: number;    // 0-1
  instrumentalness: number; // 0-1
  key: number;             // 0-11 (pitch class)
  mode: number;            // 0=minor, 1=major
}

// Platform-agnostic track representation
export interface UnifiedTrack {
  id: string;              // Provider-specific ID
  provider: ProviderType;
  name: string;
  artist: string;
  albumArt?: string;
  durationMs: number;
  releaseYear?: number;

  // Audio features (may be null if not yet analyzed)
  audioFeatures?: AudioFeatures;

  // Transition points (optional, for advanced playback)
  introEndMs?: number;
  outroStartMs?: number;

  // Metadata
  lastPlayed?: Date;
  playCount: number;
  cachedAt?: Date;

  // Provider-specific data (for advanced features)
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
  setVolume(percent: number): Promise<void>;

  // State
  getCurrentTrack(): Promise<UnifiedTrack | null>;
  getPlaybackState(): Promise<PlaybackState | null>;

  // Audio features
  getAudioFeatures(trackId: string): Promise<AudioFeatures | null>;
  getAudioFeaturesForTracks(trackIds: string[]): Promise<Map<string, AudioFeatures>>;
}

// Provider factory type
export type ProviderFactory = (type: ProviderType) => MusicProvider;

// Provider status for UI
export interface ProviderStatus {
  type: ProviderType;
  isAvailable: boolean;
  isAuthenticated: boolean;
  userName?: string;
  errorMessage?: string;
}
