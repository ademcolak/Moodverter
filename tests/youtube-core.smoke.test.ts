import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import { YouTubeProvider } from '../src/services/providers/youtube';
import { extractVideoId } from '../src/services/youtube/player';
import type { UnifiedTrack } from '../src/types/provider';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

interface FakeYouTubePlayerOptions {
  autoAdvanceSeconds?: number;
  initialVideoId?: string | null;
  initialCurrentTime?: number;
  initialIsPlaying?: boolean;
  duration?: number;
  error?: string | null;
}

class FakeYouTubePlayer {
  private currentVideoId: string | null = null;
  private currentTime = 0;
  private duration = 240;
  private volume = 100;
  private isPlaying = false;
  private autoAdvanceSeconds = 0;
  private error: string | null = null;
  private readonly name: string;
  private readonly operationLog: string[];

  readonly loadedVideos: string[] = [];
  readonly seekCalls: number[] = [];

  constructor(name = 'player', operationLog: string[] = [], options: FakeYouTubePlayerOptions = {}) {
    this.name = name;
    this.operationLog = operationLog;
    this.autoAdvanceSeconds = Math.max(0, options.autoAdvanceSeconds ?? 0);
    this.currentVideoId = options.initialVideoId ?? null;
    this.currentTime = Math.max(0, options.initialCurrentTime ?? 0);
    this.isPlaying = Boolean(options.initialIsPlaying);
    this.duration = Math.max(1, options.duration ?? 240);
    this.error = options.error ?? null;
  }

  private record(operation: string): void {
    this.operationLog.push(`${this.name}:${operation}`);
  }

  loadVideo(videoId: string, autoplay = true, startSeconds = 0): void {
    this.record(`loadVideo:${videoId}:${startSeconds.toFixed(3)}`);
    this.currentVideoId = videoId;
    this.currentTime = Math.max(0, startSeconds);
    this.isPlaying = autoplay;
    this.error = null;
    this.loadedVideos.push(videoId);
  }

  cueVideo(videoId: string, startSeconds = 0): void {
    this.record(`cueVideo:${videoId}:${startSeconds.toFixed(3)}`);
    this.currentVideoId = videoId;
    this.currentTime = Math.max(0, startSeconds);
    this.isPlaying = false;
    this.error = null;
  }

  pause(): void {
    this.record('pause');
    this.isPlaying = false;
  }

  play(): void {
    this.record('play');
    this.isPlaying = true;
  }

  seek(seconds: number): void {
    this.record(`seek:${seconds.toFixed(3)}`);
    this.currentTime = seconds;
    this.seekCalls.push(seconds);
  }

  setVolume(percent: number): void {
    this.record(`setVolume:${Math.round(percent)}`);
    this.volume = percent;
  }

  onStateChange(): () => void {
    return () => undefined;
  }

  setAutoAdvanceSeconds(value: number): void {
    this.autoAdvanceSeconds = Math.max(0, value);
  }

  setError(message: string | null): void {
    this.error = message;
  }

  getState(): {
    isReady: boolean;
    isPlaying: boolean;
    videoId: string | null;
    currentTime: number;
    duration: number;
    volume: number;
    error: string | null;
  } {
    if (this.isPlaying && this.autoAdvanceSeconds > 0) {
      this.currentTime += this.autoAdvanceSeconds;
    }
    this.record(`getState:${this.currentTime.toFixed(3)}`);
    return {
      isReady: true,
      isPlaying: this.isPlaying,
      videoId: this.currentVideoId,
      currentTime: this.currentTime,
      duration: this.duration,
      volume: this.volume,
      error: this.error,
    };
  }
}

function mountProviderWithDeckPlayers(
  provider: YouTubeProvider,
  sourcePlayer: FakeYouTubePlayer,
  targetPlayer: FakeYouTubePlayer,
  sourceTrack: UnifiedTrack
): void {
  const internals = provider as unknown as {
    player: FakeYouTubePlayer;
    secondaryPlayer: FakeYouTubePlayer;
    isInitialized: boolean;
    activeDeck: 'primary' | 'secondary';
    currentTrack: UnifiedTrack | null;
  };
  internals.player = sourcePlayer;
  internals.secondaryPlayer = targetPlayer;
  internals.isInitialized = true;
  internals.activeDeck = 'primary';
  internals.currentTrack = sourceTrack;
}

