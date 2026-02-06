import { useState, useCallback, useEffect, useRef } from 'react';
import {
  MoodInput,
  NowPlaying,
  Settings,
  LibrarySync,
  LibrarySearch,
  Recommendations,
  DiscoverySuggestions,
  KeyboardHelp,
  QueuePanel,
  HistoryPanel,
} from './components';
import { useSpotify, usePlayback, useMood, useProvider, useKeyboardShortcuts, TrackChangeEvent } from './hooks';
import { Track } from './types/track';
import { MoodParameters } from './types/mood';
import type { DiscoverySettings } from './types/discovery';
import { DEFAULT_DISCOVERY_SETTINGS } from './types/discovery';
import type { ProviderType, UnifiedTrack } from './types/provider';
import type { HistoryEntry, DecisionSource } from './types/history';
import type { QueueItem } from './types/queue';
import { getAudioFeatures } from './services/spotify/api';
import { addToQueue as addToSpotifyQueue } from './services/spotify/playback';
import { getCacheStats } from './services/db/cache';
import { MOCK_TRACKS } from './services/mock/data';
import { legacyTrackToUnified, unifiedToLegacyTrack } from './services/providers';
import { legacyToMoodParams } from './services/mood/engine';
import { recordListen, recordSkip } from './services/memory/preferences';
import { searchResultToUnifiedTrack, type YouTubeSearchResult } from './services/youtube/search';
import { getYouTubeProvider } from './services/providers/youtube';
import { discoverNextTrack, discoverSuggestions } from './services/discovery';
import { createQueueManager, getInitialQueueState } from './services/queue';
import { addToHistory, getHistory, clearHistory } from './services/history';

const DISCOVERY_SETTINGS_STORAGE_KEY = 'moodverter_discovery_settings';
const DISCOVERY_BLOCKLIST_STORAGE_KEY = 'moodverter_discovery_blocklist';
const ALGORITHM_VERSION = 'phase4-v1';

type TrackSource = 'library' | 'youtube';
type SidePanelState = 'none' | 'queue' | 'history';

