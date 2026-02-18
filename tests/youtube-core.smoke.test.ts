import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import { YouTubeProvider } from '../src/services/providers/youtube';
import { extractVideoId } from '../src/services/youtube/player';
import type { UnifiedTrack } from '../src/types/provider';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

class FakeYouTubePlayer {
  private currentVideoId: string | null = null;
  private currentTime = 0;
  private duration = 240;
  private volume = 100;
  private isPlaying = false;

  readonly loadedVideos: string[] = [];
  readonly seekCalls: number[] = [];

  loadVideo(videoId: string): void {
    this.currentVideoId = videoId;
    this.currentTime = 0;
    this.isPlaying = true;
    this.loadedVideos.push(videoId);
  }

  pause(): void {
    this.isPlaying = false;
  }

  play(): void {
    this.isPlaying = true;
  }

  seek(seconds: number): void {
    this.currentTime = seconds;
    this.seekCalls.push(seconds);
  }

  setVolume(percent: number): void {
    this.volume = percent;
  }

  onStateChange(): () => void {
    return () => undefined;
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
    return {
      isReady: true,
      isPlaying: this.isPlaying,
      videoId: this.currentVideoId,
      currentTime: this.currentTime,
      duration: this.duration,
      volume: this.volume,
      error: null,
    };
  }
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
