import { MoodParameters } from '../../types/mood';
import { Track, TrackScore } from '../../types/track';
import { calculateTotalScore, calculateMoodScore } from './scorer';

interface SelectionOptions {
  moodParams: MoodParameters;
  currentTrack: Track | null;
  recentTracks: Track[];
  includeRecommendations: boolean;
  topN?: number;
}

// Track history for repeat prevention
const RECENT_TRACKS_LIMIT = 20;

// Select the next track from a pool
export const selectNextTrack = (
  trackPool: Track[],
  options: SelectionOptions
): TrackScore | null => {
  const { moodParams, currentTrack, recentTracks, topN = 5 } = options;

  if (trackPool.length === 0) return null;

  // Get recent artists for diversity
  const recentArtists = new Set(recentTracks.map(t => t.artist));

  // Get recent track IDs for repeat prevention
  const recentTrackIds = new Set(recentTracks.slice(-RECENT_TRACKS_LIMIT).map(t => t.spotifyId));

  // Filter out recently played tracks
  const availableTracks = trackPool.filter(t => !recentTrackIds.has(t.spotifyId));

  if (availableTracks.length === 0) {
    // All tracks recently played, allow any
    return selectFromPool(trackPool, moodParams, currentTrack, recentArtists, topN);
  }

  return selectFromPool(availableTracks, moodParams, currentTrack, recentArtists, topN);
};

// Internal selection from pool
const selectFromPool = (
  pool: Track[],
  moodParams: MoodParameters,
  currentTrack: Track | null,
  recentArtists: Set<string>,
  topN: number
): TrackScore | null => {
  // Score all tracks
  const scoredTracks: TrackScore[] = pool.map(track => {
    const totalScore = calculateTotalScore(
      track,
      moodParams,
      currentTrack,
      recentArtists
    );
    const moodScore = calculateMoodScore(track, moodParams);
    
    return {
      track,
      moodScore,
      transitionScore: totalScore - moodScore * 0.6, // Extract transition portion
      totalScore,
    };
  });

  // Sort by total score
  scoredTracks.sort((a, b) => b.totalScore - a.totalScore);

  // Get top N candidates
  const topCandidates = scoredTracks.slice(0, topN);

  if (topCandidates.length === 0) return null;

  // Weighted random selection from top candidates
  return weightedRandomSelect(topCandidates);
};

// Weighted random selection (higher scores more likely)
const weightedRandomSelect = (candidates: TrackScore[]): TrackScore => {
  // Normalize scores to probabilities
  const totalScore = candidates.reduce((sum, c) => sum + c.totalScore, 0);
  const probabilities = candidates.map(c => c.totalScore / totalScore);

  // Random selection based on probabilities
  const random = Math.random();
  let cumulative = 0;

  for (let i = 0; i < candidates.length; i++) {
    cumulative += probabilities[i];
    if (random <= cumulative) {
      return candidates[i];
    }
  }

  // Fallback to first (highest scored)
  return candidates[0];
};

// Build a candidate pool from library and recommendations
export const buildCandidatePool = (
  libraryTracks: Track[],
  recommendedTracks: Track[],
  options: {
    includeRecommendations: boolean;
    maxLibraryTracks?: number;
    maxRecommendedTracks?: number;
  }
): Track[] => {
  const {
    includeRecommendations,
    maxLibraryTracks = 500,
    maxRecommendedTracks = 50,
  } = options;

  // Start with library tracks
  const pool = libraryTracks.slice(0, maxLibraryTracks);

  // Add recommendations if enabled
  if (includeRecommendations && recommendedTracks.length > 0) {
    const recs = recommendedTracks.slice(0, maxRecommendedTracks);
    
    // Add only recommendations not already in library
    const libraryIds = new Set(pool.map(t => t.spotifyId));
    const newRecs = recs.filter(t => !libraryIds.has(t.spotifyId));
    
    pool.push(...newRecs);
  }

  return pool;
};

// Filter tracks based on mood parameters (pre-filtering for large pools)
export const preFilterTracks = (
  tracks: Track[],
  moodParams: MoodParameters,
  _threshold = 0.3
): Track[] => {
  return tracks.filter(track => {
    // Quick energy/valence check
    const energyDiff = Math.abs(track.energy - moodParams.energy);
    const valenceDiff = Math.abs(track.valence - moodParams.valence);
    
    // Must be within reasonable range
    if (energyDiff > 0.5 || valenceDiff > 0.5) return false;
    
    // Tempo check
    const tempoOk = track.tempo >= moodParams.tempo_min - 20 &&
                    track.tempo <= moodParams.tempo_max + 20;
    
    return tempoOk;
  });
};

// Get diversity-aware track selection
export const selectWithDiversity = (
  trackPool: Track[],
  options: SelectionOptions,
  numTracks: number
): Track[] => {
  const selected: Track[] = [];
  const selectedArtists = new Set<string>();
  let remainingPool = [...trackPool];

  for (let i = 0; i < numTracks && remainingPool.length > 0; i++) {
    const result = selectNextTrack(remainingPool, {
      ...options,
      currentTrack: selected.length > 0 ? selected[selected.length - 1] : options.currentTrack,
      recentTracks: [...options.recentTracks, ...selected],
    });

    if (result) {
      selected.push(result.track);
      selectedArtists.add(result.track.artist);
      
      // Remove selected track from pool
      remainingPool = remainingPool.filter(t => t.spotifyId !== result.track.spotifyId);
    }
  }

  return selected;
};