function loadDiscoverySettings(): DiscoverySettings {
  try {
    const stored = localStorage.getItem(DISCOVERY_SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_DISCOVERY_SETTINGS;

    const parsed = JSON.parse(stored) as Partial<DiscoverySettings>;
    return {
      ...DEFAULT_DISCOVERY_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_DISCOVERY_SETTINGS;
  }
}

function toHistorySource(source: TrackSource): 'library' | 'discovery' {
  return source === 'youtube' ? 'discovery' : 'library';
}

function loadDiscoveryBlockedTrackIds(): string[] {
  try {
    const stored = localStorage.getItem(DISCOVERY_BLOCKLIST_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function App() {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState({
    openToNewSongs: true,
    spotifyConnected: false,
    openAiApiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
    provider: (localStorage.getItem('moodverter_provider') as ProviderType) || 'mock',
    discovery: loadDiscoverySettings(),
  });

  const [needsLibrarySync, setNeedsLibrarySync] = useState<boolean | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);

  const [discoverySuggestionsList, setDiscoverySuggestionsList] = useState<UnifiedTrack[]>([]);
  const [showDiscoverySuggestions, setShowDiscoverySuggestions] = useState(false);
  const [isDiscoveryLoading, setIsDiscoveryLoading] = useState(false);
  const [discoveryAutoplayCountdownSec, setDiscoveryAutoplayCountdownSec] = useState<number | null>(null);
  const discoveryAutoplayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [blockedDiscoveryTrackIds, setBlockedDiscoveryTrackIds] = useState<string[]>(() => loadDiscoveryBlockedTrackIds());
  const processedPlaybackEventRef = useRef<string | null>(null);

  const queueManagerRef = useRef(createQueueManager(getInitialQueueState()));
  const [queueState, setQueueState] = useState(queueManagerRef.current.getState());
  const [sidePanel, setSidePanel] = useState<SidePanelState>('none');
  const [queueCollapsed, setQueueCollapsed] = useState(false);

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>(() => getHistory());

  const [trackSourceMap, setTrackSourceMap] = useState<Record<string, TrackSource>>({});
  const [trackDecisionSourceMap, setTrackDecisionSourceMap] = useState<Record<string, DecisionSource>>({});

  const {
    provider,
    isAuthenticated: providerAuthenticated,
    isLoading: providerLoading,
    availableProviders,
    login: providerLogin,
    switchProvider,
    playbackState: providerPlaybackState,
    lastPlaybackEvent,
    pause: providerPause,
    resume: providerResume,
    skip: providerSkip,
    previous: providerPrevious,
    seek: providerSeek,
  } = useProvider(settings.provider);

  const { isAuthenticated, isLoading: authLoading, tokens, login, logout, isMockMode } = useSpotify();
  const accessToken = tokens?.access_token || null;

  const { moodState, processMood, setMoodParameters, engineStatus } = useMood(settings.openAiApiKey || null);
  const currentMoodInput = moodState.history.inputs[moodState.history.inputs.length - 1]?.text;

  const effectiveAuthenticated = settings.provider === 'spotify' ? isAuthenticated : providerAuthenticated;
  const effectiveLoading = settings.provider === 'spotify' ? authLoading : providerLoading;
  const effectiveLogin = settings.provider === 'spotify' ? login : providerLogin;

  const [recentTracks, setRecentTracks] = useState<Track[]>([]);
  const playTrackRef = useRef<(uri: string) => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    localStorage.setItem(DISCOVERY_SETTINGS_STORAGE_KEY, JSON.stringify(settings.discovery));
  }, [settings.discovery]);

  useEffect(() => {
    localStorage.setItem(DISCOVERY_BLOCKLIST_STORAGE_KEY, JSON.stringify(blockedDiscoveryTrackIds));
  }, [blockedDiscoveryTrackIds]);

  const clearDiscoveryAutoplayTimer = useCallback(() => {
    if (discoveryAutoplayTimerRef.current) {
      clearInterval(discoveryAutoplayTimerRef.current);
      discoveryAutoplayTimerRef.current = null;
    }
    setDiscoveryAutoplayCountdownSec(null);
  }, []);

  useEffect(() => {
    return () => {
      clearDiscoveryAutoplayTimer();
    };
  }, [clearDiscoveryAutoplayTimer]);

  const refreshQueueState = useCallback(() => {
    setQueueState(queueManagerRef.current.getState());
  }, []);

  const refreshYouTubeLibrary = useCallback(async () => {
    if (!provider || settings.provider !== 'youtube') return;
    try {
      const library = await provider.getLibrary();
      const legacyLibrary = library.map(track => unifiedToLegacyTrack(track));
      setLibraryTracks(legacyLibrary);
    } catch (error) {
      console.error('Failed to load YouTube library:', error);
    }
  }, [provider, settings.provider]);

  const playUnifiedTrack = useCallback(async (
    track: UnifiedTrack,
    source: TrackSource,
    decisionSource: DecisionSource = 'manual'
  ) => {
    setTrackSourceMap(prev => ({ ...prev, [track.id]: source }));
    setTrackDecisionSourceMap(prev => ({ ...prev, [track.id]: decisionSource }));

    if (settings.provider === 'spotify' || settings.provider === 'mock') {
      await playTrackRef.current(`spotify:track:${track.id}`);
      return;
    }

    if (provider) {
      await provider.play(track.id);
    }
  }, [provider, settings.provider]);

  const buildDiscoveryContext = useCallback(() => {
    const recentYouTubeTrackIds = historyEntries
      .filter(entry => entry.source === 'discovery')
      .slice(0, 20)
      .map(entry => entry.track.id);

    const recentArtists = historyEntries
      .slice(0, 30)
      .map(entry => entry.track.artist);

    return {
      blockedTrackIds: blockedDiscoveryTrackIds,
      recentYouTubeTrackIds,
      recentArtists,
    };
  }, [blockedDiscoveryTrackIds, historyEntries]);

  const dismissDiscoverySuggestions = useCallback(() => {
    clearDiscoveryAutoplayTimer();
    setShowDiscoverySuggestions(false);
  }, [clearDiscoveryAutoplayTimer]);

  const openDiscoverySuggestions = useCallback((
    suggestions: UnifiedTrack[],
    enableAutoplayFallback: boolean
  ) => {
    clearDiscoveryAutoplayTimer();
    setDiscoverySuggestionsList(suggestions);
    setShowDiscoverySuggestions(true);

    const shouldFallback = enableAutoplayFallback &&
      settings.discovery.suggestBehavior === 'show_with_autoplay_fallback' &&
      suggestions.length > 0;

    if (!shouldFallback) {
      setDiscoveryAutoplayCountdownSec(null);
      return;
    }

    let remaining = Math.max(3, settings.discovery.suggestAutoplayDelaySec);
    setDiscoveryAutoplayCountdownSec(remaining);

    discoveryAutoplayTimerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearDiscoveryAutoplayTimer();
        setShowDiscoverySuggestions(false);
        void playUnifiedTrack(suggestions[0], 'youtube', 'discovery_suggest');
        return;
      }
      setDiscoveryAutoplayCountdownSec(remaining);
    }, 1000);
  }, [
    clearDiscoveryAutoplayTimer,
    playUnifiedTrack,
    settings.discovery.suggestAutoplayDelaySec,
    settings.discovery.suggestBehavior,
  ]);

  const recordTrackCompletion = useCallback((
    previousTrack: Track | null,
    previousProgressMs: number,
    previousDurationMs: number,
    eventType: TrackChangeEvent['type'] | 'natural' | 'skip' | 'previous' | 'manual' | 'error'
  ) => {
    if (!previousTrack || previousDurationMs <= 0) return;

    const listenPercent = Math.min(1, Math.max(0, previousProgressMs / previousDurationMs));
    const previousSource = trackSourceMap[previousTrack.spotifyId] ?? 'library';
    const decisionSource = trackDecisionSourceMap[previousTrack.spotifyId] ??
      (previousSource === 'youtube' ? 'discovery_auto' : 'library_selector');

    addToHistory({
      track: legacyTrackToUnified(previousTrack, settings.provider),
      listenDuration: previousProgressMs,
      completedPercent: listenPercent * 100,
      mood: currentMoodInput,
      source: toHistorySource(previousSource),
      decisionSource,
      algorithmVersion: ALGORITHM_VERSION,
    });
    setHistoryEntries(getHistory());

    if (eventType === 'natural' || listenPercent >= 0.8) {
      recordListen(
        previousTrack.spotifyId,
        previousTrack.artist,
        [],
        listenPercent,
        {
          energy: previousTrack.energy,
          valence: previousTrack.valence,
          tempo: previousTrack.tempo,
        }
      );
      setRecentTracks(prev => [...prev.slice(-19), previousTrack]);
      return;
    }

    if (eventType !== 'app_initiated') {
      recordSkip(
        previousTrack.spotifyId,
        previousTrack.artist,
        [],
        listenPercent
      );
    }
  }, [
    currentMoodInput,
    settings.provider,
    trackDecisionSourceMap,
    trackSourceMap,
  ]);

  const handleNaturalTrackEnd = useCallback(async (
    previousTrack: Track | null,
    previousUnifiedTrack: UnifiedTrack | null
  ) => {
    const queued = queueManagerRef.current.getNext();
    if (queued) {
      refreshQueueState();
      await playUnifiedTrack(
        queued.track,
        queued.source === 'discovery' ? 'youtube' : 'library',
        'queue'
      );
      return;
    }

    if (settings.provider === 'youtube' && moodState.current) {
      const discoveryContext = buildDiscoveryContext();
      const unifiedLibrary = libraryTracks.map(track => legacyTrackToUnified(track, settings.provider));

      try {
        setIsDiscoveryLoading(true);
        const result = await discoverNextTrack(
          unifiedLibrary,
          moodState.current,
          previousUnifiedTrack,
          settings.discovery,
          discoveryContext
        );

        if (result) {
          if (settings.discovery.mode === 'suggest' && result.source === 'youtube') {
            const suggestions = await discoverSuggestions(
              unifiedLibrary,
              moodState.current,
              previousUnifiedTrack,
              settings.discovery,
              settings.discovery.maxSuggestionsPerCycle,
              discoveryContext
            );
            const resolvedSuggestions = suggestions.length > 0 ? suggestions : [result.track];
            openDiscoverySuggestions(resolvedSuggestions, true);
          } else {
            await playUnifiedTrack(
              result.track,
              result.source === 'youtube' ? 'youtube' : 'library',
              result.source === 'youtube' ? 'discovery_auto' : 'library_selector'
            );

            if (settings.discovery.autoAddToLibrary && result.source === 'youtube') {
              const youtubeProvider = getYouTubeProvider();
              youtubeProvider.addTrackToLibrary(result.track);
              await refreshYouTubeLibrary();
            }
          }
          return;
        }
      } catch (err) {
        console.error('Discovery auto-play failed:', err);
      } finally {
        setIsDiscoveryLoading(false);
      }
    }

    if (libraryTracks.length > 0) {
      try {
        const { selectNextTrack } = await import('./services/navigator/selector');
        const currentMood = moodState.current || {
          energy: previousTrack?.energy ?? 0.5,
          valence: previousTrack?.valence ?? 0.5,
          danceability: previousTrack?.danceability ?? 0.5,
          acousticness: previousTrack?.acousticness ?? 0.5,
          tempo_min: Math.max(60, (previousTrack?.tempo ?? 120) - 20),
          tempo_max: Math.min(200, (previousTrack?.tempo ?? 120) + 20),
        };

        const selection = selectNextTrack(libraryTracks, {
          moodParams: currentMood,
          currentTrack: previousTrack,
          recentTracks,
          includeRecommendations: settings.openToNewSongs,
        });

        if (selection) {
          await playUnifiedTrack(
            legacyTrackToUnified(selection.track, settings.provider),
            'library',
            'library_fallback'
          );
        }
      } catch (err) {
        console.error('Failed to auto-play next track:', err);
      }
    }
  }, [
    buildDiscoveryContext,
    libraryTracks,
    moodState,
    openDiscoverySuggestions,
    playUnifiedTrack,
    recentTracks,
    refreshQueueState,
    refreshYouTubeLibrary,
    settings.discovery,
    settings.openToNewSongs,
    settings.provider,
  ]);

  const handleTrackChange = useCallback(async (event: TrackChangeEvent) => {
    if (settings.provider === 'youtube') return;

    recordTrackCompletion(
      event.previousTrack,
      event.previousProgressMs,
      event.previousDurationMs,
      event.type
    );

    if (event.type === 'natural') {
      await handleNaturalTrackEnd(
        event.previousTrack,
        event.previousTrack ? legacyTrackToUnified(event.previousTrack, settings.provider) : null
      );
      return;
    }

    if (event.type === 'app_initiated') return;

    try {
      setIsAnalyzingAudio(true);
      let trackWithFeatures: Track;

      if (isMockMode || settings.provider === 'mock') {
        trackWithFeatures = event.newTrack;
      } else {
        if (!accessToken) return;
        const features = await getAudioFeatures(accessToken, event.newTrack.spotifyId);
        trackWithFeatures = {
          ...event.newTrack,
          energy: features.energy,
          valence: features.valence,
          tempo: features.tempo,
          danceability: features.danceability,
          acousticness: features.acousticness,
          instrumentalness: features.instrumentalness,
          key: features.key,
          mode: features.mode,
        };
      }

      if (event.type === 'manual' || event.type === 'skip' || event.type === 'previous') {
        const newMoodParams: MoodParameters = {
          energy: trackWithFeatures.energy,
          valence: trackWithFeatures.valence,
          danceability: trackWithFeatures.danceability,
          acousticness: trackWithFeatures.acousticness,
          tempo_min: Math.max(60, trackWithFeatures.tempo - 20),
          tempo_max: Math.min(200, trackWithFeatures.tempo + 20),
        };
        setMoodParameters(newMoodParams, 'keyword');
      }
    } catch (err) {
      console.error('Failed to handle track change:', err);
    } finally {
      setIsAnalyzingAudio(false);
    }
  }, [
    accessToken,
    handleNaturalTrackEnd,
    isMockMode,
    recordTrackCompletion,
    setMoodParameters,
    settings.provider,
  ]);

  const {
    isPlaying,
    currentTrack,
    progress,
    duration,
    play,
    pause,
    skipNext,
    skipPrevious,
    seek,
    playTrack,
  } = usePlayback(accessToken, { onTrackChange: handleTrackChange });

  useEffect(() => {
    playTrackRef.current = playTrack;
  }, [playTrack]);

  useEffect(() => {
    if (settings.provider !== 'youtube' || !lastPlaybackEvent) return;

    const eventTrack = lastPlaybackEvent.previousTrack ?? lastPlaybackEvent.track ?? null;
    const eventKey = [
      lastPlaybackEvent.type,
      lastPlaybackEvent.reason ?? 'none',
      eventTrack?.id ?? 'none',
      lastPlaybackEvent.timestamp,
    ].join(':');

    if (processedPlaybackEventRef.current === eventKey) return;
    processedPlaybackEventRef.current = eventKey;

    if (lastPlaybackEvent.type !== 'track_ended') return;

    const previousTrack = eventTrack ? unifiedToLegacyTrack(eventTrack) : null;
    const previousProgressMs = lastPlaybackEvent.progressMs ?? previousTrack?.durationMs ?? 0;
    const previousDurationMs = lastPlaybackEvent.durationMs ?? previousTrack?.durationMs ?? 0;
    const reason = lastPlaybackEvent.reason ?? 'manual';

    recordTrackCompletion(previousTrack, previousProgressMs, previousDurationMs, reason);

    if (reason === 'natural') {
      void handleNaturalTrackEnd(previousTrack, eventTrack);
    }
  }, [
    handleNaturalTrackEnd,
    lastPlaybackEvent,
    recordTrackCompletion,
    settings.provider,
  ]);

  const useProviderPlayback = settings.provider === 'youtube';

  const effectiveCurrentTrack = useProviderPlayback
    ? (providerPlaybackState?.currentTrack
      ? unifiedToLegacyTrack(providerPlaybackState.currentTrack)
      : null)
    : currentTrack;

  const effectiveIsPlaying = useProviderPlayback
    ? (providerPlaybackState?.isPlaying ?? false)
    : isPlaying;

  const effectiveProgress = useProviderPlayback
    ? (providerPlaybackState?.progressMs ?? 0)
    : progress;

  const effectiveDuration = useProviderPlayback
    ? (providerPlaybackState?.durationMs ?? 0)
    : duration;

  const effectivePlay = useProviderPlayback ? providerResume : play;
  const effectivePause = useProviderPlayback ? providerPause : pause;
  const effectiveSkipNext = useProviderPlayback ? providerSkip : skipNext;
  const effectiveSkipPrevious = useProviderPlayback ? providerPrevious : skipPrevious;
  const effectiveSeek = useProviderPlayback ? providerSeek : seek;

  const unifiedLibrary = libraryTracks.map(track =>
    legacyTrackToUnified(track, settings.provider)
  );

  const resolvedCurrentTrack = useProviderPlayback
    ? effectiveCurrentTrack
    : (effectiveCurrentTrack
      ? (libraryTracks.find(t => t.spotifyId === effectiveCurrentTrack.spotifyId) ?? effectiveCurrentTrack)
      : null);

  const unifiedCurrentTrack = useProviderPlayback
    ? (providerPlaybackState?.currentTrack ?? null)
    : (resolvedCurrentTrack ? legacyTrackToUnified(resolvedCurrentTrack, settings.provider) : null);

  const moodParamsForRecommendations = moodState.current
    ? legacyToMoodParams(moodState.current)
    : null;

  const handleMoodSubmit = useCallback(async (mood: string) => {
    const params = await processMood(mood);
    if (!params) return;

    dismissDiscoverySuggestions();

    if (settings.provider === 'youtube') {
      try {
        setIsDiscoveryLoading(true);
        const discoveryContext = buildDiscoveryContext();
        const result = await discoverNextTrack(
          unifiedLibrary,
          params,
          unifiedCurrentTrack,
          settings.discovery,
          discoveryContext
        );

        if (result) {
          if (settings.discovery.mode === 'suggest' && result.source === 'youtube') {
            const suggestions = await discoverSuggestions(
              unifiedLibrary,
              params,
              unifiedCurrentTrack,
              settings.discovery,
              settings.discovery.maxSuggestionsPerCycle,
              discoveryContext
            );
            openDiscoverySuggestions(
              suggestions.length > 0 ? suggestions : [result.track],
              !effectiveIsPlaying
            );
          } else {
            await playUnifiedTrack(
              result.track,
              result.source === 'youtube' ? 'youtube' : 'library',
              result.source === 'youtube' ? 'discovery_auto' : 'library_selector'
            );

            if (settings.discovery.autoAddToLibrary && result.source === 'youtube') {
              const youtubeProvider = getYouTubeProvider();
              youtubeProvider.addTrackToLibrary(result.track);
              await refreshYouTubeLibrary();
            }
          }

          setIsDiscoveryLoading(false);
          return;
        }
      } catch (error) {
        console.error('Discovery on mood submit failed:', error);
      } finally {
        setIsDiscoveryLoading(false);
      }
    }

    if (libraryTracks.length === 0) return;

    const { selectNextTrack } = await import('./services/navigator/selector');

    const selection = selectNextTrack(libraryTracks, {
      moodParams: params,
      currentTrack: effectiveCurrentTrack ?? null,
      recentTracks: [],
      includeRecommendations: settings.openToNewSongs,
    });

    if (selection) {
      await playUnifiedTrack(
        legacyTrackToUnified(selection.track, settings.provider),
        'library',
        'library_selector'
      );
    }
  }, [
    buildDiscoveryContext,
    dismissDiscoverySuggestions,
    effectiveIsPlaying,
    effectiveCurrentTrack,
    libraryTracks,
    openDiscoverySuggestions,
    playUnifiedTrack,
    processMood,
    refreshYouTubeLibrary,
    settings.discovery,
    settings.openToNewSongs,
    settings.provider,
    unifiedCurrentTrack,
    unifiedLibrary,
  ]);

  const handlePlayPause = useCallback(async () => {
    if (effectiveIsPlaying) {
      await effectivePause();
    } else {
      await effectivePlay();
    }
  }, [effectiveIsPlaying, effectivePause, effectivePlay]);

  const handleSkipNext = useCallback(async () => {
    const queued = queueManagerRef.current.getNext();
    if (queued) {
      refreshQueueState();
      await playUnifiedTrack(
        queued.track,
        queued.source === 'discovery' ? 'youtube' : 'library',
        'queue'
      );
      return;
    }

    await effectiveSkipNext();
  }, [effectiveSkipNext, playUnifiedTrack, refreshQueueState]);

  const handleSkipPrevious = useCallback(async () => {
    const previous = queueManagerRef.current.getPrevious();
    if (previous) {
      refreshQueueState();
      await playUnifiedTrack(
        previous.track,
        previous.source === 'discovery' ? 'youtube' : 'library',
        'queue'
      );
      return;
    }

    await effectiveSkipPrevious();
  }, [effectiveSkipPrevious, playUnifiedTrack, refreshQueueState]);

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handleProviderChange = useCallback((providerType: ProviderType) => {
    switchProvider(providerType);
    setSettings(prev => ({ ...prev, provider: providerType }));
    setNeedsLibrarySync(null);
    setLibraryTracks([]);
    dismissDiscoverySuggestions();
    setDiscoverySuggestionsList([]);
    setTrackDecisionSourceMap({});
    setTrackSourceMap({});
    setSidePanel('none');
    processedPlaybackEventRef.current = null;
  }, [dismissDiscoverySuggestions, switchProvider]);

  const handleClearCache = useCallback(() => {
    localStorage.clear();
    window.location.reload();
  }, []);

  const spotifyConnected = isAuthenticated;

  useEffect(() => {
    if (effectiveAuthenticated && needsLibrarySync === null) {
      if (isMockMode || settings.provider === 'mock') {
        setLibraryTracks(MOCK_TRACKS);
        setNeedsLibrarySync(false);
        return;
      }
      if (settings.provider === 'youtube') {
        setNeedsLibrarySync(false);
        void refreshYouTubeLibrary();
        return;
      }
      const stats = getCacheStats();
      const needsSync = stats.trackCount === 0 ||
        (stats.lastSync ? (Date.now() - stats.lastSync) > 24 * 60 * 60 * 1000 : true);
      setNeedsLibrarySync(needsSync);

      if (!needsSync && stats.trackCount > 0) {
        void import('./services/db/cache').then(({ getTrackCache }) => {
          setLibraryTracks(getTrackCache());
        });
      }
    }
  }, [effectiveAuthenticated, isMockMode, needsLibrarySync, refreshYouTubeLibrary, settings.provider]);

  const handleLibrarySyncComplete = useCallback((tracks: Track[]) => {
    setLibraryTracks(tracks);
    setNeedsLibrarySync(false);
  }, []);

  const handleLibrarySyncSkip = useCallback(() => {
    setNeedsLibrarySync(false);
  }, []);

  const handleYouTubeTrackSelect = useCallback(async (track: YouTubeSearchResult) => {
    if (settings.provider !== 'youtube') return;
    try {
      await playUnifiedTrack(searchResultToUnifiedTrack(track), 'youtube', 'manual');
    } catch (error) {
      console.error('Failed to play YouTube track:', error);
    }
  }, [playUnifiedTrack, settings.provider]);

  const handleYouTubeAddToLibrary = useCallback(async (track: YouTubeSearchResult) => {
    if (settings.provider !== 'youtube') return;
    try {
      const youtubeProvider = getYouTubeProvider();
      const unified = searchResultToUnifiedTrack(track);
      youtubeProvider.addTrackToLibrary(unified);
      await refreshYouTubeLibrary();
    } catch (error) {
      console.error('Failed to add YouTube track:', error);
    }
  }, [refreshYouTubeLibrary, settings.provider]);

  const handleRecommendationSelect = useCallback(async (track: UnifiedTrack) => {
    try {
      const isInLibrary = libraryTracks.some(item => item.spotifyId === track.id);
      await playUnifiedTrack(track, isInLibrary ? 'library' : 'youtube', 'manual');
    } catch (error) {
      console.error('Failed to play recommended track:', error);
    }
  }, [libraryTracks, playUnifiedTrack]);

  const handleRecommendationAddToQueue = useCallback(async (track: UnifiedTrack) => {
    queueManagerRef.current.addToQueue(track, track.provider === 'youtube' ? 'discovery' : 'manual');
    refreshQueueState();
    setSidePanel('queue');

    if (settings.provider === 'spotify' && accessToken) {
      try {
        await addToSpotifyQueue(accessToken, `spotify:track:${track.id}`);
      } catch (error) {
        console.error('Failed to add track to Spotify queue:', error);
      }
    }
  }, [accessToken, refreshQueueState, settings.provider]);

  const handleDiscoverySelect = useCallback(async (track: UnifiedTrack) => {
    dismissDiscoverySuggestions();
    await playUnifiedTrack(track, 'youtube', 'discovery_suggest');
  }, [dismissDiscoverySuggestions, playUnifiedTrack]);

  const handleDiscoveryQueue = useCallback((track: UnifiedTrack) => {
    queueManagerRef.current.addToQueue(track, 'discovery');
    refreshQueueState();
    setSidePanel('queue');
  }, [refreshQueueState]);

  const handleDiscoveryBlock = useCallback((track: UnifiedTrack) => {
    setBlockedDiscoveryTrackIds(prev => {
      if (prev.includes(track.id)) return prev;
      return [...prev, track.id];
    });
    setDiscoverySuggestionsList(prev => {
      const next = prev.filter(item => item.id !== track.id);
      if (next.length === 0) {
        clearDiscoveryAutoplayTimer();
      }
      return next;
    });
  }, [clearDiscoveryAutoplayTimer]);

  const handleDiscoveryAddToLibrary = useCallback(async (track: UnifiedTrack) => {
    if (settings.provider !== 'youtube') return;
    try {
      const youtubeProvider = getYouTubeProvider();
      youtubeProvider.addTrackToLibrary(track);
      await refreshYouTubeLibrary();
    } catch (error) {
      console.error('Failed to add discovery track to library:', error);
    }
  }, [refreshYouTubeLibrary, settings.provider]);

  const handleDiscoveryLoadMore = useCallback(async () => {
    if (!moodState.current || settings.provider !== 'youtube') return;

    try {
      setIsDiscoveryLoading(true);
      const discoveryContext = buildDiscoveryContext();
      const results = await discoverSuggestions(
        unifiedLibrary,
        moodState.current,
        unifiedCurrentTrack,
        settings.discovery,
        Math.max(settings.discovery.maxSuggestionsPerCycle, discoverySuggestionsList.length + 3),
        discoveryContext
      );
      setDiscoverySuggestionsList(results);
    } catch (error) {
      console.error('Failed to load more discovery suggestions:', error);
    } finally {
      setIsDiscoveryLoading(false);
    }
  }, [
    buildDiscoveryContext,
    discoverySuggestionsList.length,
    moodState,
    settings.discovery,
    settings.provider,
    unifiedCurrentTrack,
    unifiedLibrary,
  ]);

  const handleQueuePlay = useCallback(async (item: QueueItem) => {
    queueManagerRef.current.removeFromQueue(item.id);
    refreshQueueState();
    await playUnifiedTrack(item.track, item.source === 'discovery' ? 'youtube' : 'library', 'queue');
  }, [playUnifiedTrack, refreshQueueState]);

  const handleQueueRemove = useCallback((id: string) => {
    queueManagerRef.current.removeFromQueue(id);
    refreshQueueState();
  }, [refreshQueueState]);

  const handleQueueClear = useCallback(() => {
    queueManagerRef.current.clear();
    refreshQueueState();
  }, [refreshQueueState]);

  const handleQueueReorder = useCallback((fromIndex: number, toIndex: number) => {
    queueManagerRef.current.reorder(fromIndex, toIndex);
    refreshQueueState();
  }, [refreshQueueState]);

  const handleHistoryPlay = useCallback(async (track: UnifiedTrack) => {
    await playUnifiedTrack(track, track.provider === 'youtube' ? 'youtube' : 'library', 'manual');
  }, [playUnifiedTrack]);

  const handleHistoryClear = useCallback(() => {
    clearHistory();
    setHistoryEntries([]);
  }, []);

  useKeyboardShortcuts({
    Space: () => { void handlePlayPause(); },
    ArrowRight: () => { void handleSkipNext(); },
    ArrowLeft: () => { void handleSkipPrevious(); },
    Escape: () => {
      setIsSettingsOpen(false);
      setSidePanel('none');
      dismissDiscoverySuggestions();
    },
    s: () => { setIsSettingsOpen(true); },
    '/': () => {
      document.querySelector<HTMLInputElement>('.mood-input')?.focus();
    },
  });

  const currentSource: TrackSource | null = effectiveCurrentTrack
    ? (trackSourceMap[effectiveCurrentTrack.spotifyId] ??
      (libraryTracks.some(track => track.spotifyId === effectiveCurrentTrack.spotifyId) ? 'library' : 'youtube'))
    : null;

  const sourceLabel = currentSource
    ? (currentSource === 'youtube' ? 'YouTube kesif' : 'Kutuphanenden')
    : undefined;

  return (
    <div className="w-full h-screen bg-[var(--color-background)] overflow-hidden flex flex-col border border-white/10">
      <div
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 bg-[var(--color-surface)] no-select cursor-default relative z-20 shrink-0 border-b border-white/10"
      >
        <span data-tauri-drag-region className="text-sm font-semibold text-[var(--color-text-primary)] pointer-events-none">
          Moodverter
        </span>

        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5 transition-colors pointer-events-auto"
          title="Settings"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative">
        <div data-tauri-drag-region className="absolute inset-0 z-0" />

        <div className="p-6 flex-1 flex flex-col max-w-md mx-auto w-full relative z-10 pointer-events-auto">
          {effectiveLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white/10 border-t-[var(--color-primary)] rounded-full animate-spin" />
            </div>
          ) : !effectiveAuthenticated ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-8 text-center">
              <div className="space-y-4">
                <div className="w-16 h-16 bg-[var(--color-primary)] flex items-center justify-center mx-auto">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Moodverter</h2>
                  <p className="text-sm text-[var(--color-text-secondary)]">Muzigini ruh haline gore dinle</p>
                </div>
              </div>
              <button
                onClick={effectiveLogin}
                className="w-full py-3 bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] active:scale-[0.98] transition-all"
              >
                Basla
              </button>
            </div>
          ) : needsLibrarySync && settings.provider === 'spotify' ? (
            <div className="flex-1 flex items-center">
              <LibrarySync
                accessToken={accessToken!}
                onSyncComplete={handleLibrarySyncComplete}
                onSkip={handleLibrarySyncSkip}
              />
            </div>
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-4">
                <span>{settings.provider} • {libraryTracks.length} sarki</span>
                {engineStatus?.ollamaRunning && (
                  <span className="text-[var(--color-primary)]">AI Aktif</span>
                )}
              </div>

              {settings.provider === 'youtube' && (
                <div className="mb-4">
                  <div className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                    YouTube Kutuphanesi
                  </div>
                  <div className="max-h-40 border border-white/10 bg-[var(--color-surface)] overflow-hidden">
                    <LibrarySearch
                      currentMood={currentMoodInput}
                      onTrackSelect={handleYouTubeTrackSelect}
                      onAddToLibrary={handleYouTubeAddToLibrary}
                    />
                  </div>
                </div>
              )}

              <div className="mb-auto space-y-3">
                <MoodInput
                  onMoodSubmit={handleMoodSubmit}
                  isProcessing={moodState.isProcessing}
                  inputClassName="mood-input"
                />

                {showDiscoverySuggestions && (
                  <DiscoverySuggestions
                    suggestions={discoverySuggestionsList}
                    isLoading={isDiscoveryLoading}
                    onSelect={handleDiscoverySelect}
                    onQueue={handleDiscoveryQueue}
                    onBlock={handleDiscoveryBlock}
                    onAddToLibrary={handleDiscoveryAddToLibrary}
                    onDismiss={dismissDiscoverySuggestions}
                    onLoadMore={handleDiscoveryLoadMore}
                    autoplayCountdownSec={discoveryAutoplayCountdownSec}
                  />
                )}
              </div>

              <div className="mt-auto space-y-3 shrink-0">
                <NowPlaying
                  track={effectiveCurrentTrack}
                  progress={effectiveProgress}
                  duration={effectiveDuration}
                  onSeek={effectiveSeek}
                  isAnalyzing={isAnalyzingAudio}
                  isPlaying={effectiveIsPlaying}
                  onPlayPause={handlePlayPause}
                  onSkipNext={handleSkipNext}
                  onSkipPrevious={handleSkipPrevious}
                  sourceLabel={sourceLabel}
                  showQueueToggle
                  queueCount={queueState.items.length}
                  onToggleQueue={() => {
                    setSidePanel(prev => (prev === 'queue' ? 'none' : 'queue'));
                  }}
                />

                <Recommendations
                  currentTrack={unifiedCurrentTrack}
                  moodParams={moodParamsForRecommendations}
                  library={unifiedLibrary}
                  onTrackSelect={handleRecommendationSelect}
                  onAddToQueue={handleRecommendationAddToQueue}
                  maxItems={5}
                />

                <div className="flex items-center gap-2 px-1">
                  <button
                    onClick={() => {
                      setSidePanel(prev => (prev === 'queue' ? 'none' : 'queue'));
                    }}
                    className={`text-[10px] px-2 py-1 border transition-colors ${
                      sidePanel === 'queue'
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    Sira
                  </button>
                  <button
                    onClick={() => {
                      setSidePanel(prev => (prev === 'history' ? 'none' : 'history'));
                    }}
                    className={`text-[10px] px-2 py-1 border transition-colors ${
                      sidePanel === 'history'
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    Gecmis
                  </button>
                </div>

                {sidePanel === 'queue' && (
                  <QueuePanel
                    items={queueState.items}
                    onPlay={handleQueuePlay}
                    onRemove={handleQueueRemove}
                    onClear={handleQueueClear}
                    onReorder={handleQueueReorder}
                    collapsed={queueCollapsed}
                    onToggleCollapse={() => setQueueCollapsed(prev => !prev)}
                  />
                )}

                {sidePanel === 'history' && (
                  <HistoryPanel
                    entries={historyEntries}
                    onPlay={handleHistoryPlay}
                    onClear={handleHistoryClear}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={{ ...settings, spotifyConnected }}
        onSettingsChange={handleSettingsChange}
        onClearCache={handleClearCache}
        onSpotifyConnect={login}
        onSpotifyDisconnect={logout}
        onProviderChange={handleProviderChange}
        availableProviders={availableProviders}
      />

      <KeyboardHelp />
    </div>
  );
}

export default App;
