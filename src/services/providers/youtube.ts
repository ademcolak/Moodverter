import type {
  MusicProvider,
  PlaybackEvent,
  PlaybackEventListener,
  PlaybackState,
  UnifiedTrack,
} from '../../types/provider';
import {
  destroyYouTubePlayer,
  extractVideoId,
  getYouTubePlayer,
  type YouTubePlayer,
} from '../youtube/player';
import {
  addToPlaylist,
  addToRecentlyPlayed,
  getPlaylist,
  getVideoInfo,
  removeFromPlaylist,
  type PlaylistTrack,
  updatePlaylistTrack,
} from '../youtube/search';
import { analyzeTrackWithHeuristicV1 } from '../transition';

export class YouTubeProvider implements MusicProvider {
  readonly name = 'youtube' as const;

  private player: YouTubePlayer | null = null;
  private isInitialized = false;
  private volume = 100;
  private currentTrack: UnifiedTrack | null = null;
  private library: UnifiedTrack[] = [];
  private listeners = new Set<PlaybackEventListener>();
  private previousSnapshot: { isPlaying: boolean; currentTime: number; duration: number } | null = null;
  private lastEndedSignature: string | null = null;

  constructor() {
    this.reloadLibrary();
  }

  private reloadLibrary(): void {
    this.library = getPlaylist().map((track) => this.playlistTrackToUnified(track));
  }

  private emit(event: Omit<PlaybackEvent, 'provider' | 'timestamp'>): void {
    const payload: PlaybackEvent = {
      ...event,
      provider: this.name,
      timestamp: Date.now(),
    };
    this.listeners.forEach((listener) => listener(payload));
  }

  private onPlayerStateChange(state: {
    isPlaying: boolean;
    videoId: string | null;
    currentTime: number;
    duration: number;
  }): void {
    const prev = this.previousSnapshot;

    if (prev && prev.isPlaying && !state.isPlaying) {
      const reachedEnd = state.duration > 0 && state.currentTime >= state.duration - 0.75;
      const trackId = this.currentTrack?.id;
      const signature = trackId ? `${trackId}:${Math.floor(state.duration)}` : null;

      if (reachedEnd && signature && signature !== this.lastEndedSignature) {
        this.lastEndedSignature = signature;
        this.emit({
          type: 'track_ended',
          reason: 'natural',
          track: this.currentTrack,
          progressMs: state.currentTime * 1000,
          durationMs: state.duration * 1000,
        });
      } else {
        this.emit({ type: 'playback_paused', track: this.currentTrack });
      }
    } else if (prev && !prev.isPlaying && state.isPlaying) {
      this.emit({ type: 'playback_resumed', track: this.currentTrack });
    }

    this.previousSnapshot = {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      duration: state.duration,
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.player) return;

    let container = document.getElementById('youtube-player');
    if (!container) {
      container = document.createElement('div');
      container.id = 'youtube-player';
      container.style.position = 'absolute';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    this.player = getYouTubePlayer('youtube-player');
    await this.player.initialize();
    this.player.onStateChange((state) => this.onPlayerStateChange(state));
    this.isInitialized = true;
  }

  private playlistTrackToUnified(track: PlaylistTrack): UnifiedTrack {
    return {
      id: track.videoId,
      provider: 'youtube',
      name: track.title,
      artist: track.artist,
      albumArt: track.thumbnail,
      durationMs: track.duration ?? 0,
      playCount: 0,
      providerData: {
        addedAt: track.addedAt,
      },
    };
  }

  private scheduleTransitionAnalysis(track: UnifiedTrack): void {
    void analyzeTrackWithHeuristicV1({
      id: track.id,
      durationMs: track.durationMs,
      name: track.name,
      artist: track.artist,
    }).catch((error) => {
      console.error('Transition analysis failed:', error);
    });
  }

  isAuthenticated(): boolean {
    return true;
  }

  async authenticate(): Promise<void> {
    await this.ensureInitialized();
  }

  logout(): void {
    destroyYouTubePlayer();
    this.player = null;
    this.isInitialized = false;
    this.currentTrack = null;
    this.previousSnapshot = null;
    this.lastEndedSignature = null;
  }

  async getLibrary(): Promise<UnifiedTrack[]> {
    this.reloadLibrary();
    return [...this.library];
  }

  async search(query: string): Promise<UnifiedTrack[]> {
    const videoId = extractVideoId(query);
    if (!videoId) return [];

    const info = await getVideoInfo(videoId);
    if (!info) return [];

    return [{
      id: videoId,
      provider: 'youtube',
      name: info.title,
      artist: info.artist,
      albumArt: info.thumbnail,
      durationMs: 0,
      playCount: 0,
    }];
  }

  async play(trackId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.player) return;

    const fromLibrary = this.library.find((track) => track.id === trackId);
    if (fromLibrary) {
      this.currentTrack = fromLibrary;
    } else {
      const info = await getVideoInfo(trackId);
      if (!info) throw new Error('Video not found');
      this.currentTrack = {
        id: trackId,
        provider: 'youtube',
        name: info.title,
        artist: info.artist,
        albumArt: info.thumbnail,
        durationMs: 0,
        playCount: 0,
      };

      addToPlaylist({
        videoId: trackId,
        title: info.title,
        artist: info.artist,
        thumbnail: info.thumbnail,
      });
      this.reloadLibrary();
      this.scheduleTransitionAnalysis(this.currentTrack);
    }

    addToRecentlyPlayed({
      videoId: trackId,
      title: this.currentTrack.name,
      artist: this.currentTrack.artist,
      thumbnail: this.currentTrack.albumArt ?? '',
    });

    this.player.loadVideo(trackId, true);
    this.emit({
      type: 'track_started',
      reason: 'manual',
      track: this.currentTrack,
    });
  }

