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

const defaultFetch = globalThis.fetch;

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
  Object.defineProperty(globalThis, 'fetch', {
    value: defaultFetch,
    configurable: true,
    writable: true,
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

test('searchVideos resolves direct YouTube URL via oEmbed fallback when yt-dlp path is unavailable', async () => {
  let invokeCalls = 0;
  setYtDlpSearchEngineOverride('tauri-v1');
  __setInvokeClientForTests(async () => {
    invokeCalls += 1;
    return {
      ok: false,
      error: {
        code: 'YTDLP_NETWORK',
        message: 'offline',
      },
    };
  });

  Object.defineProperty(globalThis, 'fetch', {
    value: async () => new Response(JSON.stringify({
      title: 'Rick Astley - Never Gonna Give You Up',
      author_name: 'RickAstleyVEVO',
      thumbnail_url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    }), { status: 200 }),
    configurable: true,
    writable: true,
  });

  const results = await searchVideos('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'dQw4w9WgXcQ');
  assert.equal(results[0].title, 'Never Gonna Give You Up');
  assert.equal(results[0].artist, 'Rick Astley');
  assert.equal(invokeCalls, 0);
});

test('searchVideos uses public endpoint fallback when yt-dlp and local playlist both fail', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');
  __setInvokeClientForTests(async () => ({
    ok: false,
    error: {
      code: 'YTDLP_NETWORK',
      message: 'offline',
    },
  }));

  Object.defineProperty(globalThis, 'fetch', {
    value: async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (!url.includes('/api/v1/search')) {
        return new Response('', { status: 500 });
      }
      return new Response(JSON.stringify([
        {
          id: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          uploaderName: 'RickAstleyVEVO',
          duration: 213,
          views: 123456789,
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
          url: '/watch?v=dQw4w9WgXcQ',
        },
      ]), { status: 200 });
    },
    configurable: true,
    writable: true,
  });

  const results = await searchVideos('rick astley', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'dQw4w9WgXcQ');
  assert.equal(results[0].artist, 'RickAstleyVEVO');
});

test('searchVideos opens ytdlp circuit on binary not found and skips remote invoke on next query', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');

  let ytdlpInvokeCalls = 0;
  __setInvokeClientForTests(async (command) => {
    if (command === 'search_youtube_v1') {
      ytdlpInvokeCalls += 1;
    }
    if (command === 'search_youtube_public_v1') {
      return {
        ok: true,
        data: [{
          id: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          uploader: 'RickAstleyVEVO',
          duration: 213,
          view_count: 123456789,
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }],
      };
    }
    return {
      ok: false,
      error: {
        code: 'YTDLP_BINARY_NOT_FOUND',
        message: 'yt-dlp missing',
      },
    };
  });

  Object.defineProperty(globalThis, 'fetch', {
    value: async () => new Response(JSON.stringify([
      {
        id: 'dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up',
        uploaderName: 'RickAstleyVEVO',
        duration: 213,
        views: 123456789,
        thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        url: '/watch?v=dQw4w9WgXcQ',
      },
    ]), { status: 200 }),
    configurable: true,
    writable: true,
  });

  const first = await searchVideos('first query', 5);
  assert.equal(first.length, 1);
  assert.equal(ytdlpInvokeCalls, 1);

  const second = await searchVideos('second query', 5);
  assert.equal(second.length, 1);
  assert.equal(ytdlpInvokeCalls, 1);
});

test('searchVideos uses tauri public fallback when yt-dlp query fails', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');
  __setInvokeClientForTests(async (command) => {
    if (command === 'search_youtube_v1') {
      return {
        ok: false,
        error: {
          code: 'YTDLP_NETWORK',
          message: 'offline',
        },
      };
    }
    if (command === 'search_youtube_public_v1') {
      return {
        ok: true,
        data: [{
          id: 'dQw4w9WgXcQ',
          title: 'Rick Astley - Never Gonna Give You Up',
          uploader: 'RickAstleyVEVO',
          duration: 213,
          view_count: 123456789,
          thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        }],
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const results = await searchVideos('murat dalkilic', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, 'dQw4w9WgXcQ');
});

test('searchVideos uses tauri web fallback when yt-dlp and tauri public fallback fail', async () => {
  setYtDlpSearchEngineOverride('tauri-v1');
  __setInvokeClientForTests(async (command) => {
    if (command === 'search_youtube_v1') {
      return {
        ok: false,
        error: {
          code: 'YTDLP_UNKNOWN',
          message: 'unknown backend error',
        },
      };
    }
    if (command === 'search_youtube_public_v1') {
      return {
        ok: false,
        error: {
          code: 'YTDLP_NETWORK',
          message: 'public fallback offline',
        },
      };
    }
    if (command === 'search_youtube_web_v1') {
      return {
        ok: true,
        data: [{
          id: '3JWTaaS7LdU',
          title: 'Whitney Houston - I Will Always Love You',
          uploader: 'WhitneyHoustonVEVO',
          duration: 272,
          view_count: 100,
          thumbnail: 'https://i.ytimg.com/vi/3JWTaaS7LdU/hqdefault.jpg',
        }],
      };
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  const results = await searchVideos('whitney houston', 5);
  assert.equal(results.length, 1);
  assert.equal(results[0].videoId, '3JWTaaS7LdU');
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
