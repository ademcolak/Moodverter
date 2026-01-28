import { SpotifyTokens } from '../../types/spotify';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const REDIRECT_URI = 'http://localhost:1420/callback';
const SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
].join(' ');

const STORAGE_KEY = 'moodverter_spotify_tokens';

// PKCE helpers
const generateRandomString = (length: number): string => {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
};

const sha256 = async (plain: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
};

const base64urlencode = (input: ArrayBuffer): string => {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
};

const generateCodeChallenge = async (codeVerifier: string): Promise<string> => {
  const hashed = await sha256(codeVerifier);
  return base64urlencode(hashed);
};

// Store tokens securely
export const storeTokens = (tokens: SpotifyTokens): void => {
  // In production, use Tauri's secure storage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
};

export const getStoredTokens = async (): Promise<SpotifyTokens | null> => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  
  try {
    return JSON.parse(stored) as SpotifyTokens;
  } catch {
    return null;
  }
};

export const clearStoredTokens = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

// Login with PKCE flow
export const login = async (): Promise<SpotifyTokens | null> => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  if (!clientId) {
    throw new Error('Spotify Client ID not configured');
  }

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store code verifier for token exchange
  sessionStorage.setItem('code_verifier', codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  // Open auth window
  const authUrl = `${SPOTIFY_AUTH_URL}?${params.toString()}`;
  
  // In Tauri, we'll use a webview window
  // For now, use popup for web development
  const popup = window.open(authUrl, 'spotify-auth', 'width=500,height=700');
  
  return new Promise((resolve, reject) => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'spotify-auth-callback') {
        window.removeEventListener('message', handleMessage);
        popup?.close();
        
        const { code, error } = event.data;
        if (error) {
          reject(new Error(error));
          return;
        }
        
        try {
          const tokens = await exchangeCodeForTokens(code, codeVerifier);
          resolve(tokens);
        } catch (err) {
          reject(err);
        }
      }
    };
    
    window.addEventListener('message', handleMessage);
    
    // Check if popup was closed
    const checkClosed = setInterval(() => {
      if (popup?.closed) {
        clearInterval(checkClosed);
        window.removeEventListener('message', handleMessage);
        reject(new Error('Auth window was closed'));
      }
    }, 1000);
  });
};

// Exchange code for tokens
const exchangeCodeForTokens = async (
  code: string,
  codeVerifier: string
): Promise<SpotifyTokens> => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error_description || 'Token exchange failed');
  }

  const data = await response.json();
  const tokens: SpotifyTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
    expires_at: Date.now() + data.expires_in * 1000,
    token_type: data.token_type,
    scope: data.scope,
  };

  storeTokens(tokens);
  return tokens;
};

// Refresh access token
export const refreshAccessToken = async (refreshToken: string): Promise<SpotifyTokens | null> => {
  const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID;
  
  try {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      clearStoredTokens();
      return null;
    }

    const data = await response.json();
    const tokens: SpotifyTokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken,
      expires_in: data.expires_in,
      expires_at: Date.now() + data.expires_in * 1000,
      token_type: data.token_type,
      scope: data.scope,
    };

    storeTokens(tokens);
    return tokens;
  } catch (err) {
    console.error('Token refresh failed:', err);
    clearStoredTokens();
    return null;
  }
};

// Logout
export const logout = (): void => {
  clearStoredTokens();
  sessionStorage.removeItem('code_verifier');
};
