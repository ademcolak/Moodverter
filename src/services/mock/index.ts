// Mock service for demo/development mode
// Simulates Spotify playback without actual API calls

import { Track } from '../../types/track';
import { MOCK_TRACKS, MOCK_USER } from './data';

export { MOCK_TRACKS, MOCK_USER };

// Check if we should use mock mode
export const isMockMode = (): boolean => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  const forceMock = import.meta.env.VITE_MOCK_MODE === 'true';
  return forceMock || !clientId;
};

// Mock playback state
interface MockPlaybackState {
  isPlaying: boolean;
  currentTrackIndex: number;
  progress: number;
  library: Track[];
}

let mockState: MockPlaybackState = {
  isPlaying: false,
  currentTrackIndex: 0,
  progress: 0,
  library: [...MOCK_TRACKS],
};

let progressInterval: ReturnType<typeof setInterval> | null = null;
let onStateChangeCallback: ((state: MockPlaybackState) => void) | null = null;

// Get current mock state
export const getMockState = (): MockPlaybackState => ({ ...mockState });

// Subscribe to state changes
export const onMockStateChange = (callback: (state: MockPlaybackState) => void) => {
  onStateChangeCallback = callback;
};

// Notify subscribers
const notifyStateChange = () => {
  onStateChangeCallback?.(getMockState());
};

// Start progress timer
const startProgressTimer = () => {
  if (progressInterval) return;

  progressInterval = setInterval(() => {
    if (!mockState.isPlaying) return;

    const currentTrack = mockState.library[mockState.currentTrackIndex];
    if (!currentTrack) return;

    mockState.progress += 1000;

    // Track ended - go to next
    if (mockState.progress >= currentTrack.durationMs) {
      mockSkipNext();
    } else {
      notifyStateChange();
    }
  }, 1000);
};

// Stop progress timer
const stopProgressTimer = () => {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
};

// Mock API functions
export const mockPlay = () => {
  mockState.isPlaying = true;
  startProgressTimer();
  notifyStateChange();
};

export const mockPause = () => {
  mockState.isPlaying = false;
  notifyStateChange();
};

export const mockSkipNext = () => {
  mockState.currentTrackIndex = (mockState.currentTrackIndex + 1) % mockState.library.length;
  mockState.progress = 0;
  notifyStateChange();
};

export const mockSkipPrevious = () => {
  // If more than 3 seconds in, restart current track
  if (mockState.progress > 3000) {
    mockState.progress = 0;
  } else if (mockState.currentTrackIndex > 0) {
    // Only go back if not at first track
    mockState.currentTrackIndex = mockState.currentTrackIndex - 1;
    mockState.progress = 0;
  } else {
    // At first track, just restart it
    mockState.progress = 0;
  }
  notifyStateChange();
};

export const mockSeek = (positionMs: number) => {
  const currentTrack = mockState.library[mockState.currentTrackIndex];
  if (currentTrack) {
    mockState.progress = Math.max(0, Math.min(positionMs, currentTrack.durationMs));
    notifyStateChange();
  }
};

export const mockPlayTrack = (trackId: string) => {
  const index = mockState.library.findIndex(t => t.spotifyId === trackId);
  if (index !== -1) {
    mockState.currentTrackIndex = index;
    mockState.progress = 0;
    mockState.isPlaying = true;
    startProgressTimer();
    notifyStateChange();
  }
};

export const mockGetCurrentTrack = (): Track | null => {
  return mockState.library[mockState.currentTrackIndex] || null;
};

export const mockGetLibrary = (): Track[] => {
  return [...mockState.library];
};

export const mockGetAudioFeatures = (trackId: string): Track | null => {
  return mockState.library.find(t => t.spotifyId === trackId) || null;
};

// Reset mock state (useful for testing)
export const resetMockState = () => {
  stopProgressTimer();
  mockState = {
    isPlaying: false,
    currentTrackIndex: 0,
    progress: 0,
    library: [...MOCK_TRACKS],
  };
  notifyStateChange();
};

// Cleanup
export const cleanupMock = () => {
  stopProgressTimer();
  onStateChangeCallback = null;
};
