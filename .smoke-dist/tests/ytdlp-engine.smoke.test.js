"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importStar(require("node:test"));
const ytdlp_1 = require("../src/services/youtube/ytdlp");
const search_1 = require("../src/services/youtube/search");
const browser_mocks_1 = require("./helpers/browser-mocks");
const defaultFetch = globalThis.fetch;
(0, node_test_1.before)(() => {
    (0, browser_mocks_1.installBrowserMocks)();
});
(0, node_test_1.beforeEach)(() => {
    (0, browser_mocks_1.resetBrowserMocks)();
    (0, search_1.clearYouTubeLocalData)();
    globalThis.__MOODVERTER_ENV__ = undefined;
    (0, ytdlp_1.__resetYtDlpRuntimeForTests)();
    (0, ytdlp_1.__setYtDlpSearchPolicyForTests)({
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
(0, node_test_1.default)('auto engine falls back to legacy invoke command when v1 contract is unavailable', async () => {
    const calls = [];
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const results = await (0, ytdlp_1.searchYouTube)('legacy fallback', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].id, 'legacy1');
    strict_1.default.deepEqual(calls, ['search_youtube_v1', 'search_youtube']);
});
(0, node_test_1.default)('tauri v1 engine retries transient network failures with backoff', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    let attempts = 0;
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
        strict_1.default.equal(command, 'search_youtube_v1');
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
    const results = await (0, ytdlp_1.searchYouTube)('retry network', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].id, 'retry-ok');
    strict_1.default.equal(attempts, 2);
});
(0, node_test_1.default)('non-retryable binary errors fail fast without extra attempts', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    let attempts = 0;
    (0, ytdlp_1.__setInvokeClientForTests)(async () => {
        attempts += 1;
        return {
            ok: false,
            error: {
                code: 'YTDLP_BINARY_NOT_FOUND',
                message: 'yt-dlp binary not found',
            },
        };
    });
    await strict_1.default.rejects(() => (0, ytdlp_1.searchYouTube)('binary fail', 2), (error) => error instanceof ytdlp_1.YtDlpError && error.code === 'YTDLP_BINARY_NOT_FOUND');
    strict_1.default.equal(attempts, 1);
});
(0, node_test_1.default)('searchVideos falls back to local playlist results when remote search fails', async () => {
    (0, search_1.addToPlaylist)({
        videoId: 'local-1',
        title: 'Lofi Focus Session',
        artist: 'Local Artist',
        thumbnail: 'https://i.ytimg.com/vi/local-1/hqdefault.jpg',
        duration: 180000,
    });
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    (0, ytdlp_1.__setInvokeClientForTests)(async () => ({
        ok: false,
        error: {
            code: 'YTDLP_NETWORK',
            message: 'offline',
        },
    }));
    const results = await (0, search_1.searchVideos)('lofi', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].videoId, 'local-1');
    strict_1.default.equal(results[0].title, 'Lofi Focus Session');
});
(0, node_test_1.default)('searchVideos resolves direct YouTube URL via oEmbed fallback when yt-dlp path is unavailable', async () => {
    let invokeCalls = 0;
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    (0, ytdlp_1.__setInvokeClientForTests)(async () => {
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
    const results = await (0, search_1.searchVideos)('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].videoId, 'dQw4w9WgXcQ');
    strict_1.default.equal(results[0].title, 'Never Gonna Give You Up');
    strict_1.default.equal(results[0].artist, 'Rick Astley');
    strict_1.default.equal(invokeCalls, 0);
});
(0, node_test_1.default)('searchVideos uses public endpoint fallback when yt-dlp and local playlist both fail', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    (0, ytdlp_1.__setInvokeClientForTests)(async () => ({
        ok: false,
        error: {
            code: 'YTDLP_NETWORK',
            message: 'offline',
        },
    }));
    Object.defineProperty(globalThis, 'fetch', {
        value: async (input) => {
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
    const results = await (0, search_1.searchVideos)('rick astley', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].videoId, 'dQw4w9WgXcQ');
    strict_1.default.equal(results[0].artist, 'RickAstleyVEVO');
});
(0, node_test_1.default)('searchVideos opens ytdlp circuit on binary not found and skips remote invoke on next query', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    let ytdlpInvokeCalls = 0;
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const first = await (0, search_1.searchVideos)('first query', 5);
    strict_1.default.equal(first.length, 1);
    strict_1.default.equal(ytdlpInvokeCalls, 1);
    const second = await (0, search_1.searchVideos)('second query', 5);
    strict_1.default.equal(second.length, 1);
    strict_1.default.equal(ytdlpInvokeCalls, 1);
});
(0, node_test_1.default)('searchVideos uses tauri public fallback when yt-dlp query fails', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const results = await (0, search_1.searchVideos)('murat dalkilic', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].videoId, 'dQw4w9WgXcQ');
});
(0, node_test_1.default)('searchVideos uses tauri web fallback when yt-dlp and tauri public fallback fail', async () => {
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const results = await (0, search_1.searchVideos)('whitney houston', 5);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].videoId, '3JWTaaS7LdU');
});
(0, node_test_1.default)('env engine config is applied when runtime override is not set', async () => {
    globalThis.__MOODVERTER_ENV__ = {
        MOODVERTER_YTDLP_ENGINE: 'tauri-legacy',
    };
    const calls = [];
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const results = await (0, ytdlp_1.searchYouTube)('env engine', 3);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].id, 'env-legacy');
    strict_1.default.deepEqual(calls, ['search_youtube']);
});
(0, node_test_1.default)('runtime engine override has higher priority than env config', async () => {
    globalThis.__MOODVERTER_ENV__ = {
        MOODVERTER_YTDLP_ENGINE: 'tauri-legacy',
    };
    (0, ytdlp_1.setYtDlpSearchEngineOverride)('tauri-v1');
    const calls = [];
    (0, ytdlp_1.__setInvokeClientForTests)(async (command) => {
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
    const results = await (0, ytdlp_1.searchYouTube)('runtime override', 3);
    strict_1.default.equal(results.length, 1);
    strict_1.default.equal(results[0].id, 'runtime-v1');
    strict_1.default.deepEqual(calls, ['search_youtube_v1']);
});