function parseDeckStateSamples(log: string[], deck: string): number[] {
  return log
    .filter((entry) => entry.startsWith(`${deck}:getState:`))
    .map((entry) => Number(entry.split(':')[2]))
    .filter((value) => Number.isFinite(value));
}

before(() => {
  installBrowserMocks({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        title: 'Demo Artist - Demo Song',
        author_name: 'Demo Artist',
        thumbnail_url: 'https://i.ytimg.com/vi/demo/hqdefault.jpg',
      }),
    }) as Response,
  });
});

beforeEach(() => {
  resetBrowserMocks();
});

test('extractVideoId parses standard and short YouTube links', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractVideoId('https://example.com/watch?v=invalid'), null);
});

test('addTrackFromUrl adds a YouTube track into local library', async () => {
  const provider = new YouTubeProvider();
  const added = await provider.addTrackFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  assert.ok(added);
  if (!added) throw new Error('track was not added');
  assert.equal(added.id, 'dQw4w9WgXcQ');

  const library = await provider.getLibrary();
  assert.equal(library.length, 1);
  assert.equal(library[0].id, 'dQw4w9WgXcQ');
});

test('core transport actions call player for play/pause/seek/next/previous', async () => {
  const provider = new YouTubeProvider();
  const firstTrack: UnifiedTrack = {
    id: 'aaaaaaaaaaa',
    provider: 'youtube',
    name: 'Track A',
    artist: 'Artist A',
    durationMs: 180_000,
    playCount: 0,
  };
  const secondTrack: UnifiedTrack = {
    id: 'bbbbbbbbbbb',
    provider: 'youtube',
    name: 'Track B',
    artist: 'Artist B',
    durationMs: 200_000,
    playCount: 0,
  };

  provider.addTrackToLibrary(firstTrack);
  provider.addTrackToLibrary(secondTrack);

  const fakePlayer = new FakeYouTubePlayer();
  const internals = provider as unknown as {
    player: FakeYouTubePlayer;
    isInitialized: boolean;
  };
  internals.player = fakePlayer;
  internals.isInitialized = true;

  await provider.play(firstTrack.id);
  await provider.pause();
  await provider.seek(42_000);
  await provider.skip();
  await provider.previous();

  assert.deepEqual(fakePlayer.loadedVideos, [firstTrack.id, secondTrack.id, firstTrack.id]);
  assert.deepEqual(fakePlayer.seekCalls, [42]);

  const state = await provider.getPlaybackState();
  assert.equal(state?.currentTrack?.id, firstTrack.id);
});

