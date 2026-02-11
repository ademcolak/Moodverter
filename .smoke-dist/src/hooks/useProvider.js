"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useProvider = useProvider;
const react_1 = require("react");
const youtube_1 = require("../services/providers/youtube");
function useProvider() {
    const [provider, setProvider] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [playbackState, setPlaybackState] = (0, react_1.useState)(null);
    const isMountedRef = (0, react_1.useRef)(true);
    const pollIntervalRef = (0, react_1.useRef)(null);
    const refreshPlaybackState = (0, react_1.useCallback)(async (currentProvider) => {
        const state = await currentProvider.getPlaybackState();
        if (isMountedRef.current) {
            setPlaybackState(state);
        }
    }, []);
    (0, react_1.useEffect)(() => {
        const init = async () => {
            setIsLoading(true);
            setError(null);
            const youtubeProvider = (0, youtube_1.getYouTubeProvider)();
            if (isMountedRef.current) {
                setProvider(youtubeProvider);
            }
            try {
                await youtubeProvider.authenticate();
                if (!isMountedRef.current)
                    return;
                await refreshPlaybackState(youtubeProvider);
            }
            catch (err) {
                if (!isMountedRef.current)
                    return;
                console.error('Failed to initialize YouTube provider:', err);
                setError(err instanceof Error ? err.message : 'Provider initialization failed');
            }
            finally {
                if (isMountedRef.current) {
                    setIsLoading(false);
                }
            }
        };
        void init();
    }, [refreshPlaybackState]);
    (0, react_1.useEffect)(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
            }
        };
    }, []);
    (0, react_1.useEffect)(() => {
        if (!provider)
            return;
        pollIntervalRef.current = setInterval(() => {
            void refreshPlaybackState(provider);
        }, 1000);
        return () => {
            if (pollIntervalRef.current) {
                clearInterval(pollIntervalRef.current);
                pollIntervalRef.current = null;
            }
        };
    }, [provider, refreshPlaybackState]);
    const play = (0, react_1.useCallback)(async (trackId) => {
        if (!provider)
            return;
        await provider.play(trackId);
        await refreshPlaybackState(provider);
    }, [provider, refreshPlaybackState]);
    const pause = (0, react_1.useCallback)(async () => {
        if (!provider)
            return;
        await provider.pause();
        await refreshPlaybackState(provider);
    }, [provider, refreshPlaybackState]);
    const resume = (0, react_1.useCallback)(async () => {
        if (!provider)
            return;
        await provider.resume();
        await refreshPlaybackState(provider);
    }, [provider, refreshPlaybackState]);
    const skip = (0, react_1.useCallback)(async () => {
        if (!provider)
            return;
        await provider.skip();
        await refreshPlaybackState(provider);
    }, [provider, refreshPlaybackState]);
    const previous = (0, react_1.useCallback)(async () => {
        if (!provider)
            return;
        await provider.previous();
        await refreshPlaybackState(provider);
    }, [provider, refreshPlaybackState]);
    const seek = (0, react_1.useCallback)(async (positionMs) => {
        if (!provider)
            return;
        await provider.seek(positionMs);
    }, [provider]);
    return {
        provider,
        isLoading,
        error,
        playbackState,
        play,
        pause,
        resume,
        skip,
        previous,
        seek,
    };
}
