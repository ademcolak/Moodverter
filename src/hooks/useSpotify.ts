import { useState, useEffect, useCallback, useRef } from 'react';
import { SpotifyTokens, SpotifyUser } from '../types/spotify';
import * as spotifyAuth from '../services/spotify/auth';
import * as spotifyApi from '../services/spotify/api';
import { isMockMode, MOCK_USER } from '../services/mock';

interface UseSpotifyReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: SpotifyUser | null;
  tokens: SpotifyTokens | null;
  error: string | null;
  isMockMode: boolean;
  login: () => Promise<void>;
  logout: () => void;
  refreshTokens: () => Promise<boolean>;
}

export const useSpotify = (): UseSpotifyReturn => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<SpotifyUser | null>(null);
  const [tokens, setTokens] = useState<SpotifyTokens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mockMode = isMockMode();

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Check for existing tokens on mount (or activate mock mode)
  useEffect(() => {
    const checkAuth = async () => {
      // Mock mode - auto authenticate
      if (mockMode) {
        if (!isMountedRef.current) return;
        setUser(MOCK_USER as SpotifyUser);
        setTokens({
          access_token: 'mock-token',
          refresh_token: 'mock-refresh',
          expires_in: 3600,
          expires_at: Date.now() + 3600000,
          token_type: 'Bearer',
          scope: 'mock',
        });
        setIsAuthenticated(true);
        setIsLoading(false);
        return;
      }

      try {
        const storedTokens = await spotifyAuth.getStoredTokens();
        if (!isMountedRef.current) return;

        if (storedTokens) {
          // Check if tokens are expired
          if (Date.now() >= storedTokens.expires_at) {
            // Try to refresh
            const newTokens = await spotifyAuth.refreshAccessToken(storedTokens.refresh_token);
            if (!isMountedRef.current) return;

            if (newTokens) {
              setTokens(newTokens);
              setIsAuthenticated(true);
              // Fetch user info
              const userInfo = await spotifyApi.getCurrentUser(newTokens.access_token);
              if (!isMountedRef.current) return;
              setUser(userInfo);
            }
          } else {
            setTokens(storedTokens);
            setIsAuthenticated(true);
            const userInfo = await spotifyApi.getCurrentUser(storedTokens.access_token);
            if (!isMountedRef.current) return;
            setUser(userInfo);
          }
        }
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error('Auth check failed:', err);
        setError('Failed to restore session');
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    checkAuth();
  }, [mockMode]);

  const login = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newTokens = await spotifyAuth.login();
      if (!isMountedRef.current) return;

      if (newTokens) {
        setTokens(newTokens);
        setIsAuthenticated(true);
        const userInfo = await spotifyApi.getCurrentUser(newTokens.access_token);
        if (!isMountedRef.current) return;
        setUser(userInfo);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error('Login failed:', err);
      setError('Login failed. Please try again.');
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const logout = useCallback(() => {
    spotifyAuth.logout();
    setTokens(null);
    setUser(null);
    setIsAuthenticated(false);
  }, []);

  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (!tokens?.refresh_token) return false;

    try {
      const newTokens = await spotifyAuth.refreshAccessToken(tokens.refresh_token);
      if (!isMountedRef.current) return false;

      if (newTokens) {
        setTokens(newTokens);
        return true;
      }
      return false;
    } catch (err) {
      if (!isMountedRef.current) return false;
      console.error('Token refresh failed:', err);
      logout();
      return false;
    }
  }, [tokens, logout]);

  return {
    isAuthenticated,
    isLoading,
    user,
    tokens,
    error,
    isMockMode: mockMode,
    login,
    logout,
    refreshTokens,
  };
};
