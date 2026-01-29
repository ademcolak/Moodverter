import { useState, useEffect, useCallback, useRef } from 'react';
import { SpotifyPlaybackState, SpotifyTrack } from '../types/spotify';
import { Track } from '../types/track';
import * as playbackService from '../services/spotify/playback';
import {
  isMockMode,
  onMockStateChange,
  mockPlay,
  mockPause,
  mockSkipNext,
  mockSkipPrevious,
  mockSeek,
  mockPlayTrack,
  mockGetCurrentTrack,
} from '../services/mock';

// Track change types
export type TrackChangeType = 'skip' | 'previous' | 'manual' | 'natural' | 'app_initiated';

export interface TrackChangeEvent {
  type: TrackChangeType;
  previousTrack: Track | null;
  newTrack: Track;
  timestamp: number;
}

interface UsePlaybackOptions {
  onTrackChange?: (event: TrackChangeEvent) => void;
}

interface UsePlaybackReturn {
  isPlaying: boolean;
  currentTrack: Track | null;
  progress: number;
  duration: number;
  playbackState: SpotifyPlaybackState | null;
  lastTrackChange: TrackChangeEvent | null;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  playTrack: (trackUri: string) => Promise<void>;
}

const mapSpotifyTrackToTrack = (spotifyTrack: SpotifyTrack): Track => ({
  spotifyId: spotifyTrack.id,
  name: spotifyTrack.name,
  artist: spotifyTrack.artists.map(a => a.name).join(', '),
  albumArt: spotifyTrack.album.images[0]?.url,
  durationMs: spotifyTrack.duration_ms,
  releaseYear: parseInt(spotifyTrack.album.release_date.split('-')[0]),
  // Audio features will be fetched separately
  energy: 0,
  valence: 0,
  tempo: 0,
  danceability: 0,
  acousticness: 0,
  instrumentalness: 0,
  key: 0,
  mode: 0,
  playCount: 0,
});

