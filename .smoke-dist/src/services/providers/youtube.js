"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubeProvider = void 0;
exports.getYouTubeProvider = getYouTubeProvider;
const player_1 = require("../youtube/player");
const search_1 = require("../youtube/search");
const transition_1 = require("../transition");
const TRANSITION_VOLUME_DUCK_PERCENT = 16;
const TRANSITION_VOLUME_STEP_MS = 120;
const TRANSITION_VOLUME_MIN = 30;
const TRANSITION_COMPENSATION_MAX_OFFSET = 18;
function wait(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
class YouTubeProvider {
    constructor() {
        this.name = 'youtube';
        this.player = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.volume = 100;
        this.currentTrack = null;
        this.library = [];
        this.listeners = new Set();
        this.previousSnapshot = null;
        this.lastEndedSignature = null;
        this.warmupPromises = new Map();
        this.transitionVolumeAutomationToken = 0;
        this.reloadLibrary();
    }
    reloadLibrary() {
        this.library = (0, search_1.getPlaylist)().map((track) => this.playlistTrackToUnified(track));
    }
    emit(event) {
        const payload = {
            ...event,
            provider: this.name,
            timestamp: Date.now(),
        };
        this.listeners.forEach((listener) => listener(payload));
    }
    onPlayerStateChange(state) {
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
            }
            else {
                this.emit({ type: 'playback_paused', track: this.currentTrack });
            }
        }
        else if (prev && !prev.isPlaying && state.isPlaying) {
            this.emit({ type: 'playback_resumed', track: this.currentTrack });
        }
        this.previousSnapshot = {
            isPlaying: state.isPlaying,
            currentTime: state.currentTime,
            duration: state.duration,
        };
    }
    async ensureInitialized() {
        if (this.isInitialized && this.player)
            return;
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
            this.player = (0, player_1.getYouTubePlayer)('youtube-player');
            await this.player.initialize();
            this.player.onStateChange((state) => this.onPlayerStateChange(state));
            this.isInitialized = true;
        })();
        try {
            await this.initPromise;
        }
        finally {
            this.initPromise = null;
        }
    }
    playlistTrackToUnified(track) {
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
    scheduleTransitionAnalysis(track) {
        void (0, transition_1.analyzeTrackWithHeuristicV1)({
            id: track.id,
            durationMs: track.durationMs,
            name: track.name,
            artist: track.artist,
        }).catch((error) => {
            console.error('Transition analysis failed:', error);
        });
    }
    clampVolume(percent) {
        if (!Number.isFinite(percent))
            return 100;
        return Math.max(0, Math.min(100, Math.round(percent)));
    }
    applyPlayerVolume(percent) {
        if (!this.player)
            return;
        this.player.setVolume(this.clampVolume(percent));
    }
    cancelTransitionVolumeAutomation(resetToBaseVolume = false) {
        this.transitionVolumeAutomationToken += 1;
        if (resetToBaseVolume) {
            this.applyPlayerVolume(this.volume);
        }
    }
    async rampPlayerVolume(fromPercent, toPercent, durationMs, automationToken) {
        if (!this.player)
            return;
        const clampedFrom = this.clampVolume(fromPercent);
        const clampedTo = this.clampVolume(toPercent);
        const steps = Math.max(1, Math.floor(Math.max(0, durationMs) / TRANSITION_VOLUME_STEP_MS));
        for (let step = 1; step <= steps; step += 1) {
            if (automationToken !== this.transitionVolumeAutomationToken)
                return;
            const ratio = step / steps;
            const volume = clampedFrom + (clampedTo - clampedFrom) * ratio;
            this.applyPlayerVolume(volume);
            if (step < steps) {
                await wait(TRANSITION_VOLUME_STEP_MS);
            }
        }
    }
    computeCompensatedVolume(sourceLoudnessRms, targetLoudnessRms) {
        if (typeof sourceLoudnessRms !== 'number'
            || !Number.isFinite(sourceLoudnessRms)
            || typeof targetLoudnessRms !== 'number'
            || !Number.isFinite(targetLoudnessRms)) {
            return this.clampVolume(this.volume);
        }
        const loudnessDiff = targetLoudnessRms - sourceLoudnessRms;
        const offset = Math.max(-TRANSITION_COMPENSATION_MAX_OFFSET, Math.min(TRANSITION_COMPENSATION_MAX_OFFSET, Math.round(-loudnessDiff * 2)));
        return this.clampVolume(this.volume + offset);
    }
    startTransitionVolumeEnvelope(sourceLoudnessRms, targetLoudnessRms) {
        if (!this.player)
            return;
        const baseVolume = this.clampVolume(this.volume);
        const duckedVolume = this.clampVolume(Math.max(TRANSITION_VOLUME_MIN, baseVolume - TRANSITION_VOLUME_DUCK_PERCENT));
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
    clampStartMsToTrack(startMs, durationMs) {
        if (!Number.isFinite(startMs) || startMs <= 0)
            return 0;
        if (!Number.isFinite(durationMs) || durationMs <= 0)
            return Math.round(startMs);
        const maxSafeStart = Math.max(0, durationMs - 1000);
        return Math.min(Math.round(startMs), maxSafeStart);
    }
    async resolveTrackForPlayback(trackId) {
        const fromLibrary = this.library.find((track) => track.id === trackId);
        if (fromLibrary)
            return fromLibrary;
        const info = await (0, search_1.getVideoInfo)(trackId);
        if (!info)
            throw new Error('Video not found');
        const track = {
            id: trackId,
            provider: 'youtube',
            name: info.title,
            artist: info.artist,
            albumArt: info.thumbnail,
            durationMs: 0,
            playCount: 0,
        };
        (0, search_1.addToPlaylist)({
            videoId: trackId,
            title: info.title,
            artist: info.artist,
            thumbnail: info.thumbnail,
        });
        this.reloadLibrary();
        this.scheduleTransitionAnalysis(track);
        return track;
    }
    async loadTrackAtTime(trackId, startTimeMs = 0) {
        await this.ensureInitialized();
        if (!this.player) {
            throw new Error('Player is not ready');
        }
        const track = await this.resolveTrackForPlayback(trackId);
        this.currentTrack = track;
        const startMs = this.clampStartMsToTrack(startTimeMs, track.durationMs);
        const startSeconds = startMs / 1000;
        this.player.loadVideo(trackId, true, startSeconds);
        (0, search_1.addToRecentlyPlayed)({
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
        return track;
    }
    isAuthenticated() {
        return true;
    }
    async authenticate() {
        await this.ensureInitialized();
    }
    logout() {
        this.cancelTransitionVolumeAutomation(false);
        this.warmupPromises.clear();
        (0, player_1.destroyYouTubePlayer)();
        this.player = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.currentTrack = null;
        this.previousSnapshot = null;
        this.lastEndedSignature = null;
    }
    async getLibrary() {
        this.reloadLibrary();
        return [...this.library];
    }
    async search(query) {
        const videoId = (0, player_1.extractVideoId)(query);
        if (!videoId)
            return [];
        const info = await (0, search_1.getVideoInfo)(videoId);
        if (!info)
            return [];
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
    async play(trackId) {
        this.cancelTransitionVolumeAutomation(true);
        await this.loadTrackAtTime(trackId, 0);
    }
    async pause() {
        this.player?.pause();
        this.emit({ type: 'playback_paused', track: this.currentTrack });
    }
    async resume() {
        this.player?.play();
        this.emit({ type: 'playback_resumed', track: this.currentTrack });
    }
    async skip() {
        if (!this.currentTrack || this.library.length === 0)
            return;
        const currentIndex = this.library.findIndex((track) => track.id === this.currentTrack?.id);
        const nextTrack = this.library[(currentIndex + 1) % this.library.length];
        if (!nextTrack)
            return;
        this.emit({ type: 'track_ended', reason: 'skip', previousTrack: this.currentTrack });
        await this.play(nextTrack.id);
    }
    async previous() {
        if (!this.currentTrack || this.library.length === 0)
            return;
        const currentIndex = this.library.findIndex((track) => track.id === this.currentTrack?.id);
        const previousIndex = currentIndex <= 0 ? this.library.length - 1 : currentIndex - 1;
        const previousTrack = this.library[previousIndex];
        if (!previousTrack)
            return;
        this.emit({ type: 'track_ended', reason: 'previous', previousTrack: this.currentTrack });
        await this.play(previousTrack.id);
    }
    async seek(positionMs) {
        this.player?.seek(positionMs / 1000);
    }
    async setVolume(percent) {
        this.cancelTransitionVolumeAutomation(false);
        this.volume = this.clampVolume(percent);
        this.applyPlayerVolume(this.volume);
    }
    async getCurrentTrack() {
        if (!this.player || !this.currentTrack)
            return null;
        const state = this.player.getState();
        if (state.videoId !== this.currentTrack.id)
            return null;
        if (state.duration > 0 && this.currentTrack.durationMs === 0) {
            this.currentTrack = { ...this.currentTrack, durationMs: state.duration * 1000 };
        }
        return this.currentTrack;
    }
    async getPlaybackState() {
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
    onPlaybackEvent(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    async warmupTransitionTarget(trackId) {
        const normalizedTrackId = trackId.trim();
        if (!normalizedTrackId)
            return;
        const inFlight = this.warmupPromises.get(normalizedTrackId);
        if (inFlight) {
            await inFlight;
            return;
        }
        const warmupPromise = (async () => {
            try {
                const info = await (0, search_1.getVideoInfo)(normalizedTrackId);
                if (!info)
                    return;
                const existingTrack = this.library.find((track) => track.id === normalizedTrackId);
                if (!existingTrack)
                    return;
                const needsRefresh = existingTrack.name.startsWith('YouTube ')
                    || existingTrack.artist === 'Unknown Artist'
                    || existingTrack.albumArt !== info.thumbnail;
                if (!needsRefresh)
                    return;
                (0, search_1.updatePlaylistTrack)(normalizedTrackId, {
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
            catch (error) {
                console.warn('Transition warmup failed:', error);
            }
        })().finally(() => {
            this.warmupPromises.delete(normalizedTrackId);
        });
        this.warmupPromises.set(normalizedTrackId, warmupPromise);
        await warmupPromise;
    }
    async playTransitionTarget(trackId, targetTimeMs, options = {}) {
        await this.warmupTransitionTarget(trackId);
        this.startTransitionVolumeEnvelope(options.sourceLoudnessRms, options.targetLoudnessRms);
        await this.loadTrackAtTime(trackId, targetTimeMs);
    }
    addTrackToLibrary(track) {
        (0, search_1.addToPlaylist)({
            videoId: track.id,
            title: track.name,
            artist: track.artist,
            thumbnail: track.albumArt ?? '',
            duration: track.durationMs,
        });
        this.reloadLibrary();
        this.scheduleTransitionAnalysis(track);
    }
    removeTrackFromLibrary(trackId) {
        (0, search_1.removeFromPlaylist)(trackId);
        this.reloadLibrary();
    }
    async addTrackFromUrl(url) {
        const videoId = (0, player_1.extractVideoId)(url);
        if (!videoId)
            return null;
        const track = {
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
        void (0, search_1.getVideoInfo)(videoId)
            .then((info) => {
            if (!info)
                return;
            (0, search_1.updatePlaylistTrack)(videoId, {
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
exports.YouTubeProvider = YouTubeProvider;
let youtubeProviderInstance = null;
function getYouTubeProvider() {
    if (!youtubeProviderInstance) {
        youtubeProviderInstance = new YouTubeProvider();
    }
    return youtubeProviderInstance;
}
