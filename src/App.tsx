import { useState, useCallback, useEffect } from 'react';
import { MoodInput, NowPlaying, NextTrack, PlayerControls, Settings, MoodDeviationDialog, LibrarySync } from './components';
import { useSpotify, usePlayback, useMood, TrackChangeEvent } from './hooks';
import { Track } from './types/track';
import { MoodDeviation, MoodParameters } from './types/mood';
import { getAudioFeatures } from './services/spotify/api';
import { getCacheStats } from './services/db/cache';
import { MOCK_TRACKS } from './services/mock/data';

// Helper to generate mood description from parameters
const getMoodDescription = (params: MoodParameters): string => {
  const descriptions: string[] = [];
  
  if (params.energy > 0.7) descriptions.push('energetic');
  else if (params.energy < 0.3) descriptions.push('calm');
  
  if (params.valence > 0.7) descriptions.push('happy');
  else if (params.valence < 0.3) descriptions.push('melancholic');
  
  if (params.danceability > 0.7) descriptions.push('danceable');
  if (params.acousticness > 0.6) descriptions.push('acoustic');
  
  return descriptions.length > 0 ? descriptions.join(' ') : 'balanced';
};

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [settings, setSettings] = useState({
    openToNewSongs: true,
    spotifyConnected: false,
    openAiApiKey: import.meta.env.VITE_OPENAI_API_KEY || '',
  });
  const [nextTrack, _setNextTrack] = useState<Track | null>(null);
  
  // Deviation dialog state
  const [deviationDialogOpen, setDeviationDialogOpen] = useState(false);
  const [currentDeviation, setCurrentDeviation] = useState<MoodDeviation | null>(null);
  const [deviationTrack, setDeviationTrack] = useState<Track | null>(null);
  
  // Library sync state
  const [needsLibrarySync, setNeedsLibrarySync] = useState<boolean | null>(null);
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);

  // Hooks
  const { isAuthenticated, isLoading: authLoading, user, tokens, login, logout, isMockMode } = useSpotify();
  const accessToken = tokens?.access_token || null;
  
  const { moodState, processMood, calculateDeviation } = useMood(settings.openAiApiKey || null);

  // Handle track changes (skip, manual selection, etc.)
  const handleTrackChange = useCallback(async (event: TrackChangeEvent) => {
    // Only check deviation for user-initiated changes (not natural progression or app-initiated)
    if (event.type === 'natural' || event.type === 'app_initiated') return;
    if (!moodState.current) return;

    try {
      let trackWithFeatures: Track;

      // In mock mode, tracks already have audio features
      if (isMockMode) {
        trackWithFeatures = event.newTrack;
      } else {
        if (!accessToken) return;
        // Fetch audio features for the new track
        const features = await getAudioFeatures(accessToken, event.newTrack.spotifyId);

        // Create track with audio features
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

      // Calculate deviation
      const deviation = calculateDeviation(trackWithFeatures);

      if (deviation?.isSignificant) {
        // Show dialog for significant deviations
        setCurrentDeviation(deviation);
        setDeviationTrack(trackWithFeatures);
        setDeviationDialogOpen(true);
      } else if (deviation && deviation.deviationScore > 0.15) {
        // Silent adaptation for small-medium deviations
        console.log('Small mood deviation detected, adapting silently...');
      }
    } catch (err) {
      console.error('Failed to check track deviation:', err);
    }
  }, [moodState.current, accessToken, isMockMode, calculateDeviation]);

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
  } = usePlayback(accessToken, { onTrackChange: handleTrackChange });

  // Handle adaptation to new mood based on current track
  const handleAdaptMood = useCallback(async () => {
    if (!deviationTrack) return;
    
    // Create mood parameters from track features
    const newMoodParams: MoodParameters = {
      energy: deviationTrack.energy,
      valence: deviationTrack.valence,
      danceability: deviationTrack.danceability,
      acousticness: deviationTrack.acousticness,
      tempo_min: Math.max(60, deviationTrack.tempo - 20),
      tempo_max: Math.min(200, deviationTrack.tempo + 20),
    };
    
    // Process the mood using a description
    const moodDescription = getMoodDescription(newMoodParams);
    await processMood(moodDescription);
    
    setDeviationDialogOpen(false);
    setCurrentDeviation(null);
    setDeviationTrack(null);
  }, [deviationTrack, processMood]);

  const handleKeepMood = useCallback(() => {
    setDeviationDialogOpen(false);
    setCurrentDeviation(null);
    setDeviationTrack(null);
  }, []);

  const handleDismissDeviation = useCallback(() => {
    setDeviationDialogOpen(false);
  }, []);

  // Handlers
  const handleMoodSubmit = useCallback(async (mood: string) => {
    await processMood(mood);
    // TODO: Select next track based on mood
  }, [processMood]);

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

  const handleClearCache = useCallback(() => {
    localStorage.clear();
    window.location.reload();
  }, []);

  // Update spotify connected status
  const spotifyConnected = isAuthenticated;

  // Check if library sync is needed after authentication
  useEffect(() => {
    if (isAuthenticated && needsLibrarySync === null) {
      // Mock mode: use mock tracks directly, no sync needed
      if (isMockMode) {
        setLibraryTracks(MOCK_TRACKS);
        setNeedsLibrarySync(false);
        return;
      }

      const stats = getCacheStats();
      // Need sync if no tracks or last sync was more than 24 hours ago
      const needsSync = stats.trackCount === 0 ||
        (stats.lastSync ? (Date.now() - stats.lastSync) > 24 * 60 * 60 * 1000 : true);
      setNeedsLibrarySync(needsSync);

      if (!needsSync && stats.trackCount > 0) {
        // Load existing cached tracks
        import('./services/db/cache').then(({ getTrackCache }) => {
          setLibraryTracks(getTrackCache());
        });
      }
    }
  }, [isAuthenticated, isMockMode, needsLibrarySync]);

  // Library sync handlers
  const handleLibrarySyncComplete = useCallback((tracks: Track[]) => {
    setLibraryTracks(tracks);
    setNeedsLibrarySync(false);
  }, []);

  const handleLibrarySyncSkip = useCallback(() => {
    setNeedsLibrarySync(false);
  }, []);

  return (
    <div className={`w-full bg-[var(--color-background)] overflow-hidden transition-all duration-300 ease-in-out ${
      isCollapsed ? 'h-auto' : 'h-screen'
    }`}>
      {/* Draggable title bar */}
      <div 
        data-tauri-drag-region 
        className="h-8 flex items-center justify-between px-3 bg-[var(--color-surface)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--color-text-secondary)] font-medium">
            Moodverter
          </span>
          {isMockMode && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded font-medium">
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Collapse/Expand button */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors group"
            title={isCollapsed ? 'Expand' : 'Collapse'}
          >
            <svg 
              className={`w-4 h-4 transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`} 
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          {/* Settings button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors group"
            title="Settings"
          >
            <svg className="w-4 h-4 group-hover:rotate-45 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Collapsed mini player */}
      {isCollapsed && isAuthenticated && currentTrack && (
        <div className="p-2 flex items-center gap-3 bg-[var(--color-surface)]">
          {currentTrack.albumArt && (
            <img 
              src={currentTrack.albumArt} 
              alt={currentTrack.name}
              className="w-10 h-10 rounded object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
              {currentTrack.name}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] truncate">
              {currentTrack.artist}
            </p>
          </div>
          <button
            onClick={handlePlayPause}
            className="p-2 bg-[var(--color-primary)] rounded-full hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            {isPlaying ? (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7L8 5z" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* Main content - with collapse animation */}
      <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
        isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[800px] opacity-100'
      }`}>
        <div className="p-4 space-y-4">
          {/* Auth state */}
          {authLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
          ) : !isAuthenticated ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-2">
                  Welcome to Moodverter
                </h2>
                <p className="text-sm text-[var(--color-text-secondary)] mb-4">
                  Connect your Spotify account to get started
                </p>
              </div>
              <button
                onClick={login}
                className="px-6 py-3 bg-[var(--color-primary)] rounded-full 
                           text-white font-semibold
                           hover:bg-[var(--color-primary-dark)] transition-colors
                           flex items-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
                </svg>
                Connect Spotify
              </button>
            </div>
          ) : needsLibrarySync ? (
            /* Library sync screen */
            <LibrarySync
              accessToken={accessToken!}
              onSyncComplete={handleLibrarySyncComplete}
              onSkip={handleLibrarySyncSkip}
            />
          ) : (
            <>
              {/* User info */}
              {user && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                  <span className="w-2 h-2 bg-[var(--color-primary)] rounded-full animate-pulse" />
                  <span>{user.display_name}</span>
                  {libraryTracks.length > 0 && (
                    <span className="text-[var(--color-text-secondary)]">
                      ({libraryTracks.length} tracks)
                    </span>
                  )}
                </div>
              )}

              {/* Mood input */}
              <MoodInput 
                onMoodSubmit={handleMoodSubmit}
                isProcessing={moodState.isProcessing}
              />

              {/* Current mood indicator */}
              {moodState.current && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[var(--color-text-secondary)]">Mood:</span>
                  <div className="flex items-center gap-1">
                    <span 
                      className="px-2 py-0.5 bg-[var(--color-surface)] rounded text-[var(--color-text-primary)] cursor-help"
                      title="Energy level"
                    >
                      E: {(moodState.current.energy * 100).toFixed(0)}%
                    </span>
                    <span 
                      className="px-2 py-0.5 bg-[var(--color-surface)] rounded text-[var(--color-text-primary)] cursor-help"
                      title="Valence (positivity)"
                    >
                      V: {(moodState.current.valence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}

              {/* Now playing */}
              <NowPlaying
                track={currentTrack}
                progress={progress}
                duration={duration}
                onSeek={seek}
              />

              {/* Player controls */}
              <PlayerControls
                isPlaying={isPlaying}
                onPlayPause={handlePlayPause}
                onSkipNext={skipNext}
                onSkipPrevious={skipPrevious}
                disabled={!currentTrack}
              />

              {/* Next track preview */}
              <NextTrack 
                track={nextTrack}
                transitionIn={nextTrack ? duration - progress : undefined}
              />
            </>
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
      />

      {/* Mood deviation dialog */}
      <MoodDeviationDialog
        isOpen={deviationDialogOpen}
        deviation={currentDeviation}
        track={deviationTrack}
        onAdaptMood={handleAdaptMood}
        onKeepMood={handleKeepMood}
        onDismiss={handleDismissDeviation}
      />
    </div>
  );
}

export default App;
