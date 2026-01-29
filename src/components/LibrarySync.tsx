import { useState, useEffect, useCallback } from 'react';
import { getAllSavedTracks, getAudioFeaturesBatch } from '../services/spotify/api';
import { setTrackCache, getTrackCache, getCacheStats } from '../services/db/cache';
import { Track } from '../types/track';

interface LibrarySyncProps {
  accessToken: string;
  onSyncComplete: (tracks: Track[]) => void;
  onSkip: () => void;
}

type SyncPhase = 'checking' | 'fetching' | 'analyzing' | 'complete' | 'skipped';

export const LibrarySync = ({ accessToken, onSyncComplete, onSkip }: LibrarySyncProps) => {
  const [phase, setPhase] = useState<SyncPhase>('checking');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const syncLibrary = useCallback(async () => {
    try {
      // Check if we already have cached tracks
      const stats = getCacheStats();
      if (stats.trackCount > 0 && stats.lastSync) {
        const hoursSinceSync = (Date.now() - stats.lastSync) / (1000 * 60 * 60);
        if (hoursSinceSync < 24) {
          // Cache is fresh enough, skip sync
          const cachedTracks = getTrackCache();
          onSyncComplete(cachedTracks);
          return;
        }
      }

      // Phase 1: Fetch all saved tracks
      setPhase('fetching');
      const savedTracks = await getAllSavedTracks(accessToken, (loaded, total) => {
        setProgress({ current: loaded, total });
      });

      if (savedTracks.length === 0) {
        setPhase('complete');
        onSyncComplete([]);
        return;
      }

      // Phase 2: Fetch audio features in batches
      setPhase('analyzing');
      const trackIds = savedTracks.map(t => t.track.id);
      const tracks: Track[] = [];
      const batchSize = 100;

      for (let i = 0; i < trackIds.length; i += batchSize) {
        const batch = trackIds.slice(i, i + batchSize);
        setProgress({ current: i, total: trackIds.length });

        try {
          const features = await getAudioFeaturesBatch(accessToken, batch);
          const featuresMap = new Map(features.map(f => [f.id, f]));

          // Map saved tracks to our Track type
          for (const savedTrack of savedTracks.slice(i, i + batchSize)) {
            const spotifyTrack = savedTrack.track;
            const audioFeatures = featuresMap.get(spotifyTrack.id);

            const track: Track = {
              spotifyId: spotifyTrack.id,
              name: spotifyTrack.name,
              artist: spotifyTrack.artists.map(a => a.name).join(', '),
              albumArt: spotifyTrack.album.images[0]?.url,
              durationMs: spotifyTrack.duration_ms,
              releaseYear: parseInt(spotifyTrack.album.release_date.split('-')[0]),
              energy: audioFeatures?.energy || 0.5,
              valence: audioFeatures?.valence || 0.5,
              tempo: audioFeatures?.tempo || 120,
              danceability: audioFeatures?.danceability || 0.5,
              acousticness: audioFeatures?.acousticness || 0.3,
              instrumentalness: audioFeatures?.instrumentalness || 0,
              key: audioFeatures?.key || 0,
              mode: audioFeatures?.mode || 1,
              playCount: 0,
            };

            tracks.push(track);
          }
        } catch (batchErr) {
          console.error('Failed to fetch audio features batch:', batchErr);
          // Continue with default values
        }
      }

      // Save to cache
      setTrackCache(tracks);
      setPhase('complete');
      onSyncComplete(tracks);
    } catch (err) {
      console.error('Library sync failed:', err);
      setError('Failed to sync library. You can skip and sync later.');
    }
  }, [accessToken, onSyncComplete]);

  useEffect(() => {
    syncLibrary();
  }, [syncLibrary]);

  const getPhaseText = () => {
    switch (phase) {
      case 'checking':
        return 'Checking cache...';
      case 'fetching':
        return `Fetching library... ${progress.current}/${progress.total} tracks`;
      case 'analyzing':
        return `Analyzing tracks... ${progress.current}/${progress.total}`;
      case 'complete':
        return 'Sync complete!';
      case 'skipped':
        return 'Skipped';
    }
  };

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  return (
    <div className="flex flex-col items-center justify-center py-8 space-y-6 px-4">
      {/* Icon */}
      <div className="relative">
        <div className="w-16 h-16 bg-[var(--color-surface)] rounded-full flex items-center justify-center">
          <svg 
            className={`w-8 h-8 text-[var(--color-primary)] ${phase !== 'complete' ? 'animate-pulse' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
            />
          </svg>
        </div>
        {phase !== 'complete' && phase !== 'skipped' && (
          <div className="absolute inset-0 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin" />
        )}
      </div>

      {/* Title */}
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
          Syncing Your Library
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)]">
          {getPhaseText()}
        </p>
      </div>

      {/* Progress bar */}
      {(phase === 'fetching' || phase === 'analyzing') && (
        <div className="w-full max-w-xs">
          <div className="h-2 bg-[var(--color-surface)] rounded-full overflow-hidden">
            <div 
              className="h-full bg-[var(--color-primary)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] text-center mt-2">
            {Math.round(progressPercent)}%
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-center">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Skip button */}
      {phase !== 'complete' && (
        <button
          onClick={() => {
            setPhase('skipped');
            onSkip();
          }}
          className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] 
                     underline underline-offset-2 transition-colors"
        >
          Skip for now
        </button>
      )}
    </div>
  );
};
