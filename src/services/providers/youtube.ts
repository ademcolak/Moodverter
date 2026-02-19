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

const TRANSITION_VOLUME_DUCK_PERCENT = 16;
const TRANSITION_VOLUME_STEP_MS = 120;
const TRANSITION_VOLUME_MIN = 30;
const TRANSITION_COMPENSATION_MAX_OFFSET = 18;
const DEFAULT_TRANSITION_HANDOFF_DUCK_PERCENT = 10;
const DEFAULT_TRANSITION_HANDOFF_RAMP_MS = 220;
const DEFAULT_TRANSITION_HANDOFF_HOLD_MS = 360;
const PLAYBACK_START_RECOVERY_MAX_POLLS = 8;
const PLAYBACK_START_RECOVERY_POLL_MS = 160;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export interface TransitionPlaybackOptions {
  sourceLoudnessRms?: number;
  targetLoudnessRms?: number;
}

export interface TransitionHandoffProfile {
  duckPercent: number;
  rampMs: number;
  holdMs: number;
}

export class YouTubeProvider implements MusicProvider {
  readonly name = 'youtube' as const;

  private player: YouTubePlayer | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private volume = 100;
  private currentTrack: UnifiedTrack | null = null;
  private library: UnifiedTrack[] = [];
  private listeners = new Set<PlaybackEventListener>();
  private previousSnapshot: { isPlaying: boolean; currentTime: number; duration: number } | null = null;
  private lastEndedSignature: string | null = null;
  private warmupPromises = new Map<string, Promise<void>>();
  private transitionVolumeAutomationToken = 0;
  private transitionHandoffToken = 0;
  private transitionHandoffProfile: TransitionHandoffProfile = {
    duckPercent: DEFAULT_TRANSITION_HANDOFF_DUCK_PERCENT,
    rampMs: DEFAULT_TRANSITION_HANDOFF_RAMP_MS,
    holdMs: DEFAULT_TRANSITION_HANDOFF_HOLD_MS,
  };

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
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
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
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
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

  private clampVolume(percent: number): number {
    if (!Number.isFinite(percent)) return 100;
    return Math.max(0, Math.min(100, Math.round(percent)));
  }

  private applyPlayerVolume(percent: number): void {
    if (!this.player) return;
    this.player.setVolume(this.clampVolume(percent));
  }

  private cancelTransitionVolumeAutomation(resetToBaseVolume = false): void {
    this.transitionVolumeAutomationToken += 1;
    if (resetToBaseVolume) {
      this.applyPlayerVolume(this.volume);
    }
  }

  private async rampPlayerVolume(
    fromPercent: number,
    toPercent: number,
    durationMs: number,
    automationToken: number
  ): Promise<void> {
    if (!this.player) return;
    const clampedFrom = this.clampVolume(fromPercent);
    const clampedTo = this.clampVolume(toPercent);
    const steps = Math.max(1, Math.floor(Math.max(0, durationMs) / TRANSITION_VOLUME_STEP_MS));

    for (let step = 1; step <= steps; step += 1) {
      if (automationToken !== this.transitionVolumeAutomationToken) return;
      const ratio = step / steps;
      const volume = clampedFrom + (clampedTo - clampedFrom) * ratio;
      this.applyPlayerVolume(volume);
      if (step < steps) {
        await wait(TRANSITION_VOLUME_STEP_MS);
      }
    }
  }

  private computeCompensatedVolume(
    sourceLoudnessRms: number | undefined,
    targetLoudnessRms: number | undefined
  ): number {
    if (
      typeof sourceLoudnessRms !== 'number'
      || !Number.isFinite(sourceLoudnessRms)
      || typeof targetLoudnessRms !== 'number'
      || !Number.isFinite(targetLoudnessRms)
    ) {
      return this.clampVolume(this.volume);
    }
    const loudnessDiff = targetLoudnessRms - sourceLoudnessRms;
    const offset = Math.max(
      -TRANSITION_COMPENSATION_MAX_OFFSET,
      Math.min(TRANSITION_COMPENSATION_MAX_OFFSET, Math.round(-loudnessDiff * 2))
    );
    return this.clampVolume(this.volume + offset);
  }

