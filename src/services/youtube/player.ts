// YouTube IFrame Player Wrapper
// Provides a clean interface for controlling YouTube video playback

export interface YouTubePlayerState {
  isReady: boolean;
  isPlaying: boolean;
  videoId: string | null;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
}

export type PlayerStateCallback = (state: YouTubePlayerState) => void;
const PLAYER_STATE_POLL_INTERVAL_MS = 120;

// YouTube Player states (from IFrame API)
export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

// Declare YouTube IFrame API types
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        config: YouTubePlayerConfig
      ) => YouTubePlayerInstance;
      PlayerState: typeof PlayerState;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YouTubePlayerConfig {
  height?: string | number;
  width?: string | number;
  videoId?: string;
  playerVars?: {
    autoplay?: 0 | 1;
    controls?: 0 | 1;
    disablekb?: 0 | 1;
    enablejsapi?: 0 | 1;
    fs?: 0 | 1;
    iv_load_policy?: 1 | 3;
    modestbranding?: 0 | 1;
    origin?: string;
    playsinline?: 0 | 1;
    rel?: 0 | 1;
  };
  events?: {
    onReady?: (event: { target: YouTubePlayerInstance }) => void;
    onStateChange?: (event: { data: number; target: YouTubePlayerInstance }) => void;
    onError?: (event: { data: number; target: YouTubePlayerInstance }) => void;
  };
}

interface YouTubePlayerInstance {
  playVideo(): void;
  pauseVideo(): void;
  stopVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  setVolume(volume: number): void;
  getVolume(): number;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  loadVideoById(videoId: string, startSeconds?: number): void;
  cueVideoById(videoId: string, startSeconds?: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVideoUrl(): string;
  destroy(): void;
}

let apiLoaded = false;
let apiLoading = false;
const apiLoadWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

function flushApiWaitersSuccess(): void {
  const waiters = [...apiLoadWaiters];
  apiLoadWaiters.length = 0;
  waiters.forEach(({ resolve }) => resolve());
}

function flushApiWaitersError(error: Error): void {
  const waiters = [...apiLoadWaiters];
  apiLoadWaiters.length = 0;
  waiters.forEach(({ reject }) => reject(error));
}

// Load YouTube IFrame API script
function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      apiLoaded = true;
      apiLoading = false;
      resolve();
      return;
    }

    if (apiLoaded) {
      resolve();
      return;
    }

    if (apiLoading) {
      apiLoadWaiters.push({ resolve, reject });
      return;
    }

    apiLoading = true;
    apiLoadWaiters.push({ resolve, reject });
    let settled = false;

    const succeed = () => {
      if (settled) return;
      settled = true;
      apiLoaded = true;
      apiLoading = false;
      flushApiWaitersSuccess();
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      apiLoading = false;
      flushApiWaitersError(error);
    };

    const timeoutId = window.setTimeout(() => {
      fail(new Error('YouTube IFrame API load timeout'));
    }, 12000);

    // Set up callback before loading script
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timeoutId);
      succeed();
    };

    const existingScript = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
    if (existingScript) {
      existingScript.addEventListener(
        'error',
        () => {
          window.clearTimeout(timeoutId);
          fail(new Error('YouTube IFrame API script failed to load'));
        },
        { once: true }
      );
      return;
    }

    // Load the script
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      window.clearTimeout(timeoutId);
      fail(new Error('YouTube IFrame API script failed to load'));
    };
    document.head.appendChild(script);
  });
}

export class YouTubePlayer {
  private player: YouTubePlayerInstance | null = null;
  private containerId: string;
  private state: YouTubePlayerState;
  private stateCallbacks: Set<PlayerStateCallback> = new Set();
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor(containerId: string) {
    this.containerId = containerId;
    this.state = {
      isReady: false,
      isPlaying: false,
      videoId: null,
      currentTime: 0,
      duration: 0,
      volume: 100,
      error: null,
    };
  }

