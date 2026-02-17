import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  __resetYtDlpRuntimeForTests,
  __setInvokeClientForTests,
  __setYtDlpSearchPolicyForTests,
  searchYouTube,
  setYtDlpSearchEngineOverride,
  YtDlpError,
} from '../src/services/youtube/ytdlp';
import {
  addToPlaylist,
  clearYouTubeLocalData,
  searchVideos,
} from '../src/services/youtube/search';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearYouTubeLocalData();
  (globalThis as { __MOODVERTER_ENV__?: Record<string, string | undefined> }).__MOODVERTER_ENV__ = undefined;
  __resetYtDlpRuntimeForTests();
  __setYtDlpSearchPolicyForTests({
    maxAttempts: 3,
    baseBackoffMs: 1,
    timeoutMs: 250,
  });
});

test('auto engine falls back to legacy invoke command when v1 contract is unavailable', async () => {
  const calls: string[] = [];
  __setInvokeClientForTests(async (command) => {
    calls.push(command);
    if (command === 'search_youtube_v1') {
      throw new Error('unknown command search_youtube_v1');
    }
    if (command === 'search_youtube') {
      return [{
        id: 'legacy1',
        title: 'Legacy Track',
        uploader: 'Legacy Artist',
        duration: 123,
        view_count: 42,
        thumbnail: 'https://i.ytimg.com/vi/legacy1/hqdefault.jpg',
      }];
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const results = await searchYouTube('legacy fallback', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'legacy1');
  assert.deepEqual(calls, ['search_youtube_v1', 'search_youtube']);
});

test('tauri v1 engine retries transient network failures with backoff', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');

  let attempts = 0;
  __setInvokeClientForTests(async (command) => {
    assert.equal(command, 'search_youtube_v1');
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        error: {
          code: 'YTDLP_NETWORK',
          message: 'temporary network failure',
        },
      };
    }
    return {
      ok: true,
      data: [{
        id: 'retry-ok',
        title: 'Retry Success',
        uploader: 'Retry Artist',
        duration: 200,
        view_count: 1000,
        thumbnail: null,
      }],
    };
  });

  const results = await searchYouTube('retry network', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'retry-ok');
  assert.equal(attempts, 2);
});

test('non-retryable binary errors fail fast without extra attempts', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');

  let attempts = 0;
  __setInvokeClientForTests(async () => {
    attempts += 1;
    return {
      ok: false,
      error: {
        code: 'YTDLP_BINARY_NOT_FOUND',
        message: 'yt-dlp binary not found',
      },
    };
  });

  await assert.rejects(
    () => searchYouTube('binary fail', 2),
    (error: unknown) => error instanceof YtDlpError && error.code === 'YTDLP_BINARY_NOT_FOUND'
  );
  assert.equal(attempts, 1);
});

test('searchVideos falls back to local playlist results when remote search fails', async () => {
  addToPlaylist({
    videoId: 'local-1',
    title: 'Lofi Focus Session',
    artist: 'Local Artist',
    thumbnail: 'https://i.ytimg.com/vi/local-1/hqdefault.jpg',
    duration: 180_000,
  });

  setYtDlpSearchEngineOverride('tauri-v1');
  __setInvokeClientForTests(async () => ({
    ok: false,
    error: {
      code: 'YTDLP_NETWORK',
      message: 'offline',
    },
  }));

  const results = await searchVideos('lofi', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'local-1');
  assert.equal(results[0].title, 'Lofi Focus Session');
});

test('env engine config is applied when runtime override is not set', async () => {
  (globalThis as { __MOODVERTER_ENV__?: Record<string, string | undefined> }).__MOODVERTER_ENV__ = {
    MOODVERTER_YTDLP_ENGINE: 'tauri-legacy',
  };

  const calls: string[] = [];
  __setInvokeClientForTests(async (command) => {
    calls.push(command);
    if (command === 'search_youtube') {
      return [{
        id: 'env-legacy',
        title: 'Env Legacy',
        uploader: 'Legacy Artist',
        duration: 111,
        view_count: 7,
        thumbnail: null,
      }];
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const results = await searchYouTube('env engine', 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'env-legacy');
  assert.deepEqual(calls, ['search_youtube']);
});

test('runtime engine override has higher priority than env config', async () => {
  (globalThis as { __MOODVERTER_ENV__?: Record<string, string | undefined> }).__MOODVERTER_ENV__ = {
    MOODVERTER_YTDLP_ENGINE: 'tauri-legacy',
  };
  setYtDlpSearchEngineOverride('tauri-v1');

  const calls: string[] = [];
  __setInvokeClientForTests(async (command) => {
    calls.push(command);
    if (command === 'search_youtube_v1') {
      return {
        ok: true,
        data: [{
          id: 'runtime-v1',
          title: 'Runtime Override',
          uploader: 'Override Artist',
          duration: 222,
          view_count: 9,
          thumbnail: null,
        }],
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const results = await searchYouTube('runtime override', 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].id, 'runtime-v1');
  assert.deepEqual(calls, ['search_youtube_v1']);
});
