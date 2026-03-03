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
const TRANSITION_PRE_SWITCH_DUCK_LEAD_MS = 90;
const DEFAULT_TRANSITION_HANDOFF_DUCK_PERCENT = 10;
const DEFAULT_TRANSITION_HANDOFF_RAMP_MS = 220;
const DEFAULT_TRANSITION_HANDOFF_HOLD_MS = 360;
const PLAYBACK_START_RECOVERY_MAX_POLLS = 8;
const PLAYBACK_START_RECOVERY_POLL_MS = 160;
const TRANSITION_WARMUP_MAX_CONCURRENCY = 1;
const PRIMARY_DECK_CONTAINER_ID = 'youtube-player-primary';
const SECONDARY_DECK_CONTAINER_ID = 'youtube-player-secondary';
const DUAL_DECK_PREROLL_MS = 420;
const DUAL_DECK_MAX_PREROLL_MS = 1400;
const TRANSITION_SWAP_DRIFT_SEEK_THRESHOLD_SECONDS = 0.85;
const TRANSITION_AUDIO_OVERLAP_MS = 90;

type DeckKey = 'primary' | 'secondary';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isQuotaExceededError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014;
  }
  if (error instanceof Error) {
    return /quota|exceeded|storage/i.test(error.message);
  }
  return false;
}

export interface TransitionPlaybackOptions {
  sourceLoudnessRms?: number;
  targetLoudnessRms?: number;
  effectStyle?: TransitionEffectStyle;
  contentHint?: TransitionContentHint;
  silenceAwarePreDuck?: boolean;
}

export interface TransitionHandoffProfile {
  duckPercent: number;
  rampMs: number;
  holdMs: number;
}

export type TransitionEffectStyle = 'clean' | 'ambient' | 'punchy';
export type TransitionContentHint = 'neutral' | 'vocal-heavy' | 'bass-heavy' | 'build-up';

export interface TransitionEffectProfile {
  style: TransitionEffectStyle;
  preDuckMs: number;
  crossfadeMs: number;
  releaseMs: number;
  sourceDuckPercent: number;
  targetRisePercent: number;
}

interface AddTrackOptions {
  skipAnalysis?: boolean;
}

interface LoadTrackOptions {
  deck?: DeckKey;
  autoplay?: boolean;
  makeActive?: boolean;
  emitReason?: 'manual';
}

interface PrimedTransitionState {
  deck: DeckKey;
  trackId: string;
  targetTimeMs: number;
  primedAt: number;
  expectedLeadMs: number;
}

interface TransitionEnvelopePlan {
  duckedVolume: number;
  compensatedVolume: number;
  attackMs: number;
  settleMs: number;
  releaseMs: number;
  preDuckMs: number;
}

const TRANSITION_EFFECT_PROFILES: Record<TransitionEffectStyle, TransitionEffectProfile> = {
  clean: {
    style: 'clean',
    preDuckMs: TRANSITION_PRE_SWITCH_DUCK_LEAD_MS,
    crossfadeMs: 460,
    releaseMs: 960,
    sourceDuckPercent: TRANSITION_VOLUME_DUCK_PERCENT,
    targetRisePercent: 0,
  },
  ambient: {
    style: 'ambient',
    preDuckMs: 130,
    crossfadeMs: 760,
    releaseMs: 1650,
    sourceDuckPercent: 21,
    targetRisePercent: 8,
  },
  punchy: {
    style: 'punchy',
    preDuckMs: 70,
    crossfadeMs: 280,
    releaseMs: 760,
    sourceDuckPercent: 13,
    targetRisePercent: 3,
  },
};

export class YouTubeProvider implements MusicProvider {
  readonly name = 'youtube' as const;

