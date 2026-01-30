// YouTubeProvider - Implements MusicProvider interface for YouTube

import type {
  MusicProvider,
  UnifiedTrack,
  AudioFeatures,
  PlaybackState,
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
  removeFromPlaylist,
  addToRecentlyPlayed,
  type PlaylistTrack,
} from '../youtube/search';
import {
  getCachedAnalysis,
  generateSyntheticFeatures,
} from '../audio/analyzer';
import { registerProvider, DEFAULT_AUDIO_FEATURES } from './index';

export class YouTubeProvider implements MusicProvider {
  readonly name = 'youtube' as const;
  private player: YouTubePlayer | null = null;
  private isInitialized = false;
  private volume = 100;
  private currentTrack: UnifiedTrack | null = null;
  private library: UnifiedTrack[] = [];

  constructor() {
    this.loadLibraryFromStorage();
  }

  private loadLibraryFromStorage(): void {
    const playlist = getPlaylist();
    this.library = playlist.map(track => this.playlistTrackToUnified(track));
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
      if (state.videoId && state.videoId !== this.currentTrack?.id) {
        // Track changed externally
      }
    });
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
  }

  async pause(): Promise<void> {
    if (!this.player) return;
    this.player.pause();
  }

  async resume(): Promise<void> {
    if (!this.player) return;
    this.player.play();
  }

  async skip(): Promise<void> {
    // Get next track in library
    if (!this.currentTrack || this.library.length === 0) return;

    const currentIndex = this.library.findIndex(t => t.id === this.currentTrack?.id);
    const nextIndex = (currentIndex + 1) % this.library.length;
    const nextTrack = this.library[nextIndex];

    if (nextTrack) {
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

    // Generate synthetic features from metadata
    return generateSyntheticFeatures(title, artist);
  }

  private playlistTrackToUnified(track: PlaylistTrack): UnifiedTrack {
    const features = this.getOrGenerateFeatures(
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
      durationMs: (track.duration ?? 0) * 1000,
      playCount: 0,
      audioFeatures: features,
      providerData: {
        addedAt: track.addedAt,
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
    });
    this.loadLibraryFromStorage();
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
