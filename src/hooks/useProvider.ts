import { useState, useEffect, useCallback, useRef } from 'react';
import type { PlaybackState } from '../types/provider';
import { getYouTubeProvider, type YouTubeProvider } from '../services/providers/youtube';

const PLAYBACK_STATE_POLL_INTERVAL_MS = 200;

export interface UseProviderReturn {
  provider: YouTubeProvider | null;
  isLoading: boolean;
  error: string | null;
  playbackState: PlaybackState | null;
  play: (trackId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
}

export function useProvider(): UseProviderReturn {
  const [provider, setProvider] = useState<YouTubeProvider | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasWarnedRefreshErrorRef = useRef(false);

  const refreshPlaybackState = useCallback(async (currentProvider: YouTubeProvider) => {
    try {
      const state = await currentProvider.getPlaybackState();
      if (isMountedRef.current) {
        setPlaybackState(state);
      }
      hasWarnedRefreshErrorRef.current = false;
    } catch (error) {
      if (!hasWarnedRefreshErrorRef.current) {
        hasWarnedRefreshErrorRef.current = true;
        console.warn('Failed to refresh playback state:', error);
      }
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);

      const youtubeProvider = getYouTubeProvider();
      if (isMountedRef.current) {
        setProvider(youtubeProvider);
      }

      try {
        await youtubeProvider.authenticate();
        if (!isMountedRef.current) return;

        await refreshPlaybackState(youtubeProvider);
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('Failed to initialize YouTube provider:', err);
        setError(err instanceof Error ? err.message : 'Provider initialization failed');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void init();
  }, [refreshPlaybackState]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!provider) return;

    pollIntervalRef.current = setInterval(() => {
      void refreshPlaybackState(provider);
    }, PLAYBACK_STATE_POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [provider, refreshPlaybackState]);

  const play = useCallback(async (trackId: string) => {
    if (!provider) return;
    await provider.play(trackId);
    await refreshPlaybackState(provider);
  }, [provider, refreshPlaybackState]);

  const pause = useCallback(async () => {
    if (!provider) return;
    await provider.pause();
    await refreshPlaybackState(provider);
  }, [provider, refreshPlaybackState]);

  const resume = useCallback(async () => {
    if (!provider) return;
    await provider.resume();
    await refreshPlaybackState(provider);
  }, [provider, refreshPlaybackState]);

  const skip = useCallback(async () => {
    if (!provider) return;
    await provider.skip();
    await refreshPlaybackState(provider);
  }, [provider, refreshPlaybackState]);

  const previous = useCallback(async () => {
    if (!provider) return;
    await provider.previous();
    await refreshPlaybackState(provider);
  }, [provider, refreshPlaybackState]);

  const seek = useCallback(async (positionMs: number) => {
    if (!provider) return;
    await provider.seek(positionMs);
  }, [provider]);

  return {
    provider,
    isLoading,
    error,
    playbackState,
    play,
    pause,
    resume,
    skip,
    previous,
    seek,
  };
}