  private player: YouTubePlayer | null = null;
  private secondaryPlayer: YouTubePlayer | null = null;
  private activeDeck: DeckKey = 'primary';
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private volume = 100;
  private currentTrack: UnifiedTrack | null = null;
  private library: UnifiedTrack[] = [];
  private listeners = new Set<PlaybackEventListener>();
  private previousSnapshot: { isPlaying: boolean; currentTime: number; duration: number } | null = null;
  private lastEndedSignature: string | null = null;
  private warmupPromises = new Map<string, Promise<void>>();
  private warmupQueue: Array<() => void> = [];
  private activeWarmupCount = 0;
  private transitionVolumeAutomationToken = 0;
  private transitionHandoffToken = 0;
  private transitionHandoffProfile: TransitionHandoffProfile = {
    duckPercent: DEFAULT_TRANSITION_HANDOFF_DUCK_PERCENT,
    rampMs: DEFAULT_TRANSITION_HANDOFF_RAMP_MS,
    holdMs: DEFAULT_TRANSITION_HANDOFF_HOLD_MS,
  };
  private transitionEffectProfile: TransitionEffectProfile = { ...TRANSITION_EFFECT_PROFILES.clean };
  private hasWarnedRecentQuota = false;
  private primedTransition: PrimedTransitionState | null = null;

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

  private getDeckPlayer(deck: DeckKey): YouTubePlayer | null {
    return deck === 'primary' ? this.player : this.secondaryPlayer;
  }

  private getActivePlayer(): YouTubePlayer | null {
    return this.getDeckPlayer(this.activeDeck) ?? this.player;
  }

  private getInactiveDeck(): DeckKey {
    return this.activeDeck === 'primary' ? 'secondary' : 'primary';
  }

  private ensurePlayerContainer(containerId: string): void {
    if (document.getElementById(containerId)) return;
    const container = document.createElement('div');
    container.id = containerId;
    container.style.position = 'absolute';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.opacity = '0';
    container.style.pointerEvents = 'none';
    document.body.appendChild(container);
  }

  private clearPrimedTransition(): void {
    const primed = this.primedTransition;
    if (!primed) return;
    const player = this.getDeckPlayer(primed.deck);
    if (player && primed.deck !== this.activeDeck) {
      player.pause();
      player.setVolume(0);
    }
    this.primedTransition = null;
  }

