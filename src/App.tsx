import { useState, useCallback, useEffect } from 'react';
import { MoodInput, NowPlaying, Settings, LibrarySync, LibrarySearch, Recommendations } from './components';
import { useSpotify, usePlayback, useMood, useProvider, TrackChangeEvent } from './hooks';
import { Track } from './types/track';
import { MoodParameters } from './types/mood';
import type { ProviderType, UnifiedTrack } from './types/provider';
import { getAudioFeatures } from './services/spotify/api';
import { addToQueue } from './services/spotify/playback';
import { getCacheStats } from './services/db/cache';
import { MOCK_TRACKS } from './services/mock/data';
import { legacyTrackToUnified, unifiedToLegacyTrack } from './services/providers';
import { legacyToMoodParams } from './services/mood/engine';
import { recordListen, recordSkip } from './services/memory/preferences';
import { searchResultToUnifiedTrack, type YouTubeSearchResult } from './services/youtube/search';
import { getYouTubeProvider } from './services/providers/youtube';

function App() {
  // Disable context menu (right-click)
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
  });
  
  // Library sync state
  const [needsLibrarySync, setNeedsLibrarySync] = useState<boolean | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);

  // Audio analysis state
  const [isAnalyzingAudio, setIsAnalyzingAudio] = useState(false);

  // Provider hook (new unified provider system)
  const {
    provider,
    isAuthenticated: providerAuthenticated,
    isLoading: providerLoading,
    availableProviders,
    login: providerLogin,
    switchProvider,
    playbackState: providerPlaybackState,
    play: providerPlay,
    pause: providerPause,
    resume: providerResume,
    skip: providerSkip,
    previous: providerPrevious,
    seek: providerSeek,
  } = useProvider(settings.provider);

  // Legacy Spotify hook for backward compatibility
  const { isAuthenticated, isLoading: authLoading, tokens, login, logout, isMockMode } = useSpotify();
  const accessToken = tokens?.access_token || null;

  const { moodState, processMood, setMoodParameters, engineStatus } = useMood(settings.openAiApiKey || null);

  // Determine which auth state to use based on provider
  const effectiveAuthenticated = settings.provider === 'spotify' ? isAuthenticated : providerAuthenticated;
  const effectiveLoading = settings.provider === 'spotify' ? authLoading : providerLoading;
  const effectiveLogin = settings.provider === 'spotify' ? login : providerLogin;

  // Handle track changes (skip, manual selection, etc.)
  const handleTrackChange = useCallback(async (event: TrackChangeEvent) => {
    if (event.previousTrack && event.previousDurationMs > 0) {
      const listenPercent = Math.min(
        1,
        Math.max(0, event.previousProgressMs / event.previousDurationMs)
      );

      if (event.type === 'natural' || listenPercent >= 0.8) {
        recordListen(
          event.previousTrack.spotifyId,
          event.previousTrack.artist,
          [],
          listenPercent,
          {
            energy: event.previousTrack.energy,
            valence: event.previousTrack.valence,
            tempo: event.previousTrack.tempo,
          }
        );
      } else if (event.type !== 'app_initiated') {
        recordSkip(
          event.previousTrack.spotifyId,
          event.previousTrack.artist,
          [],
          listenPercent
        );
      }
    }

    if (event.type === 'natural' || event.type === 'app_initiated') return;

    try {
      setIsAnalyzingAudio(true);
      let trackWithFeatures: Track;

      if (isMockMode || settings.provider === 'mock') {
        trackWithFeatures = event.newTrack;
      } else if (settings.provider === 'youtube') {
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
        setMoodParameters(newMoodParams, 'improvisation');
      }
    } catch (err) {
      console.error('Failed to handle track change:', err);
    } finally {
      setIsAnalyzingAudio(false);
    }
  }, [accessToken, isMockMode, settings.provider, setMoodParameters]);

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

  // Handlers
  const handleMoodSubmit = useCallback(async (mood: string) => {
    const params = await processMood(mood);
    if (!params || libraryTracks.length === 0) return;

    const { selectNextTrack } = await import('./services/navigator/selector');

    const selection = selectNextTrack(libraryTracks, {
      moodParams: params,
      currentTrack: effectiveCurrentTrack ?? null,
      recentTracks: [],
      includeRecommendations: settings.openToNewSongs,
    });

    if (selection) {
      if (settings.provider === 'spotify') {
        await playTrack(`spotify:track:${selection.track.spotifyId}`);
      } else if (provider) {
        await provider.play(selection.track.spotifyId);
      }
    }
  }, [processMood, libraryTracks, effectiveCurrentTrack, settings.openToNewSongs, settings.provider, playTrack, provider]);

  const handlePlayPause = useCallback(async () => {
    if (effectiveIsPlaying) {
      await effectivePause();
    } else {
      await effectivePlay();
    }
  }, [effectiveIsPlaying, effectivePlay, effectivePause]);

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handleProviderChange = useCallback((provider: ProviderType) => {
    switchProvider(provider);
    setSettings(prev => ({ ...prev, provider }));
    setNeedsLibrarySync(null);
    setLibraryTracks([]);
  }, [switchProvider]);

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
        refreshYouTubeLibrary();
        return;
      }
      const stats = getCacheStats();
      const needsSync = stats.trackCount === 0 ||
        (stats.lastSync ? (Date.now() - stats.lastSync) > 24 * 60 * 60 * 1000 : true);
      setNeedsLibrarySync(needsSync);

      if (!needsSync && stats.trackCount > 0) {
        import('./services/db/cache').then(({ getTrackCache }) => {
          setLibraryTracks(getTrackCache());
        });
      }
    }
  }, [effectiveAuthenticated, isMockMode, settings.provider, needsLibrarySync, refreshYouTubeLibrary]);

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
      if (provider) {
        await provider.play(track.videoId);
      }
    } catch (error) {
      console.error('Failed to play YouTube track:', error);
    }
  }, [provider, settings.provider]);

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
      if (settings.provider === 'spotify') {
        await playTrack(`spotify:track:${track.id}`);
      } else if (provider) {
        await provider.play(track.id);
      }
    } catch (error) {
      console.error('Failed to play recommended track:', error);
    }
  }, [playTrack, provider, settings.provider]);

  const handleRecommendationAddToQueue = useCallback(async (track: UnifiedTrack) => {
    if (settings.provider !== 'spotify' || !accessToken) return;
    try {
      await addToQueue(accessToken, `spotify:track:${track.id}`);
    } catch (error) {
      console.error('Failed to add track to queue:', error);
    }
  }, [accessToken, settings.provider]);

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

  const currentMoodInput = moodState.history.inputs[moodState.history.inputs.length - 1]?.text;

  return (
    <div className="w-full h-screen bg-[var(--color-background)] overflow-hidden flex flex-col border border-white/10">
      {/* Title bar */}
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

      {/* Main content */}
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
                  <p className="text-sm text-[var(--color-text-secondary)]">Müziğini ruh haline göre dinle</p>
                </div>
              </div>
              <button
                onClick={effectiveLogin}
                className="w-full py-3 bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary-dark)] active:scale-[0.98] transition-all"
              >
                Başla
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
              {/* Status bar */}
              <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-4">
                <span>{settings.provider} • {libraryTracks.length} şarkı</span>
                {engineStatus?.ollamaRunning && (
                  <span className="text-[var(--color-primary)]">AI Aktif</span>
                )}
              </div>

              {settings.provider === 'youtube' && (
                <div className="mb-4">
                  <div className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                    YouTube Kutuphanesi
                  </div>
                  <div className="h-56 border border-white/10 bg-[var(--color-surface)]">
                    <LibrarySearch
                      currentMood={currentMoodInput}
                      onTrackSelect={handleYouTubeTrackSelect}
                      onAddToLibrary={handleYouTubeAddToLibrary}
                    />
                  </div>
                </div>
              )}

              {/* Mood input - TOP */}
              <div className="mb-auto">
                <MoodInput
                  onMoodSubmit={handleMoodSubmit}
                  isProcessing={moodState.isProcessing}
                />
              </div>

              {/* Player Section - BOTTOM */}
              <div className="mt-auto space-y-4">
                <NowPlaying
                  track={effectiveCurrentTrack}
                  progress={effectiveProgress}
                  duration={effectiveDuration}
                  onSeek={effectiveSeek}
                  isAnalyzing={isAnalyzingAudio}
                />

                <Recommendations
                  currentTrack={unifiedCurrentTrack}
                  moodParams={moodParamsForRecommendations}
                  library={unifiedLibrary}
                  onTrackSelect={handleRecommendationSelect}
                  onAddToQueue={settings.provider === 'spotify' ? handleRecommendationAddToQueue : undefined}
                  maxItems={5}
                />

                <div className="flex justify-center items-center gap-8">
                  <button onClick={effectiveSkipPrevious} className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                  </button>
                  <button
                    onClick={handlePlayPause}
                    className="w-14 h-14 bg-[var(--color-primary)] flex items-center justify-center text-white hover:bg-[var(--color-primary-dark)] active:scale-95 transition-all"
                  >
                    {effectiveIsPlaying ? (
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg className="w-7 h-7 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
                    )}
                  </button>
                  <button onClick={effectiveSkipNext} className="p-2 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors">
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Settings modal */}
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
    </div>
  );
}

export default App;
