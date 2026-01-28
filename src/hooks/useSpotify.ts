import { useState, useEffect, useCallback } from 'react';
import { SpotifyTokens, SpotifyUser } from '../types/spotify';
import * as spotifyAuth from '../services/spotify/auth';
import * as spotifyApi from '../services/spotify/api';

interface UseSpotifyReturn {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: SpotifyUser | null;
  tokens: SpotifyTokens | null;
  error: string | null;
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

  // Check for existing tokens on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const storedTokens = await spotifyAuth.getStoredTokens();
        if (storedTokens) {
          // Check if tokens are expired
          if (Date.now() >= storedTokens.expires_at) {
            // Try to refresh
            const newTokens = await spotifyAuth.refreshAccessToken(storedTokens.refresh_token);
            if (newTokens) {
              setTokens(newTokens);
              setIsAuthenticated(true);
              // Fetch user info
              const userInfo = await spotifyApi.getCurrentUser(newTokens.access_token);
              setUser(userInfo);
            }
          } else {
            setTokens(storedTokens);
            setIsAuthenticated(true);
            const userInfo = await spotifyApi.getCurrentUser(storedTokens.access_token);
            setUser(userInfo);
          }
        }
      } catch (err) {
        console.error('Auth check failed:', err);
        setError('Failed to restore session');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const newTokens = await spotifyAuth.login();
      if (newTokens) {
        setTokens(newTokens);
        setIsAuthenticated(true);
        const userInfo = await spotifyApi.getCurrentUser(newTokens.access_token);
        setUser(userInfo);
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
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
      if (newTokens) {
        setTokens(newTokens);
        return true;
      }
      return false;
    } catch (err) {
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
    login,
    logout,
    refreshTokens,
  };
};