  async pause(): Promise<void> {
    this.player?.pause();
    this.emit({ type: 'playback_paused', track: this.currentTrack });
  }

  async resume(): Promise<void> {
    this.player?.play();
    this.emit({ type: 'playback_resumed', track: this.currentTrack });
  }

  async skip(): Promise<void> {
    if (!this.currentTrack || this.library.length === 0) return;

    const currentIndex = this.library.findIndex((track) => track.id === this.currentTrack?.id);
    const nextTrack = this.library[(currentIndex + 1) % this.library.length];
    if (!nextTrack) return;

    this.emit({ type: 'track_ended', reason: 'skip', previousTrack: this.currentTrack });
    await this.play(nextTrack.id);
  }

  async previous(): Promise<void> {
    if (!this.currentTrack || this.library.length === 0) return;

    const currentIndex = this.library.findIndex((track) => track.id === this.currentTrack?.id);
    const previousIndex = currentIndex <= 0 ? this.library.length - 1 : currentIndex - 1;
    const previousTrack = this.library[previousIndex];
    if (!previousTrack) return;

    this.emit({ type: 'track_ended', reason: 'previous', previousTrack: this.currentTrack });
    await this.play(previousTrack.id);
  }

  async seek(positionMs: number): Promise<void> {
    this.player?.seek(positionMs / 1000);
  }

  async setVolume(percent: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, percent));
    this.player?.setVolume(this.volume);
  }

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    if (!this.player || !this.currentTrack) return null;
    const state = this.player.getState();
    if (state.videoId !== this.currentTrack.id) return null;

    if (state.duration > 0 && this.currentTrack.durationMs === 0) {
      this.currentTrack = { ...this.currentTrack, durationMs: state.duration * 1000 };
    }
    return this.currentTrack;
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    if (!this.player) {
      return {
        isPlaying: false,
        currentTrack: null,
        progressMs: 0,
        durationMs: 0,
        volume: this.volume,
        deviceName: 'YouTube Player',
      };
    }

    const state = this.player.getState();
    const currentTrack = await this.getCurrentTrack();
    return {
      isPlaying: state.isPlaying,
      currentTrack,
      progressMs: state.currentTime * 1000,
      durationMs: state.duration * 1000,
      volume: state.volume,
      deviceName: 'YouTube Player',
    };
  }

  onPlaybackEvent(listener: PlaybackEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addTrackToLibrary(track: UnifiedTrack): void {
    addToPlaylist({
      videoId: track.id,
      title: track.name,
      artist: track.artist,
      thumbnail: track.albumArt ?? '',
      duration: track.durationMs,
    });
    this.reloadLibrary();
    this.scheduleTransitionAnalysis(track);
  }

  removeTrackFromLibrary(trackId: string): void {
    removeFromPlaylist(trackId);
    this.reloadLibrary();
  }

  async addTrackFromUrl(url: string): Promise<UnifiedTrack | null> {
    const videoId = extractVideoId(url);
    if (!videoId) return null;

    const track: UnifiedTrack = {
      id: videoId,
      provider: 'youtube',
      name: `YouTube ${videoId}`,
      artist: 'Unknown Artist',
      albumArt: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      durationMs: 0,
      playCount: 0,
    };

    this.addTrackToLibrary(track);

    // Enrich metadata asynchronously so URL add does not block UI responsiveness.
    void getVideoInfo(videoId)
      .then((info) => {
        if (!info) return;

        updatePlaylistTrack(videoId, {
          title: info.title,
          artist: info.artist,
          thumbnail: info.thumbnail,
        });

        this.reloadLibrary();
        if (this.currentTrack?.id === videoId) {
          this.currentTrack = {
            ...this.currentTrack,
            name: info.title,
            artist: info.artist,
            albumArt: info.thumbnail,
          };
        }
      })
      .catch((error) => {
        console.warn('Video metadata enrich failed:', error);
      });

    return track;
  }
}

let youtubeProviderInstance: YouTubeProvider | null = null;

export function getYouTubeProvider(): YouTubeProvider {
  if (!youtubeProviderInstance) {
    youtubeProviderInstance = new YouTubeProvider();
  }
  return youtubeProviderInstance;
}
