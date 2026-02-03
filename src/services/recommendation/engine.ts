// Recommendation Engine - Find similar tracks and mood-based recommendations

import {
  getTrackEmbedding,
  findSimilarByEmbedding,
  calculateFeatureSimilarity,
} from './embeddings';
import { isOllamaRunning } from '../ai/ollama';
import type { UnifiedTrack, AudioFeatures } from '../../types/provider';
import type { MoodParams } from '../../types/mood';

export interface Recommendation {
  track: UnifiedTrack;
  score: number;
  reason: RecommendationReason;
}

export type RecommendationReason =
  | 'similar_embedding'
  | 'similar_features'
  | 'mood_match'
  | 'genre_match'
  | 'artist_match';

export interface RecommendationOptions {
  limit?: number;
  excludeIds?: Set<string>;
  minScore?: number;
  includeArtistMatch?: boolean;
  diversityFactor?: number; // 0-1, higher = more diverse
}

const DEFAULT_OPTIONS: Required<RecommendationOptions> = {
  limit: 10,
  excludeIds: new Set(),
  minScore: 0.5,
  includeArtistMatch: true,
  diversityFactor: 0.3,
};

/**
 * Get recommendations based on a reference track
 */
export async function getRecommendations(
  currentTrack: UnifiedTrack,
  library: UnifiedTrack[],
  options: RecommendationOptions = {}
): Promise<Recommendation[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const recommendations: Recommendation[] = [];

  // Filter out excluded tracks and the current track
  const candidates = library.filter(
    t => t.id !== currentTrack.id && !opts.excludeIds.has(t.id)
  );

  if (candidates.length === 0) {
    return [];
  }

  // Try embedding-based recommendations first
  if (await isOllamaRunning()) {
    const embeddingRecs = await getEmbeddingRecommendations(currentTrack, candidates, opts);
    recommendations.push(...embeddingRecs);
  }

  // Add feature-based recommendations
  const featureRecs = getFeatureRecommendations(currentTrack, candidates, opts);
  recommendations.push(...featureRecs);

  // Add artist-based recommendations if enabled
  if (opts.includeArtistMatch) {
    const artistRecs = getArtistRecommendations(currentTrack, candidates);
    recommendations.push(...artistRecs);
  }

  // Deduplicate and sort
  const deduplicated = deduplicateRecommendations(recommendations);

  // Apply diversity if needed
  const diverse = opts.diversityFactor > 0
    ? applyDiversity(deduplicated, opts.diversityFactor)
    : deduplicated;

  return diverse.slice(0, opts.limit);
}

/**
 * Get recommendations based on current mood
 */
export async function getMoodRecommendations(
  moodParams: MoodParams,
  library: UnifiedTrack[],
  options: RecommendationOptions = {}
): Promise<Recommendation[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const recommendations: Recommendation[] = [];

  for (const track of library) {
    if (opts.excludeIds.has(track.id)) continue;
    if (!track.audioFeatures) continue;

    const score = calculateMoodMatchScore(moodParams, track.audioFeatures);

    if (score >= opts.minScore) {
      recommendations.push({
        track,
        score,
        reason: 'mood_match',
      });
    }
  }

  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);

  return recommendations.slice(0, opts.limit);
}

/**
 * Get hybrid recommendations (track + mood combined)
 */
export async function getHybridRecommendations(
  currentTrack: UnifiedTrack | null,
  moodParams: MoodParams,
  library: UnifiedTrack[],
  options: RecommendationOptions = {}
): Promise<Recommendation[]> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // If no current track, just use mood recommendations
  if (!currentTrack) {
    return getMoodRecommendations(moodParams, library, opts);
  }

  // Get both types of recommendations
  const [trackRecs, moodRecs] = await Promise.all([
    getRecommendations(currentTrack, library, { ...opts, limit: opts.limit * 2 }),
    getMoodRecommendations(moodParams, library, { ...opts, limit: opts.limit * 2 }),
  ]);

  // Combine and weight
  const combined = new Map<string, Recommendation>();

  // Track-based recommendations (60% weight)
  for (const rec of trackRecs) {
    combined.set(rec.track.id, {
      ...rec,
      score: rec.score * 0.6,
    });
  }

  // Mood-based recommendations (40% weight)
  for (const rec of moodRecs) {
    const existing = combined.get(rec.track.id);
    if (existing) {
      existing.score += rec.score * 0.4;
    } else {
      combined.set(rec.track.id, {
        ...rec,
        score: rec.score * 0.4,
      });
    }
  }

  const results = Array.from(combined.values());
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, opts.limit);
}

// =============================================================================
// Helper Functions
// =============================================================================