export const usePlayback = (
  accessToken: string | null,
  options: UsePlaybackOptions = {}
): UsePlaybackReturn => {
  const { onTrackChange } = options;
  const mockMode = isMockMode();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackState, setPlaybackState] = useState<SpotifyPlaybackState | null>(null);
  const [lastTrackChange, setLastTrackChange] = useState<TrackChangeEvent | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track change detection refs
  const previousTrackRef = useRef<Track | null>(null);
  const previousProgressRef = useRef<number>(0);
  const appInitiatedChangeRef = useRef<'skip' | 'previous' | 'play' | null>(null);

  // Detect track change type
  const detectTrackChangeType = useCallback((
    previousTrack: Track | null,
    newTrack: Track,
    previousProgress: number,
    trackDuration: number
  ): TrackChangeType => {
    // Check if this was initiated by our app
    if (appInitiatedChangeRef.current) {
      const type = appInitiatedChangeRef.current;
      appInitiatedChangeRef.current = null;
      if (type === 'skip') return 'skip';
      if (type === 'previous') return 'previous';
      if (type === 'play') return 'app_initiated';
    }

    // No previous track - first play
    if (!previousTrack) return 'app_initiated';

    // Same track - no change
    if (previousTrack.spotifyId === newTrack.spotifyId) return 'natural';

    // Track ended naturally (progress was near end)
    const progressPercent = previousProgress / trackDuration;
    if (progressPercent > 0.95) return 'natural';

    // Track changed before it ended - user intervention
    // Could be skip, previous, or manual selection
    if (progressPercent < 0.05) {
      // Changed very early - likely previous
      return 'previous';
    }

    // Changed mid-track - could be skip or manual
    return 'manual';
  }, []);

  // Mock mode: Subscribe to mock state changes
  useEffect(() => {
    if (!mockMode) return;

    // Initialize with first track
    const initialTrack = mockGetCurrentTrack();
    if (initialTrack) {
      setCurrentTrack(initialTrack);
      setDuration(initialTrack.durationMs);
      previousTrackRef.current = initialTrack;
    }

    // Subscribe to state changes
    onMockStateChange((state) => {
      setIsPlaying(state.isPlaying);
      setProgress(state.progress);

      const newTrack = state.library[state.currentTrackIndex];
      if (newTrack) {
        const prevTrack = previousTrackRef.current;

        // Detect track change
        if (!prevTrack || prevTrack.spotifyId !== newTrack.spotifyId) {
          const changeType = detectTrackChangeType(
            prevTrack,
            newTrack,
            previousProgressRef.current,
            prevTrack?.durationMs || newTrack.durationMs
          );

          const changeEvent: TrackChangeEvent = {
            type: changeType,
            previousTrack: prevTrack,
            newTrack,
            timestamp: Date.now(),
          };

          setLastTrackChange(changeEvent);
          onTrackChange?.(changeEvent);
        }

        previousTrackRef.current = newTrack;
        previousProgressRef.current = state.progress;

        setCurrentTrack(newTrack);
        setDuration(newTrack.durationMs);
      }
    });
  }, [mockMode, detectTrackChangeType, onTrackChange]);

  // Fetch playback state (real Spotify)
  const fetchPlaybackState = useCallback(async () => {
    if (!accessToken || mockMode) return;

    try {
      const state = await playbackService.getPlaybackState(accessToken);
      if (state) {
        setPlaybackState(state);
        setIsPlaying(state.is_playing);

        if (state.item) {
          const newTrack = mapSpotifyTrackToTrack(state.item);
          const prevTrack = previousTrackRef.current;
          const prevProgress = previousProgressRef.current;

          // Detect track change
          if (!prevTrack || prevTrack.spotifyId !== newTrack.spotifyId) {
            const changeType = detectTrackChangeType(
              prevTrack,
              newTrack,
              prevProgress,
              prevTrack?.durationMs || state.item.duration_ms
            );

            const changeEvent: TrackChangeEvent = {
              type: changeType,
              previousTrack: prevTrack,
              newTrack,
              timestamp: Date.now(),
            };

            setLastTrackChange(changeEvent);
            onTrackChange?.(changeEvent);
          }

          // Update refs for next comparison
          previousTrackRef.current = newTrack;
          previousProgressRef.current = state.progress_ms;

          setCurrentTrack(newTrack);
          setProgress(state.progress_ms);
          setDuration(state.item.duration_ms);
        }
      }
    } catch (err) {
      console.error('Failed to fetch playback state:', err);
    }
  }, [accessToken, mockMode, detectTrackChangeType, onTrackChange]);

  // Poll playback state (real Spotify only)
  useEffect(() => {
    if (!accessToken || mockMode) return;

    // Initial fetch on mount
    void fetchPlaybackState();
    pollIntervalRef.current = setInterval(fetchPlaybackState, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [accessToken, mockMode, fetchPlaybackState]);

  // Update progress locally when playing (real Spotify only)
  useEffect(() => {
    if (mockMode) return; // Mock mode handles its own progress

    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        setProgress(prev => Math.min(prev + 1000, duration));
      }, 1000);
    } else {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [mockMode, isPlaying, duration]);

  const play = useCallback(async () => {
    if (mockMode) {
      mockPlay();
      return;
    }
    if (!accessToken) return;
    await playbackService.play(accessToken);
    setIsPlaying(true);
  }, [accessToken, mockMode]);

  const pause = useCallback(async () => {
    if (mockMode) {
      mockPause();
      return;
    }
    if (!accessToken) return;
    await playbackService.pause(accessToken);
    setIsPlaying(false);
  }, [accessToken, mockMode]);

  const skipNext = useCallback(async () => {
    appInitiatedChangeRef.current = 'skip';
    if (mockMode) {
      mockSkipNext();
      return;
    }
    if (!accessToken) return;
    await playbackService.skipToNext(accessToken);
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, mockMode, fetchPlaybackState]);

  const skipPrevious = useCallback(async () => {
    appInitiatedChangeRef.current = 'previous';
    if (mockMode) {
      mockSkipPrevious();
      return;
    }
    if (!accessToken) return;
    await playbackService.skipToPrevious(accessToken);
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, mockMode, fetchPlaybackState]);

  const seek = useCallback(async (positionMs: number) => {
    if (mockMode) {
      mockSeek(positionMs);
      return;
    }
    if (!accessToken) return;
    await playbackService.seek(accessToken, positionMs);
    setProgress(positionMs);
  }, [accessToken, mockMode]);

  const playTrack = useCallback(async (trackUri: string) => {
    appInitiatedChangeRef.current = 'play';
    if (mockMode) {
      // Extract track ID from URI (spotify:track:xxx or just xxx)
      const trackId = trackUri.includes(':') ? trackUri.split(':').pop()! : trackUri;
      mockPlayTrack(trackId);
      return;
    }
    if (!accessToken) return;
    await playbackService.playTrack(accessToken, trackUri);
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, mockMode, fetchPlaybackState]);

  return {
    isPlaying,
    currentTrack,
    progress,
    duration,
    playbackState,
    lastTrackChange,
    play,
    pause,
    skipNext,
    skipPrevious,
    seek,
    playTrack,
  };
};