test('playTransitionTarget waits for audible target before pausing source', async () => {
  const provider = new YouTubeProvider();
  const sourceTrack: UnifiedTrack = {
    id: 'source-track',
    provider: 'youtube',
    name: 'Source Track',
    artist: 'Artist S',
    durationMs: 190_000,
    playCount: 0,
  };
  const targetTrack: UnifiedTrack = {
    id: 'target-track',
    provider: 'youtube',
    name: 'Target Track',
    artist: 'Artist T',
    durationMs: 210_000,
    playCount: 0,
  };
  provider.addTrackToLibrary(sourceTrack);
  provider.addTrackToLibrary(targetTrack);

  const operationLog: string[] = [];
  const sourcePlayer = new FakeYouTubePlayer('source', operationLog, {
    initialVideoId: sourceTrack.id,
    initialCurrentTime: 46,
    initialIsPlaying: true,
  });
  const targetPlayer = new FakeYouTubePlayer('target', operationLog, {
    autoAdvanceSeconds: 0.03,
  });
  mountProviderWithDeckPlayers(provider, sourcePlayer, targetPlayer, sourceTrack);

  const playbackResult = await provider.playTransitionTarget(targetTrack.id, 52_000);
  assert.equal(typeof playbackResult.audibleReadyWaitMs, 'number');
  assert.ok((playbackResult.audibleReadyWaitMs ?? 0) >= 0);
  assert.equal(typeof playbackResult.recoverPlaybackWaitMs, 'number');
  assert.equal(typeof playbackResult.overlapAppliedMs, 'number');
  assert.ok((playbackResult.overlapAppliedMs ?? 0) >= 140);
  assert.ok((playbackResult.overlapAppliedMs ?? 0) <= 320);

  const sourcePauseIndex = operationLog.findIndex((entry) => entry === 'source:pause');
  assert.ok(sourcePauseIndex >= 0, 'source should pause after swap commit');
  const targetAudibleVolumeIndex = operationLog.findIndex((entry) => {
    if (!entry.startsWith('target:setVolume:')) return false;
    const value = Number(entry.split(':')[2]);
    return Number.isFinite(value) && value > 0;
  });
  assert.ok(targetAudibleVolumeIndex >= 0, 'target should become audible');
  assert.ok(
    targetAudibleVolumeIndex < sourcePauseIndex,
    'source pause must happen after target becomes audible'
  );

  const targetSamples = parseDeckStateSamples(operationLog.slice(0, sourcePauseIndex), 'target');
  assert.ok(targetSamples.length >= 2, 'target readiness should collect multiple state samples');
  const audibleAdvance = Math.max(...targetSamples) - Math.min(...targetSamples);
  assert.ok(
    audibleAdvance >= 0.05,
    `expected target time advance >= 0.05s before source pause, got ${audibleAdvance.toFixed(3)}`
  );
});

test('playTransitionTarget keeps source playing if target audible readiness times out', async () => {
  const provider = new YouTubeProvider();
  const sourceTrack: UnifiedTrack = {
    id: 'source-timeout',
    provider: 'youtube',
    name: 'Source Timeout',
    artist: 'Artist S',
    durationMs: 190_000,
    playCount: 0,
  };
  const targetTrack: UnifiedTrack = {
    id: 'target-timeout',
    provider: 'youtube',
    name: 'Target Timeout',
    artist: 'Artist T',
    durationMs: 210_000,
    playCount: 0,
  };
  provider.addTrackToLibrary(sourceTrack);
  provider.addTrackToLibrary(targetTrack);

  const operationLog: string[] = [];
  const sourcePlayer = new FakeYouTubePlayer('source', operationLog, {
    initialVideoId: sourceTrack.id,
    initialCurrentTime: 48,
    initialIsPlaying: true,
  });
  const targetPlayer = new FakeYouTubePlayer('target', operationLog, {
    autoAdvanceSeconds: 0,
  });
  mountProviderWithDeckPlayers(provider, sourcePlayer, targetPlayer, sourceTrack);

  await assert.rejects(
    () => provider.playTransitionTarget(targetTrack.id, 52_000),
    /audible readiness timeout/i
  );

  assert.equal(operationLog.includes('source:pause'), false, 'source should stay playing on timeout');
  assert.equal(operationLog.includes('target:pause'), true, 'target should be paused on timeout');
  assert.equal(operationLog.includes('target:setVolume:0'), true, 'target should be muted on timeout');
  assert.equal(operationLog.includes('source:setVolume:100'), true, 'source should recover base volume');
});

