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
const youtube_1 = require("../src/services/providers/youtube");
const player_1 = require("../src/services/youtube/player");
const browser_mocks_1 = require("./helpers/browser-mocks");
class FakeYouTubePlayer {
    constructor() {
        this.currentVideoId = null;
        this.currentTime = 0;
        this.duration = 240;
        this.volume = 100;
        this.isPlaying = false;
        this.loadedVideos = [];
        this.seekCalls = [];
    }
    loadVideo(videoId) {
        this.currentVideoId = videoId;
        this.currentTime = 0;
        this.isPlaying = true;
        this.loadedVideos.push(videoId);
    }
    pause() {
        this.isPlaying = false;
    }
    play() {
        this.isPlaying = true;
    }
    seek(seconds) {
        this.currentTime = seconds;
        this.seekCalls.push(seconds);
    }
    setVolume(percent) {
        this.volume = percent;
    }
    onStateChange() {
        return () => undefined;
    }
    getState() {
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
(0, node_test_1.before)(() => {
    (0, browser_mocks_1.installBrowserMocks)({
        fetchImpl: async () => ({
            ok: true,
            json: async () => ({
                title: 'Demo Artist - Demo Song',
                author_name: 'Demo Artist',
                thumbnail_url: 'https://i.ytimg.com/vi/demo/hqdefault.jpg',
            }),
        }),
    });
});
(0, node_test_1.beforeEach)(() => {
    (0, browser_mocks_1.resetBrowserMocks)();
});
(0, node_test_1.default)('extractVideoId parses standard and short YouTube links', () => {
    strict_1.default.equal((0, player_1.extractVideoId)('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    strict_1.default.equal((0, player_1.extractVideoId)('https://youtu.be/dQw4w9WgXcQ?t=42'), 'dQw4w9WgXcQ');
    strict_1.default.equal((0, player_1.extractVideoId)('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    strict_1.default.equal((0, player_1.extractVideoId)('https://example.com/watch?v=invalid'), null);
});
(0, node_test_1.default)('addTrackFromUrl adds a YouTube track into local library', async () => {
    const provider = new youtube_1.YouTubeProvider();
    const added = await provider.addTrackFromUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    strict_1.default.ok(added);
    if (!added)
        throw new Error('track was not added');
    strict_1.default.equal(added.id, 'dQw4w9WgXcQ');
    const library = await provider.getLibrary();
    strict_1.default.equal(library.length, 1);
    strict_1.default.equal(library[0].id, 'dQw4w9WgXcQ');
});
(0, node_test_1.default)('core transport actions call player for play/pause/seek/next/previous', async () => {
    const provider = new youtube_1.YouTubeProvider();
    const firstTrack = {
        id: 'aaaaaaaaaaa',
        provider: 'youtube',
        name: 'Track A',
        artist: 'Artist A',
        durationMs: 180000,
        playCount: 0,
    };
    const secondTrack = {
        id: 'bbbbbbbbbbb',
        provider: 'youtube',
        name: 'Track B',
        artist: 'Artist B',
        durationMs: 200000,
        playCount: 0,
    };
    provider.addTrackToLibrary(firstTrack);
    provider.addTrackToLibrary(secondTrack);
    const fakePlayer = new FakeYouTubePlayer();
    const internals = provider;
    internals.player = fakePlayer;
    internals.isInitialized = true;
    await provider.play(firstTrack.id);
    await provider.pause();
    await provider.seek(42000);
    await provider.skip();
    await provider.previous();
    strict_1.default.deepEqual(fakePlayer.loadedVideos, [firstTrack.id, secondTrack.id, firstTrack.id]);
    strict_1.default.deepEqual(fakePlayer.seekCalls, [42]);
    const state = await provider.getPlaybackState();
    strict_1.default.equal(state?.currentTrack?.id, firstTrack.id);
});
