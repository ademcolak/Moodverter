// YouTubeProvider - Implements MusicProvider interface for YouTube

import type {
  MusicProvider,
  UnifiedTrack,
  AudioFeatures,
  PlaybackState,
  PlaybackEvent,
  PlaybackEventListener,
} from '../../types/provider';
import {
  YouTubePlayer,
  getYouTubePlayer,
  destroyYouTubePlayer,
  extractVideoId,
} from '../youtube/player';
import {
  getVideoInfo,
  getPlaylist,
  addToPlaylist,
  updatePlaylistTrack,
  removeFromPlaylist,
  addToRecentlyPlayed,
  type PlaylistTrack,
} from '../youtube/search';
import {
  getCachedAnalysis,
  generateSyntheticFeatures,
} from '../audio/analyzer';
import { analyzeTrack } from '../mood/engine';
import { registerProvider, DEFAULT_AUDIO_FEATURES } from './index';

export class YouTubeProvider implements MusicProvider {
  readonly name = 'youtube' as const;
  private player: YouTubePlayer | null = null;
  private isInitialized = false;
  private volume = 100;
  private currentTrack: UnifiedTrack | null = null;
  private library: UnifiedTrack[] = [];
  private analysisInFlight = new Map<string, Promise<void>>();
  private playbackEventListeners = new Set<PlaybackEventListener>();
  private previousPlayerSnapshot: { isPlaying: boolean; currentTime: number; duration: number; videoId: string | null } | null = null;
  private lastEndedSignature: string | null = null;

  constructor() {
    this.loadLibraryFromStorage();
  }

  private loadLibraryFromStorage(): void {
    const playlist = getPlaylist();
    this.library = playlist.map(track => this.playlistTrackToUnified(track));
  }

  private async ensureTrackAnalysis(
    videoId: string,
    title: string,
    artist: string
  ): Promise<void> {
    const existing = this.library.find(t => t.id === videoId);
    if (existing?.audioFeatures && existing.providerData?.analysis) {
      return;
    }
    if (this.analysisInFlight.has(videoId)) {
      return this.analysisInFlight.get(videoId)!;
    }

    const task = (async () => {
      try {
        const result = await analyzeTrack(title, artist, videoId);

        updatePlaylistTrack(videoId, {
          audioFeatures: result.audioFeatures,
          analysis: {
            suggestedMood: result.suggestedMood,
            confidence: result.confidence,
            genres: result.genres,
            moods: result.moods,
            method: result.method,
          },
        });

        // Update in-memory library entry
        const index = this.library.findIndex(t => t.id === videoId);
        if (index >= 0) {
          this.library[index] = {
            ...this.library[index],
            audioFeatures: result.audioFeatures,
            providerData: {
              ...(this.library[index].providerData || {}),
              analysis: {
                suggestedMood: result.suggestedMood,
                confidence: result.confidence,
                genres: result.genres,
                moods: result.moods,
                method: result.method,
              },
            },
          };
        }

        if (this.currentTrack?.id === videoId) {
          this.currentTrack = {
            ...this.currentTrack,
            audioFeatures: result.audioFeatures,
            providerData: {
              ...(this.currentTrack.providerData || {}),
              analysis: {
                suggestedMood: result.suggestedMood,
                confidence: result.confidence,
                genres: result.genres,
                moods: result.moods,
                method: result.method,
              },
            },
          };
        }
      } catch (error) {
        console.warn('Failed to analyze track metadata:', error);
      }
    })().finally(() => {
      this.analysisInFlight.delete(videoId);
    });

    this.analysisInFlight.set(videoId, task);
    await task;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.isInitialized && this.player) return;

    // Create container if it doesn't exist
    let container = document.getElementById('youtube-player');
    if (!container) {
      container = document.createElement('div');
      container.id = 'youtube-player';
      container.style.position = 'absolute';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.overflow = 'hidden';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      document.body.appendChild(container);
    }

    this.player = getYouTubePlayer('youtube-player');
    await this.player.initialize();
    this.isInitialized = true;

