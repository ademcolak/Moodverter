// useSpotify - Spotify-specific hook (backward compatibility wrapper)
// For new code, prefer useProvider('spotify') or useSpotifyProvider()

import { useMemo } from 'react';
import type { SpotifyUser, SpotifyTokens } from '../types/spotify';
import { useProvider } from './useProvider';
import { isMockMode, MOCK_USER } from '../services/mock';

export interface UseSpotifyReturn {
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
  const mockMode = isMockMode();

  // Use the provider-agnostic hook
  const {
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
  } = useProvider(mockMode ? 'mock' : 'spotify');

  // Construct backward-compatible user object
  const user = useMemo<SpotifyUser | null>(() => {
    if (!isAuthenticated) return null;

    if (mockMode) {
      return MOCK_USER as SpotifyUser;
    }

    // For real Spotify, we'd need to fetch user info
    // This is a simplified version - full user info requires API call
    return {
      id: 'spotify-user',
      display_name: 'Spotify User',
      email: '',
      images: [],
      product: 'premium',
      country: 'TR',
    };
  }, [isAuthenticated, mockMode]);

  // Construct backward-compatible tokens object
  const tokens = useMemo<SpotifyTokens | null>(() => {
    if (!isAuthenticated) return null;

    if (mockMode) {
      return {
        access_token: 'mock-token',
        refresh_token: 'mock-refresh',
        expires_in: 3600,
        expires_at: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'mock',
      };
    }

    // For real Spotify, tokens are managed internally by the provider
    // Return a placeholder - actual token management is in SpotifyProvider
    return {
      access_token: 'managed-by-provider',
      refresh_token: 'managed-by-provider',
      expires_in: 3600,
      expires_at: Date.now() + 3600000,
      token_type: 'Bearer',
      scope: 'user-read-private user-library-read streaming',
    };
  }, [isAuthenticated, mockMode]);

  // Refresh tokens - now handled internally by provider
  const refreshTokens = async (): Promise<boolean> => {
    // Provider handles token refresh internally
    // This is kept for backward compatibility
    return isAuthenticated;
  };

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