  private startTransitionVolumeEnvelope(
    sourceLoudnessRms: number | undefined,
    targetLoudnessRms: number | undefined
  ): void {
    if (!this.player) return;
    const baseVolume = this.clampVolume(this.volume);
    const duckedVolume = this.clampVolume(
      Math.max(TRANSITION_VOLUME_MIN, baseVolume - TRANSITION_VOLUME_DUCK_PERCENT)
    );
    const compensatedVolume = this.computeCompensatedVolume(sourceLoudnessRms, targetLoudnessRms);
    const token = this.transitionVolumeAutomationToken + 1;
    this.transitionVolumeAutomationToken = token;

    this.applyPlayerVolume(duckedVolume);
    void (async () => {
      await wait(140);
      await this.rampPlayerVolume(duckedVolume, compensatedVolume, 700, token);
      await wait(900);
      await this.rampPlayerVolume(compensatedVolume, baseVolume, 1100, token);
    })();
  }

  private startTransitionHandoffEnvelope(): void {
    if (!this.player) return;
    const baseVolume = this.clampVolume(this.volume);
    const handoffVolume = this.clampVolume(
      Math.max(TRANSITION_VOLUME_MIN, baseVolume - this.transitionHandoffProfile.duckPercent)
    );
    const volumeToken = this.transitionVolumeAutomationToken + 1;
    this.transitionVolumeAutomationToken = volumeToken;
    const handoffToken = this.transitionHandoffToken + 1;
    this.transitionHandoffToken = handoffToken;

    void (async () => {
      await this.rampPlayerVolume(baseVolume, handoffVolume, this.transitionHandoffProfile.rampMs, volumeToken);
      await wait(this.transitionHandoffProfile.holdMs);
      if (
        handoffToken !== this.transitionHandoffToken
        || volumeToken !== this.transitionVolumeAutomationToken
      ) {
        return;
      }
      await this.rampPlayerVolume(handoffVolume, baseVolume, this.transitionHandoffProfile.rampMs, volumeToken);
    })();
  }

  private clampStartMsToTrack(startMs: number, durationMs: number): number {
    if (!Number.isFinite(startMs) || startMs <= 0) return 0;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return Math.round(startMs);
    const maxSafeStart = Math.max(0, durationMs - 1000);
    return Math.min(Math.round(startMs), maxSafeStart);
  }

  private async resolveTrackForPlayback(trackId: string): Promise<UnifiedTrack> {
    const fromLibrary = this.library.find((track) => track.id === trackId);
    if (fromLibrary) return fromLibrary;

    const info = await getVideoInfo(trackId);
    if (!info) throw new Error('Video not found');

    const track: UnifiedTrack = {
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
    this.scheduleTransitionAnalysis(track);
    return track;
  }

  private async loadTrackAtTime(trackId: string, startTimeMs = 0): Promise<UnifiedTrack> {
    await this.ensureInitialized();
    if (!this.player) {
      throw new Error('Player is not ready');
    }

    const track = await this.resolveTrackForPlayback(trackId);
    this.currentTrack = track;
    const startMs = this.clampStartMsToTrack(startTimeMs, track.durationMs);
    const startSeconds = startMs / 1000;

    this.player.loadVideo(trackId, true, startSeconds);
    addToRecentlyPlayed({
      videoId: trackId,
      title: track.name,
      artist: track.artist,
      thumbnail: track.albumArt ?? '',
    });
    this.emit({
      type: 'track_started',
      reason: 'manual',
      track: this.currentTrack,
    });

    if (startMs > 0) {
      // Fallback seeks improve reliability while iframe transitions from buffering to playing.
      await wait(180);
      this.player.seek(startSeconds);
      await wait(220);
      this.player.seek(startSeconds);
    }

    await this.recoverPlaybackStart(trackId, startSeconds);

    return track;
  }

  private async recoverPlaybackStart(trackId: string, startSeconds: number): Promise<void> {
    if (!this.player) return;

    const normalizedStart = Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0);
    let hasReloaded = false;

    for (let attempt = 0; attempt < PLAYBACK_START_RECOVERY_MAX_POLLS; attempt += 1) {
      if (!this.player) return;
      const state = this.player.getState();
      const hasExpectedTrack = state.videoId === trackId;
      const reachedExpectedTime = state.currentTime >= Math.max(0, normalizedStart - 0.35);

      if (hasExpectedTrack && (state.isPlaying || reachedExpectedTime)) {
        return;
      }

      // Slow networks can leave iframe in a non-playing buffer state; nudge play/seek and reload once.
      if (attempt === 2 || attempt === 5) {
        this.player.play();
        if (normalizedStart > 0) {
          this.player.seek(normalizedStart);
        }
      }

      if (!hasReloaded && attempt === 4) {
        this.player.loadVideo(trackId, true, normalizedStart);
        hasReloaded = true;
      }

      if (attempt < PLAYBACK_START_RECOVERY_MAX_POLLS - 1) {
        await wait(PLAYBACK_START_RECOVERY_POLL_MS);
      }
    }
  }