    // Subscribe to state changes
    this.player.onStateChange((state) => {
      this.handlePlayerStateChange(state);
    });
  }

  private emitPlaybackEvent(event: Omit<PlaybackEvent, 'provider' | 'timestamp'>): void {
    const payload: PlaybackEvent = {
      ...event,
      provider: this.name,
      timestamp: Date.now(),
    };

    this.playbackEventListeners.forEach((listener) => listener(payload));
  }

  private handlePlayerStateChange(state: {
    isPlaying: boolean;
    videoId: string | null;
    currentTime: number;
    duration: number;
  }): void {
    const previous = this.previousPlayerSnapshot;

    if (previous && previous.isPlaying && !state.isPlaying) {
      const reachedEnd = state.duration > 0 && state.currentTime >= state.duration - 0.75;
      const endedTrackId = this.currentTrack?.id ?? previous.videoId;
      const signature = endedTrackId ? `${endedTrackId}:${Math.floor(state.duration)}` : null;

      if (reachedEnd && signature && signature !== this.lastEndedSignature) {
        this.lastEndedSignature = signature;
        this.emitPlaybackEvent({
          type: 'track_ended',
          reason: 'natural',
          track: this.currentTrack,
          progressMs: Math.max(0, state.currentTime * 1000),
          durationMs: Math.max(0, state.duration * 1000),
        });
      } else {
        this.emitPlaybackEvent({ type: 'playback_paused' });
      }
    } else if (previous && !previous.isPlaying && state.isPlaying) {
      this.emitPlaybackEvent({
        type: 'playback_resumed',
        track: this.currentTrack,
      });
    }

    this.previousPlayerSnapshot = {
      isPlaying: state.isPlaying,
      currentTime: state.currentTime,
      duration: state.duration,
      videoId: state.videoId,
    };
  }

  // Authentication (YouTube doesn't require auth for basic playback)

  isAuthenticated(): boolean {
    return true; // No auth needed for YouTube
  }

  async authenticate(): Promise<void> {
    await this.ensureInitialized();
  }

  logout(): void {
    if (this.player) {
      destroyYouTubePlayer();
      this.player = null;
      this.isInitialized = false;
    }
    this.currentTrack = null;
    this.previousPlayerSnapshot = null;
    this.lastEndedSignature = null;
  }

  // Library access

  async getLibrary(): Promise<UnifiedTrack[]> {
    this.loadLibraryFromStorage();
    return [...this.library];
  }

  async search(query: string): Promise<UnifiedTrack[]> {
    // Check if query is a URL
    const videoId = extractVideoId(query);

    if (videoId) {
      // Fetch video info
      const info = await getVideoInfo(videoId);
      if (info) {
        const features = this.getOrGenerateFeatures(videoId, info.title, info.artist);
        return [{
          id: videoId,
          provider: 'youtube',
          name: info.title,
          artist: info.artist,
          albumArt: info.thumbnail,
          durationMs: 0, // Will be updated when played
          playCount: 0,
          audioFeatures: features,
        }];
      }
    }

    // For text search, return matching items from library
    const lowerQuery = query.toLowerCase();
    return this.library.filter(track =>
      track.name.toLowerCase().includes(lowerQuery) ||
      track.artist.toLowerCase().includes(lowerQuery)
    );
  }

  // Playback control

  async play(trackId: string): Promise<void> {
    await this.ensureInitialized();
    if (!this.player) return;

    // Try to get track info
    const existingTrack = this.library.find(t => t.id === trackId);

    if (existingTrack) {
      this.currentTrack = existingTrack;
    } else {
      // Fetch info for new track
      const info = await getVideoInfo(trackId);
      if (info) {
        const features = this.getOrGenerateFeatures(trackId, info.title, info.artist);
        this.currentTrack = {
          id: trackId,
          provider: 'youtube',
          name: info.title,
          artist: info.artist,
          albumArt: info.thumbnail,
          durationMs: 0,
          playCount: 0,
          audioFeatures: features,
        };

        // Add to playlist
        addToPlaylist(info);
        this.loadLibraryFromStorage();

        // Analyze metadata in background
        void this.ensureTrackAnalysis(trackId, info.title, info.artist);
      }
    }

    if (this.currentTrack) {
      addToRecentlyPlayed({
        videoId: trackId,
        title: this.currentTrack.name,
        artist: this.currentTrack.artist,
        thumbnail: this.currentTrack.albumArt ?? '',
      });
    }

    this.player.loadVideo(trackId, true);
    this.emitPlaybackEvent({
      type: 'track_started',
      reason: 'manual',
      track: this.currentTrack,
    });
  }

  async pause(): Promise<void> {
    if (!this.player) return;
    this.player.pause();
    this.emitPlaybackEvent({ type: 'playback_paused', track: this.currentTrack });
  }

  async resume(): Promise<void> {
    if (!this.player) return;
    this.player.play();
    this.emitPlaybackEvent({ type: 'playback_resumed', track: this.currentTrack });
  }

  async skip(): Promise<void> {
    // Get next track in library
    if (!this.currentTrack || this.library.length === 0) return;

    const currentIndex = this.library.findIndex(t => t.id === this.currentTrack?.id);
    const nextIndex = (currentIndex + 1) % this.library.length;
    const nextTrack = this.library[nextIndex];

    if (nextTrack) {
      this.emitPlaybackEvent({
        type: 'track_ended',
        reason: 'skip',
        previousTrack: this.currentTrack,
      });
      await this.play(nextTrack.id);
    }
  }

  async previous(): Promise<void> {
    // Get previous track in library
    if (!this.currentTrack || this.library.length === 0) return;

    const currentIndex = this.library.findIndex(t => t.id === this.currentTrack?.id);
    const prevIndex = currentIndex <= 0 ? this.library.length - 1 : currentIndex - 1;
    const prevTrack = this.library[prevIndex];

    if (prevTrack) {
      this.emitPlaybackEvent({
        type: 'track_ended',
        reason: 'previous',
        previousTrack: this.currentTrack,
      });
      await this.play(prevTrack.id);
    }
  }

  async seek(positionMs: number): Promise<void> {
    if (!this.player) return;
    this.player.seek(positionMs / 1000);
  }

  async setVolume(percent: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, percent));
    if (this.player) {
      this.player.setVolume(this.volume);
    }
  }

  // State

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    if (!this.player) return null;

    const state = this.player.getState();
    if (state.videoId && this.currentTrack?.id === state.videoId) {
      // Update duration if available
      if (state.duration > 0 && this.currentTrack.durationMs === 0) {
        this.currentTrack = {
          ...this.currentTrack,
          durationMs: state.duration * 1000,
        };
      }
      return this.currentTrack;
    }

    return null;
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
    this.playbackEventListeners.add(listener);
    return () => {
      this.playbackEventListeners.delete(listener);
    };
  }

  // Audio features

  async getAudioFeatures(trackId: string): Promise<AudioFeatures | null> {
    // Check cache first
    const cached = getCachedAnalysis(trackId);
    if (cached) {
      return cached;
    }

    // Try to find track info
    const track = this.library.find(t => t.id === trackId);
    if (track) {
      return this.getOrGenerateFeatures(trackId, track.name, track.artist);
    }

    // Fetch info and generate
    const info = await getVideoInfo(trackId);
    if (info) {
      return this.getOrGenerateFeatures(trackId, info.title, info.artist);
    }

    return DEFAULT_AUDIO_FEATURES;
  }

  async getAudioFeaturesForTracks(
    trackIds: string[]
  ): Promise<Map<string, AudioFeatures>> {
    const result = new Map<string, AudioFeatures>();

    for (const id of trackIds) {
      const features = await this.getAudioFeatures(id);
      if (features) {
        result.set(id, features);
      }
    }

    return result;
  }

  // Helper methods

  private getOrGenerateFeatures(
    videoId: string,
    title: string,
    artist: string
  ): AudioFeatures {
    // Check cache
    const cached = getCachedAnalysis(videoId);
    if (cached) {
      return cached;
    }

    const existing = this.library.find(t => t.id === videoId);
    if (existing?.audioFeatures) {
      return existing.audioFeatures;
    }

    // Generate synthetic features from metadata
    return generateSyntheticFeatures(title, artist);
  }

  private playlistTrackToUnified(track: PlaylistTrack): UnifiedTrack {
    const features = track.audioFeatures || this.getOrGenerateFeatures(
      track.videoId,
      track.title,
      track.artist
    );

    return {
      id: track.videoId,
      provider: 'youtube',
      name: track.title,
      artist: track.artist,
      albumArt: track.thumbnail,
      durationMs: track.duration ?? 0,
      playCount: 0,
      audioFeatures: features,
      providerData: {
        addedAt: track.addedAt,
        analysis: track.analysis,
      },
    };
  }

  // YouTube-specific methods

  addTrackToLibrary(track: UnifiedTrack): void {
    addToPlaylist({
      videoId: track.id,
      title: track.name,
      artist: track.artist,
      thumbnail: track.albumArt ?? '',
      duration: track.durationMs,
      audioFeatures: track.audioFeatures,
    });
    this.loadLibraryFromStorage();

    if (!track.audioFeatures) {
      void this.ensureTrackAnalysis(track.id, track.name, track.artist);
    }
  }

  removeTrackFromLibrary(trackId: string): void {
    removeFromPlaylist(trackId);
    this.loadLibraryFromStorage();
  }

  async addTrackFromUrl(url: string): Promise<UnifiedTrack | null> {
    const videoId = extractVideoId(url);
    if (!videoId) return null;

    const info = await getVideoInfo(videoId);
    if (!info) return null;

    const track: UnifiedTrack = {
      id: videoId,
      provider: 'youtube',
      name: info.title,
      artist: info.artist,
      albumArt: info.thumbnail,
      durationMs: 0,
      playCount: 0,
      audioFeatures: this.getOrGenerateFeatures(videoId, info.title, info.artist),
    };

    this.addTrackToLibrary(track);
    return track;
  }
}

// Register the provider
registerProvider('youtube', () => new YouTubeProvider());

// Export singleton instance
let youtubeProviderInstance: YouTubeProvider | null = null;

export function getYouTubeProvider(): YouTubeProvider {
  if (!youtubeProviderInstance) {
    youtubeProviderInstance = new YouTubeProvider();
  }
  return youtubeProviderInstance;
}
