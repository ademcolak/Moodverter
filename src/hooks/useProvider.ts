// useProvider - Provider-agnostic music provider hook

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type {
  MusicProvider,
  ProviderType,
  PlaybackState,
  UnifiedTrack,
} from '../types/provider';
import {
  createProvider,
  isProviderRegistered,
  getAvailableProviders,
} from '../services/providers';

// Import providers to ensure they register themselves
import '../services/providers/spotify';
import '../services/providers/mock';
import '../services/providers/youtube';

export interface UseProviderReturn {
  // Provider info
  providerType: ProviderType;
  provider: MusicProvider | null;
  availableProviders: ProviderType[];

  // Auth state
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  login: () => Promise<void>;
  logout: () => void;
  switchProvider: (type: ProviderType) => void;

  // Playback state (reactive)
  playbackState: PlaybackState | null;

  // Library
  getLibrary: () => Promise<UnifiedTrack[]>;
  search: (query: string) => Promise<UnifiedTrack[]>;

  // Playback controls
  play: (trackId: string) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  skip: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
  setVolume: (percent: number) => Promise<void>;
}

const PROVIDER_STORAGE_KEY = 'moodverter_provider';

function getStoredProvider(): ProviderType {
  if (typeof window === 'undefined') return 'mock';
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  if (stored && isProviderRegistered(stored as ProviderType)) {
    return stored as ProviderType;
  }
  return 'mock'; // Default to mock
}

function setStoredProvider(type: ProviderType): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(PROVIDER_STORAGE_KEY, type);
  }
}

export function useProvider(
  initialProvider?: ProviderType
): UseProviderReturn {
  const [providerType, setProviderType] = useState<ProviderType>(
    initialProvider ?? getStoredProvider()
  );
  const [provider, setProvider] = useState<MusicProvider | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);

  const isMountedRef = useRef(true);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Available providers
  const availableProviders = useMemo(() => getAvailableProviders(), []);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Initialize provider when type changes
  useEffect(() => {
    const initProvider = async () => {
      setIsLoading(true);
      setError(null);

      try {
        if (!isProviderRegistered(providerType)) {
          throw new Error(`Provider "${providerType}" is not available`);
        }

        const newProvider = createProvider(providerType);
        if (!isMountedRef.current) return;

        setProvider(newProvider);
        setIsAuthenticated(newProvider.isAuthenticated());

        // Get initial playback state if authenticated
        if (newProvider.isAuthenticated()) {
          try {
            const state = await newProvider.getPlaybackState();
            if (isMountedRef.current) {
              setPlaybackState(state);
            }
          } catch {
            // Playback state fetch failed, not critical
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('Provider init failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to initialize provider');
        setProvider(null);
        setIsAuthenticated(false);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initProvider();
  }, [providerType]);

  // Poll playback state when authenticated
  useEffect(() => {
    if (!provider || !isAuthenticated) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    const pollState = async () => {
      try {
        const state = await provider.getPlaybackState();
        if (isMountedRef.current) {
          setPlaybackState(state);
        }
      } catch {
        // Ignore polling errors
      }
    };

    // Poll every 1 second
    pollIntervalRef.current = setInterval(pollState, 1000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [provider, isAuthenticated]);

  // Actions

  const login = useCallback(async () => {
    if (!provider) {
      setError('No provider available');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      await provider.authenticate();

      if (!isMountedRef.current) return;

      setIsAuthenticated(provider.isAuthenticated());

      // Fetch initial playback state
      if (provider.isAuthenticated()) {
        try {
          const state = await provider.getPlaybackState();
          if (isMountedRef.current) {
            setPlaybackState(state);
          }
        } catch {
          // Not critical
        }
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Login failed:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [provider]);

  const logout = useCallback(() => {
    if (!provider) return;

    provider.logout();
    setIsAuthenticated(false);
    setPlaybackState(null);
  }, [provider]);

  const switchProvider = useCallback((type: ProviderType) => {
    if (type === providerType) return;

    // Logout from current provider
    if (provider) {
      provider.logout();
    }

    // Store and switch
    setStoredProvider(type);
    setProviderType(type);
    setPlaybackState(null);
  }, [provider, providerType]);

  // Library methods

  const getLibrary = useCallback(async (): Promise<UnifiedTrack[]> => {
    if (!provider || !isAuthenticated) {
      return [];
    }
    return provider.getLibrary();
  }, [provider, isAuthenticated]);

  const search = useCallback(async (query: string): Promise<UnifiedTrack[]> => {
    if (!provider || !isAuthenticated) {
      return [];
    }
    return provider.search(query);
  }, [provider, isAuthenticated]);

  // Playback controls

  const play = useCallback(async (trackId: string) => {
    if (!provider || !isAuthenticated) return;
    await provider.play(trackId);
    // Refresh state
    const state = await provider.getPlaybackState();
    if (isMountedRef.current) {
      setPlaybackState(state);
    }
  }, [provider, isAuthenticated]);

  const pause = useCallback(async () => {
    if (!provider || !isAuthenticated) return;
    await provider.pause();
    const state = await provider.getPlaybackState();
    if (isMountedRef.current) {
      setPlaybackState(state);
    }
  }, [provider, isAuthenticated]);

  const resume = useCallback(async () => {
    if (!provider || !isAuthenticated) return;
    await provider.resume();
    const state = await provider.getPlaybackState();
    if (isMountedRef.current) {
      setPlaybackState(state);
    }
  }, [provider, isAuthenticated]);

  const skip = useCallback(async () => {
    if (!provider || !isAuthenticated) return;
    await provider.skip();
    const state = await provider.getPlaybackState();
    if (isMountedRef.current) {
      setPlaybackState(state);
    }
  }, [provider, isAuthenticated]);

  const previous = useCallback(async () => {
    if (!provider || !isAuthenticated) return;
    await provider.previous();
    const state = await provider.getPlaybackState();
    if (isMountedRef.current) {
      setPlaybackState(state);
    }
  }, [provider, isAuthenticated]);

  const seek = useCallback(async (positionMs: number) => {
    if (!provider || !isAuthenticated) return;
    await provider.seek(positionMs);
  }, [provider, isAuthenticated]);

  const setVolume = useCallback(async (percent: number) => {
    if (!provider || !isAuthenticated) return;
    await provider.setVolume(percent);
  }, [provider, isAuthenticated]);

  return {
    providerType,
    provider,
    availableProviders,
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    switchProvider,
    playbackState,
    getLibrary,
    search,
    play,
    pause,
    resume,
    skip,
    previous,
    seek,
    setVolume,
  };
}

// Convenience hook for specific provider
export function useSpotifyProvider() {
  return useProvider('spotify');
}

export function useMockProvider() {
  return useProvider('mock');
}