  async initialize(): Promise<void> {
    await loadYouTubeAPI();

    return new Promise((resolve, reject) => {
      let settled = false;
      const settleResolve = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        resolve();
      };
      const settleReject = (error: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        this.stopPolling();
        if (this.player) {
          try {
            this.player.destroy();
          } catch {
            // best-effort cleanup
          }
          this.player = null;
        }
        this.state.isReady = false;
        reject(error);
      };
      const timeoutId = window.setTimeout(() => {
        settleReject(new Error('YouTube player initialization timeout'));
      }, 12000);

      try {
        this.player = new window.YT.Player(this.containerId, {
          height: '0',
          width: '0',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            enablejsapi: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
          },
          events: {
            onReady: () => {
              this.state.isReady = true;
              this.state.volume = this.player?.getVolume() ?? 100;
              this.notifyStateChange();
              this.startPolling();
              settleResolve();
            },
            onStateChange: (event) => {
              this.handleStateChange(event.data);
            },
            onError: (event) => {
              this.handleError(event.data);
              if (!this.state.isReady) {
                settleReject(new Error(this.state.error ?? `YouTube player error: ${event.data}`));
              }
            },
          },
        });
      } catch (error) {
        settleReject(error instanceof Error ? error : new Error('YouTube player init failed'));
      }
    });
  }

  private handleStateChange(playerState: number): void {
    switch (playerState) {
      case PlayerState.PLAYING:
        this.state.isPlaying = true;
        break;
      case PlayerState.PAUSED:
      case PlayerState.ENDED:
      case PlayerState.BUFFERING:
      case PlayerState.CUED:
        this.state.isPlaying = false;
        break;
    }
    this.notifyStateChange();
  }

  private handleError(errorCode: number): void {
    const errorMessages: Record<number, string> = {
      2: 'Invalid video ID',
      5: 'HTML5 player error',
      100: 'Video not found or private',
      101: 'Embedding not allowed',
      150: 'Embedding not allowed',
    };
    this.state.error = errorMessages[errorCode] || `Unknown error: ${errorCode}`;
    this.notifyStateChange();
  }

  private startPolling(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(() => {
      if (!this.player || !this.state.isReady) return;

      const currentTime = this.player.getCurrentTime();
      const duration = this.player.getDuration();

      if (currentTime !== this.state.currentTime || duration !== this.state.duration) {
        this.state.currentTime = currentTime;
        this.state.duration = duration;
        this.notifyStateChange();
      }
    }, PLAYER_STATE_POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private notifyStateChange(): void {
    const stateCopy = { ...this.state };
    this.stateCallbacks.forEach(cb => cb(stateCopy));
  }

  // Public API

  onStateChange(callback: PlayerStateCallback): () => void {
    this.stateCallbacks.add(callback);
    // Return unsubscribe function
    return () => {
      this.stateCallbacks.delete(callback);
    };
  }

  getState(): YouTubePlayerState {
    return { ...this.state };
  }

  loadVideo(videoId: string, autoplay = true, startSeconds = 0): void {
    if (!this.player || !this.state.isReady) {
      console.warn('Player not ready');
      return;
    }

    this.state.error = null;
    this.state.videoId = videoId;

    const normalizedStart = Number.isFinite(startSeconds) ? Math.max(0, startSeconds) : 0;

    if (autoplay) {
      this.player.loadVideoById(videoId, normalizedStart);
    } else {
      this.player.cueVideoById(videoId, normalizedStart);
    }

    this.notifyStateChange();
  }

  cueVideo(videoId: string, startSeconds = 0): void {
    this.loadVideo(videoId, false, startSeconds);
  }

  play(): void {
    if (!this.player || !this.state.isReady) return;
    this.player.playVideo();
  }

  pause(): void {
    if (!this.player || !this.state.isReady) return;
    this.player.pauseVideo();
  }

  stop(): void {
    if (!this.player || !this.state.isReady) return;
    this.player.stopVideo();
    this.state.isPlaying = false;
    this.state.currentTime = 0;
    this.notifyStateChange();
  }

  seek(seconds: number): void {
    if (!this.player || !this.state.isReady) return;
    this.player.seekTo(seconds, true);
    this.state.currentTime = seconds;
    this.notifyStateChange();
  }

  setVolume(percent: number): void {
    if (!this.player || !this.state.isReady) return;
    const volume = Math.max(0, Math.min(100, percent));
    this.player.setVolume(volume);
    this.state.volume = volume;
    this.notifyStateChange();
  }

  getVolume(): number {
    return this.state.volume;
  }

  mute(): void {
    if (!this.player || !this.state.isReady) return;
    this.player.mute();
  }

  unmute(): void {
    if (!this.player || !this.state.isReady) return;
    this.player.unMute();
  }

  isMuted(): boolean {
    if (!this.player || !this.state.isReady) return false;
    return this.player.isMuted();
  }

  getCurrentTime(): number {
    if (!this.player || !this.state.isReady) return 0;
    return this.player.getCurrentTime();
  }

  getDuration(): number {
    if (!this.player || !this.state.isReady) return 0;
    return this.player.getDuration();
  }

  destroy(): void {
    this.stopPolling();
    if (this.player) {
      this.player.destroy();
      this.player = null;
    }
    this.state.isReady = false;
    this.stateCallbacks.clear();
  }
}

// Container-scoped instances allow dual-deck playback providers.
const playerInstances = new Map<string, YouTubePlayer>();

export function getYouTubePlayer(containerId = 'youtube-player'): YouTubePlayer {
  const existing = playerInstances.get(containerId);
  if (existing) {
    return existing;
  }
  const player = new YouTubePlayer(containerId);
  playerInstances.set(containerId, player);
  return player;
}

export function destroyYouTubePlayer(containerId?: string): void {
  if (containerId) {
    const player = playerInstances.get(containerId);
    if (player) {
      player.destroy();
      playerInstances.delete(containerId);
    }
    return;
  }
  playerInstances.forEach((player) => {
    player.destroy();
  });
  playerInstances.clear();
}

// Utility: Extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