async function getEmbeddingRecommendations(
  track: UnifiedTrack,
  candidates: UnifiedTrack[],
  opts: Required<RecommendationOptions>
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  try {
    const trackEmbedding = await getTrackEmbedding(track);
    if (!trackEmbedding) return [];

    const similar = findSimilarByEmbedding(
      trackEmbedding,
      candidates,
      opts.minScore,
      opts.limit * 2
    );

    for (const item of similar) {
      recommendations.push({
        track: item.track,
        score: item.similarity,
        reason: 'similar_embedding',
      });
    }
  } catch (error) {
    console.warn('Embedding recommendations failed:', error);
  }

  return recommendations;
}

function getFeatureRecommendations(
  track: UnifiedTrack,
  candidates: UnifiedTrack[],
  opts: Required<RecommendationOptions>
): Recommendation[] {
  const recommendations: Recommendation[] = [];

  if (!track.audioFeatures) return [];

  for (const candidate of candidates) {
    if (!candidate.audioFeatures) continue;

    const similarity = calculateFeatureSimilarity(
      track.audioFeatures,
      candidate.audioFeatures
    );

    if (similarity >= opts.minScore) {
      recommendations.push({
        track: candidate,
        score: similarity,
        reason: 'similar_features',
      });
    }
  }

  return recommendations;
}

function getArtistRecommendations(
  track: UnifiedTrack,
  candidates: UnifiedTrack[]
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const trackArtist = track.artist.toLowerCase();

  for (const candidate of candidates) {
    const candidateArtist = candidate.artist.toLowerCase();

    if (candidateArtist === trackArtist) {
      recommendations.push({
        track: candidate,
        score: 0.7, // Same artist bonus
        reason: 'artist_match',
      });
    }
  }

  return recommendations;
}

function calculateMoodMatchScore(
  moodParams: MoodParams,
  features: AudioFeatures
): number {
  let score = 0;
  let weights = 0;

  // Energy match
  const energyDiff = Math.abs(moodParams.energy - features.energy);
  score += (1 - energyDiff) * 0.3;
  weights += 0.3;

  // Valence match
  const valenceDiff = Math.abs(moodParams.valence - features.valence);
  score += (1 - valenceDiff) * 0.3;
  weights += 0.3;

  // Danceability match
  const danceDiff = Math.abs(moodParams.danceability - features.danceability);
  score += (1 - danceDiff) * 0.2;
  weights += 0.2;

  // Tempo match
  const tempoInRange =
    features.tempo >= moodParams.tempo.min &&
    features.tempo <= moodParams.tempo.max;
  score += tempoInRange ? 0.15 : 0;
  weights += 0.15;

  // Acousticness match (if specified)
  if (moodParams.acousticness !== undefined) {
    const acousticDiff = Math.abs(moodParams.acousticness - features.acousticness);
    score += (1 - acousticDiff) * 0.05;
    weights += 0.05;
  }

  return weights > 0 ? score / weights : 0.5;
}

function deduplicateRecommendations(
  recommendations: Recommendation[]
): Recommendation[] {
  const seen = new Map<string, Recommendation>();

  for (const rec of recommendations) {
    const existing = seen.get(rec.track.id);
    if (!existing || rec.score > existing.score) {
      seen.set(rec.track.id, rec);
    }
  }

  const results = Array.from(seen.values());
  results.sort((a, b) => b.score - a.score);

  return results;
}

function applyDiversity(
  recommendations: Recommendation[],
  factor: number
): Recommendation[] {
  if (recommendations.length <= 2) return recommendations;

  const result: Recommendation[] = [];
  const artistCounts = new Map<string, number>();

  for (const rec of recommendations) {
    const artist = rec.track.artist.toLowerCase();
    const artistCount = artistCounts.get(artist) || 0;

    // Apply penalty for repeated artists
    const penalty = artistCount * factor * 0.2;
    const adjustedScore = rec.score * (1 - penalty);

    if (adjustedScore > 0.3) {
      result.push({ ...rec, score: adjustedScore });
      artistCounts.set(artist, artistCount + 1);
    }
  }

  result.sort((a, b) => b.score - a.score);
  return result;
}

/**
 * Get quick recommendations without embedding (faster, less accurate)
 */
export function getQuickRecommendations(
  currentTrack: UnifiedTrack,
  library: UnifiedTrack[],
  limit: number = 5
): Recommendation[] {
  const candidates = library.filter(t => t.id !== currentTrack.id);
  const recommendations: Recommendation[] = [];

  for (const candidate of candidates) {
    let score = 0;

    // Audio features similarity
    if (currentTrack.audioFeatures && candidate.audioFeatures) {
      score = calculateFeatureSimilarity(
        currentTrack.audioFeatures,
        candidate.audioFeatures
      );
    }

    // Artist bonus
    if (currentTrack.artist.toLowerCase() === candidate.artist.toLowerCase()) {
      score = Math.min(1, score + 0.2);
    }

    if (score >= 0.4) {
      recommendations.push({
        track: candidate,
        score,
        reason: 'similar_features',
      });
    }
  }

  recommendations.sort((a, b) => b.score - a.score);
  return recommendations.slice(0, limit);
}
