// Recommendations - Display similar tracks based on current playing track

import { useState, useEffect, useCallback } from 'react';
import type { UnifiedTrack } from '../types/provider';
import type { MoodParams } from '../types/mood';
import { getQuickRecommendations, getHybridRecommendations, type Recommendation } from '../services/recommendation';

interface RecommendationsProps {
  currentTrack: UnifiedTrack | null;
  moodParams: MoodParams | null;
  library: UnifiedTrack[];
  onTrackSelect?: (track: UnifiedTrack) => void;
  onAddToQueue?: (track: UnifiedTrack) => void;
  maxItems?: number;
}

export const Recommendations = ({
  currentTrack,
  moodParams,
  library,
  onTrackSelect,
  onAddToQueue,
  maxItems = 5,
}: RecommendationsProps) => {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Get recommendations when track or mood changes
  const fetchRecommendations = useCallback(async () => {
    if (!currentTrack && !moodParams) {
      setRecommendations([]);
      return;
    }

    if (library.length === 0) {
      setRecommendations([]);
      return;
    }

    setLoading(true);

    try {
      // Quick recommendations first (sync)
      if (currentTrack) {
        const quickRecs = getQuickRecommendations(currentTrack, library, maxItems);
        setRecommendations(quickRecs);
      }

      // Then try hybrid recommendations (async, may use embeddings)
      if (moodParams) {
        const hybridRecs = await getHybridRecommendations(
          currentTrack,
          moodParams,
          library,
          { limit: maxItems }
        );
        setRecommendations(hybridRecs);
      }
    } catch (error) {
      console.error('Failed to get recommendations:', error);
    } finally {
      setLoading(false);
    }
  }, [currentTrack, moodParams, library, maxItems]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Handle track click
  const handleTrackClick = (track: UnifiedTrack) => {
    onTrackSelect?.(track);
  };

  // Handle add to queue
  const handleAddToQueue = (track: UnifiedTrack, e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToQueue?.(track);
  };

  // Get reason text
  const getReasonText = (reason: Recommendation['reason']): string => {
    switch (reason) {
      case 'similar_embedding':
        return 'Benzer';
      case 'similar_features':
        return 'Ses ozellikleri';
      case 'mood_match':
        return 'Mood uyumu';
      case 'genre_match':
        return 'Ayni tur';
      case 'artist_match':
        return 'Ayni sanatci';
      default:
        return '';
    }
  };

  // Format score as percentage
  const formatScore = (score: number): string => {
    return `${Math.round(score * 100)}%`;
  };

  if (recommendations.length === 0 && !loading) {
    return null;
  }

  const displayedRecs = expanded ? recommendations : recommendations.slice(0, 3);

  return (
    <div className="border-t border-white/5 pt-2 mt-2">
      {/* Header */}
      <div className="flex items-center justify-between px-2 mb-2">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-[var(--color-text-secondary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">
            Benzer Sarkilar
          </span>
          {loading && (
            <div className="w-2 h-2 border border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {recommendations.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
          >
            {expanded ? 'Daha az' : `+${recommendations.length - 3} daha`}
          </button>
        )}
      </div>

      {/* Recommendations list */}
      <div className="space-y-1">
        {displayedRecs.map((rec, index) => (
          <div
            key={`${rec.track.id}-${index}`}
            onClick={() => handleTrackClick(rec.track)}
            className="flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10 cursor-pointer group transition-colors"
          >
            {/* Thumbnail */}
            <div className="w-8 h-8 flex-shrink-0 bg-black/20 overflow-hidden">
              {rec.track.albumArt ? (
                <img
                  src={rec.track.albumArt}
                  alt={rec.track.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white/20" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-xs text-[var(--color-text-primary)] truncate">
                {rec.track.name}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-[var(--color-text-secondary)] truncate">
                  {rec.track.artist}
                </span>
                <span className="text-[8px] text-[var(--color-primary)] opacity-70">
                  {getReasonText(rec.reason)}
                </span>
              </div>
            </div>

            {/* Score */}
            <div className="text-[10px] text-[var(--color-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity">
              {formatScore(rec.score)}
            </div>

            {/* Add to queue button */}
            {onAddToQueue && (
              <button
                onClick={(e) => handleAddToQueue(rec.track, e)}
                className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                title="Siraya ekle"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
