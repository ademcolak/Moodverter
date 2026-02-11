"use strict";
// YouTube IFrame Player Wrapper
// Provides a clean interface for controlling YouTube video playback
Object.defineProperty(exports, "__esModule", { value: true });
exports.YouTubePlayer = exports.PlayerState = void 0;
exports.getYouTubePlayer = getYouTubePlayer;
exports.destroyYouTubePlayer = destroyYouTubePlayer;
exports.extractVideoId = extractVideoId;
// YouTube Player states (from IFrame API)
exports.PlayerState = {
    UNSTARTED: -1,
    ENDED: 0,
    PLAYING: 1,
    PAUSED: 2,
    BUFFERING: 3,
    CUED: 5,
};
let apiLoaded = false;
let apiLoading = false;
const apiLoadPromises = [];
// Load YouTube IFrame API script
function loadYouTubeAPI() {
    return new Promise((resolve) => {
        if (apiLoaded) {
            resolve();
            return;
        }
        if (apiLoading) {
            apiLoadPromises.push(resolve);
            return;
        }
        apiLoading = true;
        // Set up callback before loading script
        window.onYouTubeIframeAPIReady = () => {
            apiLoaded = true;
            apiLoading = false;
            resolve();
            apiLoadPromises.forEach(cb => cb());
            apiLoadPromises.length = 0;
        };
        // Load the script
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.async = true;
        document.head.appendChild(script);
    });
}
class YouTubePlayer {
    constructor(containerId) {
        this.player = null;
        this.stateCallbacks = new Set();
        this.pollInterval = null;
        this.containerId = containerId;
        this.state = {
            isReady: false,
            isPlaying: false,
            videoId: null,
            currentTime: 0,
            duration: 0,
            volume: 100,
            error: null,
        };
    }
    async initialize() {
        await loadYouTubeAPI();
        return new Promise((resolve, reject) => {
            try {
                this.player = new window.YT.Player(this.containerId, {
                    height: '0',
                    width: '0',
                    playerVars: {
                        autoplay: 0,
                        controls: 0,
                        disablekb: 1,
                        enablejsapi: 1,
                        fs: 0,
                        iv_load_policy: 3,
                        modestbranding: 1,
                        playsinline: 1,
                        rel: 0,
                    },
                    events: {
                        onReady: () => {
                            this.state.isReady = true;
                            this.state.volume = this.player?.getVolume() ?? 100;
                            this.notifyStateChange();
                            this.startPolling();
                            resolve();
                        },
                        onStateChange: (event) => {
                            this.handleStateChange(event.data);
                        },
                        onError: (event) => {
                            this.handleError(event.data);
                        },
                    },
                });
            }
            catch (error) {
                reject(error);
            }
        });
    }
    handleStateChange(playerState) {
        switch (playerState) {
            case exports.PlayerState.PLAYING:
                this.state.isPlaying = true;
                break;
            case exports.PlayerState.PAUSED:
            case exports.PlayerState.ENDED:
            case exports.PlayerState.BUFFERING:
            case exports.PlayerState.CUED:
                this.state.isPlaying = false;
                break;
        }
        this.notifyStateChange();
    }
    handleError(errorCode) {
        const errorMessages = {
            2: 'Invalid video ID',
            5: 'HTML5 player error',
            100: 'Video not found or private',
            101: 'Embedding not allowed',
            150: 'Embedding not allowed',
        };
        this.state.error = errorMessages[errorCode] || `Unknown error: ${errorCode}`;
        this.notifyStateChange();
    }
    startPolling() {
        if (this.pollInterval)
            return;
        this.pollInterval = setInterval(() => {
            if (!this.player || !this.state.isReady)
                return;
            const currentTime = this.player.getCurrentTime();
            const duration = this.player.getDuration();
            if (currentTime !== this.state.currentTime || duration !== this.state.duration) {
                this.state.currentTime = currentTime;
                this.state.duration = duration;
                this.notifyStateChange();
            }
        }, 250);
    }
    stopPolling() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
    }
    notifyStateChange() {
        const stateCopy = { ...this.state };
        this.stateCallbacks.forEach(cb => cb(stateCopy));
    }
    // Public API
    onStateChange(callback) {
        this.stateCallbacks.add(callback);
        // Return unsubscribe function
        return () => {
            this.stateCallbacks.delete(callback);
        };
    }
    getState() {
        return { ...this.state };
    }
    loadVideo(videoId, autoplay = true) {
        if (!this.player || !this.state.isReady) {
            console.warn('Player not ready');
            return;
        }
        this.state.error = null;
        this.state.videoId = videoId;
        if (autoplay) {
            this.player.loadVideoById(videoId);
        }
        else {
            this.player.cueVideoById(videoId);
        }
        this.notifyStateChange();
    }
    play() {
        if (!this.player || !this.state.isReady)
            return;
        this.player.playVideo();
    }
    pause() {
        if (!this.player || !this.state.isReady)
            return;
        this.player.pauseVideo();
    }
    stop() {
        if (!this.player || !this.state.isReady)
            return;
        this.player.stopVideo();
        this.state.isPlaying = false;
        this.state.currentTime = 0;
        this.notifyStateChange();
    }
    seek(seconds) {
        if (!this.player || !this.state.isReady)
            return;
        this.player.seekTo(seconds, true);
        this.state.currentTime = seconds;
        this.notifyStateChange();
    }
    setVolume(percent) {
        if (!this.player || !this.state.isReady)
            return;
        const volume = Math.max(0, Math.min(100, percent));
        this.player.setVolume(volume);
        this.state.volume = volume;
        this.notifyStateChange();
    }
    getVolume() {
        return this.state.volume;
    }
    mute() {
        if (!this.player || !this.state.isReady)
            return;
        this.player.mute();
    }
    unmute() {
        if (!this.player || !this.state.isReady)
            return;
        this.player.unMute();
    }
    isMuted() {
        if (!this.player || !this.state.isReady)
            return false;
        return this.player.isMuted();
    }
    getCurrentTime() {
        if (!this.player || !this.state.isReady)
            return 0;
        return this.player.getCurrentTime();
    }
    getDuration() {
        if (!this.player || !this.state.isReady)
            return 0;
        return this.player.getDuration();
    }
    destroy() {
        this.stopPolling();
        if (this.player) {
            this.player.destroy();
            this.player = null;
        }
        this.state.isReady = false;
        this.stateCallbacks.clear();
    }
}
exports.YouTubePlayer = YouTubePlayer;
// Singleton instance for global use
let playerInstance = null;
function getYouTubePlayer(containerId = 'youtube-player') {
    if (!playerInstance) {
        playerInstance = new YouTubePlayer(containerId);
    }
    return playerInstance;
}
function destroyYouTubePlayer() {
    if (playerInstance) {
        playerInstance.destroy();
        playerInstance = null;
    }
}
// Utility: Extract video ID from YouTube URL
function extractVideoId(url) {
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
        /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}
