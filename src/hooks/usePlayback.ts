import { useState, useEffect, useCallback, useRef } from 'react';
import { SpotifyPlaybackState, SpotifyTrack } from '../types/spotify';
import { Track } from '../types/track';
import * as playbackService from '../services/spotify/playback';

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

  // Fetch playback state
  const fetchPlaybackState = useCallback(async () => {
    if (!accessToken) return;
    
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
  }, [accessToken, detectTrackChangeType, onTrackChange]);

  // Poll playback state
  useEffect(() => {
    if (!accessToken) return;

    fetchPlaybackState();
    pollIntervalRef.current = setInterval(fetchPlaybackState, 5000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [accessToken, fetchPlaybackState]);

  // Update progress locally when playing
  useEffect(() => {
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
  }, [isPlaying, duration]);

  const play = useCallback(async () => {
    if (!accessToken) return;
    await playbackService.play(accessToken);
    setIsPlaying(true);
  }, [accessToken]);

  const pause = useCallback(async () => {
    if (!accessToken) return;
    await playbackService.pause(accessToken);
    setIsPlaying(false);
  }, [accessToken]);

  const skipNext = useCallback(async () => {
    if (!accessToken) return;
    appInitiatedChangeRef.current = 'skip';
    await playbackService.skipToNext(accessToken);
    // Fetch new state after skip
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, fetchPlaybackState]);

  const skipPrevious = useCallback(async () => {
    if (!accessToken) return;
    appInitiatedChangeRef.current = 'previous';
    await playbackService.skipToPrevious(accessToken);
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, fetchPlaybackState]);

  const seek = useCallback(async (positionMs: number) => {
    if (!accessToken) return;
    await playbackService.seek(accessToken, positionMs);
    setProgress(positionMs);
  }, [accessToken]);

  const playTrack = useCallback(async (trackUri: string) => {
    if (!accessToken) return;
    appInitiatedChangeRef.current = 'play';
    await playbackService.playTrack(accessToken, trackUri);
    setTimeout(fetchPlaybackState, 500);
  }, [accessToken, fetchPlaybackState]);

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
