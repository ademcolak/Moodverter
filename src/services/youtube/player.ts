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
const apiLoadPromises: Array<() => void> = [];

// Load YouTube IFrame API script
function loadYouTubeAPI(): Promise<void> {
  return new Promise((resolve) => {
    if (apiLoaded) {
      resolve();
      return;
    }

    if (apiLoading) {
      apiLoadPromises.push(resolve);
      return;
    }

    apiLoading = true;

    // Set up callback before loading script
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true;
      apiLoading = false;
      resolve();
      apiLoadPromises.forEach(cb => cb());
      apiLoadPromises.length = 0;
    };

    // Load the script
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
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
              resolve();
            },
            onStateChange: (event) => {
              this.handleStateChange(event.data);
            },
            onError: (event) => {
              this.handleError(event.data);
            },
          },
        });
      } catch (error) {
        reject(error);
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
    }, 250);
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

  loadVideo(videoId: string, autoplay = true): void {
    if (!this.player || !this.state.isReady) {
      console.warn('Player not ready');
      return;
    }

    this.state.error = null;
    this.state.videoId = videoId;

    if (autoplay) {
      this.player.loadVideoById(videoId);
    } else {
      this.player.cueVideoById(videoId);
    }

    this.notifyStateChange();
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

// Singleton instance for global use
let playerInstance: YouTubePlayer | null = null;

export function getYouTubePlayer(containerId = 'youtube-player'): YouTubePlayer {
  if (!playerInstance) {
    playerInstance = new YouTubePlayer(containerId);
  }
  return playerInstance;
}

export function destroyYouTubePlayer(): void {
  if (playerInstance) {
    playerInstance.destroy();
    playerInstance = null;
  }
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