  private onPlayerStateChange(sourceDeck: DeckKey, state: {
    isPlaying: boolean;
    videoId: string | null;
    currentTime: number;
    duration: number;
  }): void {
    if (sourceDeck !== this.activeDeck) return;
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
      this.ensurePlayerContainer(PRIMARY_DECK_CONTAINER_ID);
      this.ensurePlayerContainer(SECONDARY_DECK_CONTAINER_ID);

      this.player = getYouTubePlayer(PRIMARY_DECK_CONTAINER_ID);
      this.secondaryPlayer = getYouTubePlayer(SECONDARY_DECK_CONTAINER_ID);
      await this.player.initialize();
      await this.secondaryPlayer.initialize();
      this.player.onStateChange((state) => this.onPlayerStateChange('primary', state));
      this.secondaryPlayer.onStateChange((state) => this.onPlayerStateChange('secondary', state));
      this.player.setVolume(this.volume);
      this.secondaryPlayer.setVolume(0);
      this.activeDeck = 'primary';
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

  private applyPlayerVolume(percent: number, player: YouTubePlayer | null = this.getActivePlayer()): void {
    if (!player) return;
    player.setVolume(this.clampVolume(percent));
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
    automationToken: number,
    player: YouTubePlayer | null = this.getActivePlayer()
  ): Promise<void> {
    if (!player) return;
    const clampedFrom = this.clampVolume(fromPercent);
    const clampedTo = this.clampVolume(toPercent);
    const steps = Math.max(1, Math.floor(Math.max(0, durationMs) / TRANSITION_VOLUME_STEP_MS));

    for (let step = 1; step <= steps; step += 1) {
      if (automationToken !== this.transitionVolumeAutomationToken) return;
      const ratio = step / steps;
      const volume = clampedFrom + (clampedTo - clampedFrom) * ratio;
      this.applyPlayerVolume(volume, player);
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

  private buildTransitionEnvelopePlan(
    sourceLoudnessRms: number | undefined,
    targetLoudnessRms: number | undefined,
    effectProfile: TransitionEffectProfile,
    contentHint: TransitionContentHint,
    silenceAwarePreDuck: boolean
  ): TransitionEnvelopePlan {
    const baseVolume = this.clampVolume(this.volume);
    const compensatedVolume = this.clampVolume(
      this.computeCompensatedVolume(sourceLoudnessRms, targetLoudnessRms)
      + Math.round(effectProfile.targetRisePercent * 0.5)
    );
    const loudnessDelta = (
      typeof targetLoudnessRms === 'number'
      && Number.isFinite(targetLoudnessRms)
      && typeof sourceLoudnessRms === 'number'
      && Number.isFinite(sourceLoudnessRms)
    )
      ? targetLoudnessRms - sourceLoudnessRms
      : 0;
    const louderTargetExtraDuck = Math.max(0, Math.min(8, Math.round(loudnessDelta * 1.2)));
    const handoffInfluenceDuck = Math.round(this.transitionHandoffProfile.duckPercent * 0.45);
    let dynamicDuckPercent = this.clampVolume(
      Math.max(
        effectProfile.sourceDuckPercent,
        handoffInfluenceDuck + louderTargetExtraDuck
      )
    );
    let preDuckMs = Math.max(40, Math.min(260, Math.round(effectProfile.preDuckMs)));
    let attackBoostMs = 0;
    let settleBoostMs = 0;
    let releaseBoostMs = 0;
    if (contentHint === 'vocal-heavy') {
      dynamicDuckPercent = this.clampVolume(dynamicDuckPercent + 4);
      attackBoostMs = 120;
      releaseBoostMs = 220;
      preDuckMs = Math.min(260, preDuckMs + 20);
    } else if (contentHint === 'bass-heavy') {
      dynamicDuckPercent = this.clampVolume(dynamicDuckPercent + 5);
      attackBoostMs = -50;
      settleBoostMs = 110;
      preDuckMs = Math.min(260, preDuckMs + 15);
    } else if (contentHint === 'build-up') {
      dynamicDuckPercent = this.clampVolume(dynamicDuckPercent + 2);
      attackBoostMs = 90;
      settleBoostMs = 180;
      releaseBoostMs = 140;
      preDuckMs = Math.min(260, preDuckMs + 35);
    }
    const lowEnergyTarget = typeof targetLoudnessRms === 'number'
      && Number.isFinite(targetLoudnessRms)
      && targetLoudnessRms <= -26;
    if (silenceAwarePreDuck && lowEnergyTarget) {
      preDuckMs = Math.max(40, Math.round(preDuckMs * 0.6));
      attackBoostMs = Math.min(attackBoostMs, -60);
    }
    const duckedVolume = this.clampVolume(
      Math.max(TRANSITION_VOLUME_MIN, baseVolume - dynamicDuckPercent)
    );
    const compensationDistance = Math.abs(compensatedVolume - baseVolume);
    const attackMs = Math.max(
      320,
      Math.min(
        1400,
        Math.round(
          effectProfile.crossfadeMs
          + compensationDistance * 16
          + this.transitionHandoffProfile.rampMs * 0.35
          + attackBoostMs
        )
      )
    );
    const settleMs = Math.max(
      280,
      Math.min(
        1700,
        Math.round(
          effectProfile.crossfadeMs * 1.15
          + Math.max(0, loudnessDelta) * 60
          + this.transitionHandoffProfile.holdMs * 0.4
          + settleBoostMs
        )
      )
    );
    const releaseMs = Math.max(
      Math.max(520, Math.round(effectProfile.releaseMs * 0.7)),
      Math.min(
        Math.max(2600, effectProfile.releaseMs + 700),
        Math.round(
          effectProfile.releaseMs
          + compensationDistance * 20
          + this.transitionHandoffProfile.rampMs * 0.7
          + releaseBoostMs
        )
      )
    );

    return {
      duckedVolume,
      compensatedVolume,
      attackMs,
      settleMs,
      releaseMs,
      preDuckMs,
    };
  }

  private startTransitionVolumeEnvelope(
    sourceLoudnessRms: number | undefined,
    targetLoudnessRms: number | undefined,
    effectProfile: TransitionEffectProfile,
    contentHint: TransitionContentHint,
    silenceAwarePreDuck: boolean,
    sourcePlayer: YouTubePlayer | null
  ): TransitionEnvelopePlan | null {
    if (!sourcePlayer) return null;
    const baseVolume = this.clampVolume(this.volume);
    const envelopePlan = this.buildTransitionEnvelopePlan(
      sourceLoudnessRms,
      targetLoudnessRms,
      effectProfile,
      contentHint,
      silenceAwarePreDuck
    );
    const token = this.transitionVolumeAutomationToken + 1;
    this.transitionVolumeAutomationToken = token;

    this.applyPlayerVolume(envelopePlan.duckedVolume, sourcePlayer);
    void (async () => {
      await wait(140);
      await this.rampPlayerVolume(
        envelopePlan.duckedVolume,
        envelopePlan.compensatedVolume,
        envelopePlan.attackMs,
        token,
        sourcePlayer
      );
      await wait(envelopePlan.settleMs);
      await this.rampPlayerVolume(
        envelopePlan.compensatedVolume,
        baseVolume,
        envelopePlan.releaseMs,
        token,
        sourcePlayer
      );
    })();
    return envelopePlan;
  }

  private startTransitionHandoffEnvelope(): void {
    const sourcePlayer = this.getActivePlayer();
    if (!sourcePlayer) return;
    const baseVolume = this.clampVolume(this.volume);
    const handoffVolume = this.clampVolume(
      Math.max(TRANSITION_VOLUME_MIN, baseVolume - this.transitionHandoffProfile.duckPercent)
    );
    const volumeToken = this.transitionVolumeAutomationToken + 1;
    this.transitionVolumeAutomationToken = volumeToken;
    const handoffToken = this.transitionHandoffToken + 1;
    this.transitionHandoffToken = handoffToken;

    void (async () => {
      await this.rampPlayerVolume(
        baseVolume,
        handoffVolume,
        this.transitionHandoffProfile.rampMs,
        volumeToken,
        sourcePlayer
      );
      await wait(this.transitionHandoffProfile.holdMs);
      if (
        handoffToken !== this.transitionHandoffToken
        || volumeToken !== this.transitionVolumeAutomationToken
      ) {
        return;
      }
      await this.rampPlayerVolume(
        handoffVolume,
        baseVolume,
        this.transitionHandoffProfile.rampMs,
        volumeToken,
        sourcePlayer
      );
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

  private async loadTrackAtTime(
    trackId: string,
    startTimeMs = 0,
    options: LoadTrackOptions = {}
  ): Promise<UnifiedTrack> {
    await this.ensureInitialized();
    const targetDeck = options.deck ?? this.activeDeck;
    const player = this.getDeckPlayer(targetDeck);
    if (!player) {
      throw new Error('Player is not ready');
    }

    const track = await this.resolveTrackForPlayback(trackId);
    const startMs = this.clampStartMsToTrack(startTimeMs, track.durationMs);
    const startSeconds = startMs / 1000;
    const autoplay = options.autoplay ?? true;
    const makeActive = options.makeActive ?? autoplay;

    if (!autoplay) {
      player.cueVideo(trackId, startSeconds);
    } else {
      player.loadVideo(trackId, true, startSeconds);
    }

    if (startMs > 0 && autoplay) {
      // Fallback seeks improve reliability while iframe transitions from buffering to playing.
      await wait(180);
      player.seek(startSeconds);
      await wait(220);
      player.seek(startSeconds);
    }

    if (autoplay) {
      await this.recoverPlaybackStart(player, trackId, startSeconds, true);
    }

    if (makeActive) {
      const previousActive = this.getActivePlayer();
      if (previousActive && previousActive !== player) {
        previousActive.pause();
        previousActive.setVolume(0);
      }
      this.activeDeck = targetDeck;
      this.currentTrack = track;
      this.previousSnapshot = null;
      this.lastEndedSignature = null;
      player.setVolume(this.volume);
    }

    if (!autoplay) {
      return track;
    }

    try {
      addToRecentlyPlayed({
        videoId: trackId,
        title: track.name,
        artist: track.artist,
        thumbnail: track.albumArt ?? '',
      });
    } catch (error) {
      if (isQuotaExceededError(error)) {
        // Recent history is non-critical; don't fail playback when local storage is full.
        if (!this.hasWarnedRecentQuota) {
          this.hasWarnedRecentQuota = true;
          console.warn('Skipping recent history writes due to storage quota.');
        }
      } else {
        throw error;
      }
    }
    this.emit({
      type: 'track_started',
      reason: options.emitReason ?? 'manual',
      track,
    });

    return track;
  }

  private async recoverPlaybackStart(
    player: YouTubePlayer,
    trackId: string,
    startSeconds: number,
    autoplay = true
  ): Promise<void> {
    if (!player) return;

    const normalizedStart = Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0);
    const allowReachedTimeAsSuccess = normalizedStart > 0.1;
    let hasReloaded = false;

    for (let attempt = 0; attempt < PLAYBACK_START_RECOVERY_MAX_POLLS; attempt += 1) {
      const state = player.getState();
      const hasExpectedTrack = state.videoId === trackId;
      const reachedExpectedTime = state.currentTime >= Math.max(0, normalizedStart - 0.35);
      if (hasExpectedTrack && state.error) {
        throw new Error(`YouTube player error: ${state.error}`);
      }

      if (hasExpectedTrack && (state.isPlaying || (allowReachedTimeAsSuccess && reachedExpectedTime))) {
        return;
      }

      // Slow networks can leave iframe in a non-playing buffer state; nudge play/seek and reload once.
      if (attempt === 2 || attempt === 5) {
        if (autoplay) {
          player.play();
        }
        if (normalizedStart > 0) {
          player.seek(normalizedStart);
        }
      }

      if (!hasReloaded && attempt === 4) {
        player.loadVideo(trackId, autoplay, normalizedStart);
        hasReloaded = true;
      }

      if (attempt < PLAYBACK_START_RECOVERY_MAX_POLLS - 1) {
        await wait(PLAYBACK_START_RECOVERY_POLL_MS);
      }
    }

    const finalState = player.getState();
    if (finalState?.error) {
      throw new Error(`YouTube player error: ${finalState.error}`);
    }
    throw new Error('Playback did not start in expected time');
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
    this.clearPrimedTransition();
    this.warmupPromises.clear();
    destroyYouTubePlayer();
    this.player = null;
    this.secondaryPlayer = null;
    this.activeDeck = 'primary';
    this.isInitialized = false;
    this.initPromise = null;
    this.currentTrack = null;
    this.previousSnapshot = null;
    this.lastEndedSignature = null;
    this.primedTransition = null;
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
    this.clearPrimedTransition();
    await this.loadTrackAtTime(trackId, 0);
  }

  async pause(): Promise<void> {
    this.transitionHandoffToken += 1;
    this.getActivePlayer()?.pause();
    this.emit({ type: 'playback_paused', track: this.currentTrack });
  }

  async resume(): Promise<void> {
    this.getActivePlayer()?.play();
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
    this.getActivePlayer()?.seek(positionMs / 1000);
  }

  async setVolume(percent: number): Promise<void> {
    this.cancelTransitionVolumeAutomation(false);
    this.transitionHandoffToken += 1;
    this.volume = this.clampVolume(percent);
    this.applyPlayerVolume(this.volume, this.getActivePlayer());
  }

  async getCurrentTrack(): Promise<UnifiedTrack | null> {
    const activePlayer = this.getActivePlayer();
    if (!activePlayer || !this.currentTrack) return null;
    const state = activePlayer.getState();
    if (state.videoId !== this.currentTrack.id) return null;

    if (state.duration > 0 && this.currentTrack.durationMs === 0) {
      this.currentTrack = { ...this.currentTrack, durationMs: state.duration * 1000 };
    }
    return this.currentTrack;
  }

  async getPlaybackState(): Promise<PlaybackState | null> {
    const activePlayer = this.getActivePlayer();
    if (!activePlayer) {
      return {
        isPlaying: false,
        currentTrack: null,
        progressMs: 0,
        durationMs: 0,
        volume: this.volume,
        deviceName: 'YouTube Player',
      };
    }

    const state = activePlayer.getState();
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

  private runWarmupWithBudget(task: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = () => {
        this.activeWarmupCount += 1;
        void task()
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.activeWarmupCount = Math.max(0, this.activeWarmupCount - 1);
            const next = this.warmupQueue.shift();
            if (next) next();
          });
      };

      if (this.activeWarmupCount < TRANSITION_WARMUP_MAX_CONCURRENCY) {
        start();
        return;
      }
      this.warmupQueue.push(start);
    });
  }

  private async performTransitionWarmup(normalizedTrackId: string): Promise<void> {
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
  }

  async warmupTransitionTarget(trackId: string): Promise<void> {
    const normalizedTrackId = trackId.trim();
    if (!normalizedTrackId) return;
    const inFlight = this.warmupPromises.get(normalizedTrackId);
    if (inFlight) {
      await inFlight;
      return;
    }

    const warmupPromise = this.runWarmupWithBudget(async () => {
      try {
        await this.performTransitionWarmup(normalizedTrackId);
      } catch (error) {
        console.warn('Transition warmup failed:', error);
      }
    }).finally(() => {
      this.warmupPromises.delete(normalizedTrackId);
    });

    this.warmupPromises.set(normalizedTrackId, warmupPromise);
    await warmupPromise;
  }

  async primeTransitionTargetPlayback(
    trackId: string,
    targetTimeMs: number,
    expectedSwapLeadMs?: number
  ): Promise<void> {
    const normalizedTrackId = trackId.trim();
    if (!normalizedTrackId) return;
    void this.warmupTransitionTarget(normalizedTrackId);
    await this.ensureInitialized();

    const targetDeck = this.getInactiveDeck();
    const targetPlayer = this.getDeckPlayer(targetDeck);
    if (!targetPlayer) return;

    const targetTrack = await this.resolveTrackForPlayback(normalizedTrackId);
    const safeTargetTimeMs = this.clampStartMsToTrack(targetTimeMs, targetTrack.durationMs);
    const existingPrime = this.primedTransition;
    const requestedLeadMs = typeof expectedSwapLeadMs === 'number' && Number.isFinite(expectedSwapLeadMs)
      ? expectedSwapLeadMs
      : DUAL_DECK_PREROLL_MS;
    const normalizedExpectedLeadMs = Math.max(
      DUAL_DECK_PREROLL_MS,
      Math.min(
        DUAL_DECK_MAX_PREROLL_MS,
        Math.round(requestedLeadMs)
      )
    );
    if (
      existingPrime
      && existingPrime.deck === targetDeck
      && existingPrime.trackId === normalizedTrackId
      && Math.abs(existingPrime.targetTimeMs - safeTargetTimeMs) <= 250
      && Math.abs(existingPrime.expectedLeadMs - normalizedExpectedLeadMs) <= 180
    ) {
      return;
    }

    const primeStartMs = Math.max(0, safeTargetTimeMs - normalizedExpectedLeadMs);
    const primeStartSeconds = primeStartMs / 1000;
    targetPlayer.setVolume(0);
    targetPlayer.loadVideo(normalizedTrackId, true, primeStartSeconds);
    await this.recoverPlaybackStart(targetPlayer, normalizedTrackId, primeStartSeconds, true);
    this.primedTransition = {
      deck: targetDeck,
      trackId: normalizedTrackId,
      targetTimeMs: safeTargetTimeMs,
      primedAt: Date.now(),
      expectedLeadMs: normalizedExpectedLeadMs,
    };
  }

  async playTransitionTarget(
    trackId: string,
    targetTimeMs: number,
    options: TransitionPlaybackOptions = {}
  ): Promise<void> {
    this.transitionHandoffToken += 1;
    void this.warmupTransitionTarget(trackId);
    await this.ensureInitialized();
    const effectProfile = this.resolveTransitionEffectProfile(options.effectStyle);
    const sourceDeck = this.activeDeck;
    const sourcePlayer = this.getDeckPlayer(sourceDeck);
    const targetDeck = this.getInactiveDeck();
    const targetPlayer = this.getDeckPlayer(targetDeck);
    if (!sourcePlayer || !targetPlayer) {
      await this.loadTrackAtTime(trackId, targetTimeMs, {
        deck: sourceDeck,
        autoplay: true,
        makeActive: true,
        emitReason: 'manual',
      });
      return;
    }

    const targetTrack = await this.resolveTrackForPlayback(trackId);
    const safeTargetTimeMs = this.clampStartMsToTrack(targetTimeMs, targetTrack.durationMs);
    const targetStartSeconds = safeTargetTimeMs / 1000;
    const primed = this.primedTransition;
    const primedReady = Boolean(
      primed
      && primed.deck === targetDeck
      && primed.trackId === trackId
      && Math.abs(primed.targetTimeMs - safeTargetTimeMs) <= 650
    );
    if (!primedReady) {
      await this.primeTransitionTargetPlayback(trackId, safeTargetTimeMs);
    }

    const envelopePlan = this.startTransitionVolumeEnvelope(
      options.sourceLoudnessRms,
      options.targetLoudnessRms,
      effectProfile,
      options.contentHint ?? 'neutral',
      Boolean(options.silenceAwarePreDuck),
      sourcePlayer
    );
    await wait(envelopePlan?.preDuckMs ?? effectProfile.preDuckMs);
    const targetStateBeforeSwap = targetPlayer.getState();
    const isTargetAlreadyRunning = targetStateBeforeSwap.isPlaying && targetStateBeforeSwap.videoId === trackId;
    if (!isTargetAlreadyRunning) {
      targetPlayer.play();
    }
    const driftSeconds = Math.abs(targetStateBeforeSwap.currentTime - targetStartSeconds);
    if (driftSeconds > TRANSITION_SWAP_DRIFT_SEEK_THRESHOLD_SECONDS) {
      targetPlayer.seek(targetStartSeconds);
    }
    if (!isTargetAlreadyRunning) {
      void this.recoverPlaybackStart(targetPlayer, trackId, targetStartSeconds, true).catch((error) => {
        console.warn('Late transition deck recovery failed:', error);
      });
    }
    const targetStartVolume = envelopePlan?.compensatedVolume ?? this.volume;
    targetPlayer.setVolume(targetStartVolume);
    await wait(TRANSITION_AUDIO_OVERLAP_MS);
    sourcePlayer.pause();
    sourcePlayer.setVolume(0);
    this.activeDeck = targetDeck;
    this.primedTransition = null;
    this.currentTrack = targetTrack;
    this.previousSnapshot = null;
    this.lastEndedSignature = null;

    const settleMs = envelopePlan?.settleMs ?? 0;
    const releaseMs = envelopePlan?.releaseMs ?? effectProfile.releaseMs;
    const token = this.transitionVolumeAutomationToken + 1;
    this.transitionVolumeAutomationToken = token;
    void (async () => {
      if (settleMs > 0) {
        await wait(settleMs);
      }
      await this.rampPlayerVolume(targetStartVolume, this.volume, releaseMs, token, targetPlayer);
    })();

    try {
      addToRecentlyPlayed({
        videoId: trackId,
        title: targetTrack.name,
        artist: targetTrack.artist,
        thumbnail: targetTrack.albumArt ?? '',
      });
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        throw error;
      }
      if (!this.hasWarnedRecentQuota) {
        this.hasWarnedRecentQuota = true;
        console.warn('Skipping recent history writes due to storage quota.');
      }
    }
    this.emit({
      type: 'track_started',
      reason: 'manual',
      track: targetTrack,
    });
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

  private resolveTransitionEffectProfile(style?: TransitionEffectStyle): TransitionEffectProfile {
    if (!style) return { ...this.transitionEffectProfile };
    return { ...TRANSITION_EFFECT_PROFILES[style] };
  }

  configureTransitionEffectProfile(
    profile: Partial<TransitionEffectProfile> & { style?: TransitionEffectStyle }
  ): TransitionEffectProfile {
    const nextStyle = profile.style ?? this.transitionEffectProfile.style;
    const base = TRANSITION_EFFECT_PROFILES[nextStyle];
    const next: TransitionEffectProfile = {
      style: nextStyle,
      preDuckMs: Math.max(40, Math.min(260, Math.round(profile.preDuckMs ?? base.preDuckMs))),
      crossfadeMs: Math.max(180, Math.min(1300, Math.round(profile.crossfadeMs ?? base.crossfadeMs))),
      releaseMs: Math.max(480, Math.min(2400, Math.round(profile.releaseMs ?? base.releaseMs))),
      sourceDuckPercent: this.clampVolume(profile.sourceDuckPercent ?? base.sourceDuckPercent),
      targetRisePercent: this.clampVolume(profile.targetRisePercent ?? base.targetRisePercent),
    };
    this.transitionEffectProfile = next;
    return { ...next };
  }

  getTransitionEffectProfile(): TransitionEffectProfile {
    return { ...this.transitionEffectProfile };
  }

  addTrackToLibrary(track: UnifiedTrack, options: AddTrackOptions = {}): void {
    addToPlaylist({
      videoId: track.id,
      title: track.name,
      artist: track.artist,
      thumbnail: track.albumArt ?? '',
      duration: track.durationMs,
    });
    this.reloadLibrary();
    if (!options.skipAnalysis) {
      this.scheduleTransitionAnalysis(track);
    }
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