  isAuthenticated(): boolean {
    return true;
  }

  async authenticate(): Promise<void> {
    await this.ensureInitialized();
  }

  logout(): void {
    this.cancelTransitionVolumeAutomation(false);
    this.transitionHandoffToken += 1;
    this.warmupPromises.clear();
    destroyYouTubePlayer();
    this.player = null;
    this.isInitialized = false;
    this.initPromise = null;
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
    this.cancelTransitionVolumeAutomation(true);
    this.transitionHandoffToken += 1;
    await this.loadTrackAtTime(trackId, 0);
  }

  async pause(): Promise<void> {
    this.transitionHandoffToken += 1;
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
    this.transitionHandoffToken += 1;
    this.player?.seek(positionMs / 1000);
  }

  async setVolume(percent: number): Promise<void> {
    this.cancelTransitionVolumeAutomation(false);
    this.transitionHandoffToken += 1;
    this.volume = this.clampVolume(percent);
    this.applyPlayerVolume(this.volume);
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

  async warmupTransitionTarget(trackId: string): Promise<void> {
    const normalizedTrackId = trackId.trim();
    if (!normalizedTrackId) return;
    const inFlight = this.warmupPromises.get(normalizedTrackId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const warmupPromise = (async () => {
      try {
        const info = await getVideoInfo(normalizedTrackId);
        if (!info) return;

        const existingTrack = this.library.find((track) => track.id === normalizedTrackId);
        if (!existingTrack) return;

        const needsRefresh = existingTrack.name.startsWith('YouTube ')
          || existingTrack.artist === 'Unknown Artist'
          || existingTrack.albumArt !== info.thumbnail;
        if (!needsRefresh) return;

        updatePlaylistTrack(normalizedTrackId, {
          title: info.title,
          artist: info.artist,
          thumbnail: info.thumbnail,
        });
        this.reloadLibrary();
        if (this.currentTrack?.id === normalizedTrackId) {
          this.currentTrack = {
            ...this.currentTrack,
            name: info.title,
            artist: info.artist,
            albumArt: info.thumbnail,
          };
        }
      } catch (error) {
        console.warn('Transition warmup failed:', error);
      }
    })().finally(() => {
      this.warmupPromises.delete(normalizedTrackId);
    });

    this.warmupPromises.set(normalizedTrackId, warmupPromise);
    await warmupPromise;
  }

  async playTransitionTarget(
    trackId: string,
    targetTimeMs: number,
    options: TransitionPlaybackOptions = {}
  ): Promise<void> {
    this.transitionHandoffToken += 1;
    await this.warmupTransitionTarget(trackId);
    this.startTransitionVolumeEnvelope(options.sourceLoudnessRms, options.targetLoudnessRms);
    await this.loadTrackAtTime(trackId, targetTimeMs);
  }

  primeTransitionHandoff(): void {
    this.startTransitionHandoffEnvelope();
  }

  configureTransitionHandoffProfile(
    profile: Partial<TransitionHandoffProfile>
  ): TransitionHandoffProfile {
    const next: TransitionHandoffProfile = {
      duckPercent: this.clampVolume(
        profile.duckPercent ?? this.transitionHandoffProfile.duckPercent
      ),
      rampMs: Math.max(
        80,
        Math.min(900, Math.round(profile.rampMs ?? this.transitionHandoffProfile.rampMs))
      ),
      holdMs: Math.max(
        120,
        Math.min(1500, Math.round(profile.holdMs ?? this.transitionHandoffProfile.holdMs))
      ),
    };
    this.transitionHandoffProfile = next;
    return { ...next };
  }

  getTransitionHandoffProfile(): TransitionHandoffProfile {
    return { ...this.transitionHandoffProfile };
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