test('playTransitionTarget uses source fade-out before pause', async () => {
  const provider = new YouTubeProvider();
  const sourceTrack: UnifiedTrack = {
    id: 'source-fade',
    provider: 'youtube',
    name: 'Source Fade',
    artist: 'Artist S',
    durationMs: 190_000,
    playCount: 0,
  };
  const targetTrack: UnifiedTrack = {
    id: 'target-fade',
    provider: 'youtube',
    name: 'Target Fade',
    artist: 'Artist T',
    durationMs: 210_000,
    playCount: 0,
  };
  provider.addTrackToLibrary(sourceTrack);
  provider.addTrackToLibrary(targetTrack);

  const operationLog: string[] = [];
  const sourcePlayer = new FakeYouTubePlayer('source', operationLog, {
    initialVideoId: sourceTrack.id,
    initialCurrentTime: 50,
    initialIsPlaying: true,
  });
  const targetPlayer = new FakeYouTubePlayer('target', operationLog, {
    autoAdvanceSeconds: 0.04,
  });
  mountProviderWithDeckPlayers(provider, sourcePlayer, targetPlayer, sourceTrack);

  const playbackResult = await provider.playTransitionTarget(targetTrack.id, 54_000);
  assert.equal(typeof playbackResult.audibleReadyWaitMs, 'number');
  assert.equal(typeof playbackResult.sourceFadeOutMs, 'number');
  assert.ok((playbackResult.sourceFadeOutMs ?? 0) >= 100);

  const sourcePauseIndex = operationLog.findIndex((entry) => entry === 'source:pause');
  assert.ok(sourcePauseIndex >= 0, 'source should pause after fade');
  const sourceVolumesBeforePause = operationLog
    .slice(0, sourcePauseIndex)
    .filter((entry) => entry.startsWith('source:setVolume:'))
    .map((entry) => Number(entry.split(':')[2]))
    .filter((value) => Number.isFinite(value));

  assert.ok(sourceVolumesBeforePause.length >= 3, 'expected multiple volume steps before pause');
  assert.equal(sourceVolumesBeforePause[sourceVolumesBeforePause.length - 1], 0);
  assert.ok(
    sourceVolumesBeforePause.some((value) => value > 0 && value < 50),
    'expected intermediate fade-out volume below 50%'
  );
});

test('playTransitionTarget adapts overlap and fade under slower target readiness', async () => {
  const provider = new YouTubeProvider();
  const sourceTrack: UnifiedTrack = {
    id: 'source-adaptive',
    provider: 'youtube',
    name: 'Source Adaptive',
    artist: 'Artist S',
    durationMs: 190_000,
    playCount: 0,
  };
  const firstTargetTrack: UnifiedTrack = {
    id: 'target-adaptive-fast',
    provider: 'youtube',
    name: 'Target Adaptive Fast',
    artist: 'Artist T',
    durationMs: 210_000,
    playCount: 0,
  };
  const secondTargetTrack: UnifiedTrack = {
    id: 'target-adaptive-slow',
    provider: 'youtube',
    name: 'Target Adaptive Slow',
    artist: 'Artist U',
    durationMs: 205_000,
    playCount: 0,
  };
  provider.addTrackToLibrary(sourceTrack);
  provider.addTrackToLibrary(firstTargetTrack);
  provider.addTrackToLibrary(secondTargetTrack);

  const operationLog: string[] = [];
  const sourcePlayer = new FakeYouTubePlayer('source', operationLog, {
    initialVideoId: sourceTrack.id,
    initialCurrentTime: 44,
    initialIsPlaying: true,
  });
  const targetPlayer = new FakeYouTubePlayer('target', operationLog, {
    autoAdvanceSeconds: 0.045,
  });
  mountProviderWithDeckPlayers(provider, sourcePlayer, targetPlayer, sourceTrack);

  const firstResult = await provider.playTransitionTarget(firstTargetTrack.id, 49_000);
  sourcePlayer.setAutoAdvanceSeconds(0.01);
  const secondResult = await provider.playTransitionTarget(secondTargetTrack.id, 57_000);

  assert.equal(typeof firstResult.overlapAppliedMs, 'number');
  assert.equal(typeof secondResult.overlapAppliedMs, 'number');
  assert.equal(typeof firstResult.sourceFadeOutMs, 'number');
  assert.equal(typeof secondResult.sourceFadeOutMs, 'number');
  assert.ok(
    (secondResult.overlapAppliedMs ?? 0) >= (firstResult.overlapAppliedMs ?? 0),
    `expected overlap to increase or stay after slower readiness: ${firstResult.overlapAppliedMs} -> ${secondResult.overlapAppliedMs}`
  );
  assert.ok(
    (secondResult.sourceFadeOutMs ?? 0) >= (firstResult.sourceFadeOutMs ?? 0),
    `expected fade-out to increase or stay after slower readiness: ${firstResult.sourceFadeOutMs} -> ${secondResult.sourceFadeOutMs}`
  );
});
