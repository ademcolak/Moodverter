import { useState, useCallback, useEffect } from 'react';
import { MoodInput, NowPlaying, Settings, LibrarySync } from './components';
import { useSpotify, usePlayback, useMood, useProvider, TrackChangeEvent } from './hooks';
import { Track } from './types/track';
import { MoodParameters } from './types/mood';
import type { ProviderType } from './types/provider';
import { getAudioFeatures } from './services/spotify/api';
import { getCacheStats } from './services/db/cache';
import { MOCK_TRACKS } from './services/mock/data';

function App() {
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
    isAuthenticated: providerAuthenticated,
    isLoading: providerLoading,
    availableProviders,
    login: providerLogin,
    switchProvider,
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

  // Handlers
  const handleMoodSubmit = useCallback(async (mood: string) => {
    const params = await processMood(mood);
    if (!params || libraryTracks.length === 0) return;

    const { selectNextTrack } = await import('./services/navigator/selector');

    const selection = selectNextTrack(libraryTracks, {
      moodParams: params,
      currentTrack: currentTrack ?? null,
      recentTracks: [],
      includeRecommendations: settings.openToNewSongs,
    });

    if (selection) {
      if (settings.provider === 'spotify') {
        await playTrack(`spotify:track:${selection.track.spotifyId}`);
      } else {
        const { createProvider } = await import('./services/providers');
        const provider = createProvider(settings.provider);
        await provider.play(selection.track.spotifyId);
      }
    }
  }, [processMood, libraryTracks, currentTrack, settings.openToNewSongs, settings.provider, playTrack]);

  const handlePlayPause = useCallback(async () => {
    if (isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [isPlaying, play, pause]);

  const handleSettingsChange = useCallback((newSettings: Partial<typeof settings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  }, []);

  const handleProviderChange = useCallback((provider: ProviderType) => {
    switchProvider(provider);
    setSettings(prev => ({ ...prev, provider }));
    setNeedsLibrarySync(null);
    setLibraryTracks([]);
  }, [switchProvider]);

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
  }, [effectiveAuthenticated, isMockMode, settings.provider, needsLibrarySync]);

  const handleLibrarySyncComplete = useCallback((tracks: Track[]) => {
    setLibraryTracks(tracks);
    setNeedsLibrarySync(false);
  }, []);

  const handleLibrarySyncSkip = useCallback(() => {
    setNeedsLibrarySync(false);
  }, []);

  return (
    <div className="w-full h-screen bg-[var(--color-background)] rounded-none overflow-hidden flex flex-col border border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
      {/* Draggable title bar - minimal, tray controls the window */}
      <div
        data-tauri-drag-region
        className="h-10 flex items-center justify-between px-4 bg-[var(--color-surface)]/40 backdrop-blur-xl no-select cursor-default relative z-20 shrink-0 border-b border-white/5"
      >
        {/* App title */}
        <div data-tauri-drag-region className="flex items-center gap-2 pointer-events-none">
          <div className="w-2 h-2 bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-accent)] shadow-[0_0_10px_var(--color-primary)]" />
          <span className="text-[10px] font-black tracking-[0.25em] text-white/80 uppercase">
            Moodverter
          </span>
        </div>

        {/* Settings button */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          className="p-2 text-white/40 hover:text-[var(--color-primary)] hover:bg-white/5 transition-all active:scale-90 pointer-events-auto"
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
        {/* Absolute Background Drag Region */}
        <div data-tauri-drag-region className="absolute inset-0 z-0" />

        <div className="p-8 space-y-10 flex-1 flex flex-col justify-center max-w-md mx-auto w-full relative z-10 pointer-events-auto">
          {effectiveLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-12 h-12 border-4 border-white/5 border-t-[var(--color-primary)] animate-spin shadow-[0_0_20px_var(--color-primary)]" />
            </div>
          ) : !effectiveAuthenticated ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-12 text-center">
              <div className="space-y-6">
                <div className="w-28 h-28 bg-gradient-to-tr from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center mx-auto shadow-[0_25px_50px_-12px_rgba(0,242,254,0.5)] rotate-[15deg] transition-transform hover:rotate-0 duration-500">
                  <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                </div>
                <div className="space-y-2">
                  <h2 className="text-4xl font-black text-white tracking-tighter uppercase">Sonic Mood.</h2>
                  <p className="text-[var(--color-text-secondary)] text-lg font-medium opacity-60 uppercase tracking-widest">Connect your soul to your library.</p>
                </div>
              </div>
              <button
                onClick={effectiveLogin}
                className="w-full px-8 py-5 btn-primary text-white font-black text-xl active:scale-95 transition-all shadow-2xl uppercase tracking-widest"
              >
                Get Started
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
            <div className="space-y-10 flex-1 flex flex-col justify-center">
              {/* Top Meta */}
              <div data-tauri-drag-region className="flex items-center justify-between no-select px-2">
                <div data-tauri-drag-region className="flex flex-col">
                  <span data-tauri-drag-region className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary)]">
                    {settings.provider} active
                  </span>
                  <span data-tauri-drag-region className="text-[9px] font-bold text-white/30 uppercase tracking-widest">
                    {libraryTracks.length} tracks synced
                  </span>
                </div>
                {engineStatus?.ollamaRunning && (
                  <span className="text-vibe text-[10px] font-black uppercase tracking-widest animate-pulse bg-white/5 px-3 py-1 border border-white/5">
                    Neural Engine
                  </span>
                )}
              </div>

              {/* Mood input */}
              <MoodInput
                onMoodSubmit={handleMoodSubmit}
                isProcessing={moodState.isProcessing}
              />

              {/* Player Section */}
              <div className="space-y-10">
                <NowPlaying
                  track={currentTrack}
                  progress={progress}
                  duration={duration}
                  onSeek={seek}
                  isAnalyzing={isAnalyzingAudio}
                />

                <div className="flex justify-center items-center gap-12">
                  <button onClick={skipPrevious} className="text-white/20 hover:text-white transition-all active:scale-90">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                  </button>
                  <button 
                    onClick={handlePlayPause}
                    className="w-24 h-24 btn-primary flex items-center justify-center text-white shadow-[0_20px_40px_-5px_rgba(0,242,254,0.4)] hover:scale-105 active:scale-95 transition-all"
                  >
                    {isPlaying ? (
                      <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    ) : (
                      <svg className="w-12 h-12 ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7L8 5z"/></svg>
                    )}
                  </button>
                  <button onClick={skipNext} className="text-white/20 hover:text-white transition-all active:scale-90">
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
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
