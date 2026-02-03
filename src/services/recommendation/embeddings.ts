// Track Embeddings - Generate and manage embeddings for tracks

import { embed, cosineSimilarity, isOllamaRunning } from '../ai/ollama';
import type { UnifiedTrack, AudioFeatures } from '../../types/provider';

// Cache for track embeddings
const embeddingCache = new Map<string, number[]>();
const CACHE_KEY = 'moodverter_track_embeddings';

// Load cache from localStorage
function loadCache(): void {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      Object.entries(data).forEach(([key, value]) => {
        embeddingCache.set(key, value as number[]);
      });
    }
  } catch {
    // Ignore
  }
}

// Save cache to localStorage
function saveCache(): void {
  try {
    const data: Record<string, number[]> = {};
    embeddingCache.forEach((value, key) => {
      data[key] = value;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore
  }
}

// Initialize cache on load
loadCache();

/**
 * Build text representation of a track for embedding
 */
function buildTrackText(track: UnifiedTrack, mood?: string): string {
  const parts = [track.name, track.artist];

  // Add mood if available
  if (mood) {
    parts.push(mood);
  }

  // Add audio feature descriptions
  if (track.audioFeatures) {
    const features = track.audioFeatures;

    if (features.energy > 0.7) parts.push('energetic');
    else if (features.energy < 0.3) parts.push('calm');

    if (features.valence > 0.7) parts.push('happy positive');
    else if (features.valence < 0.3) parts.push('sad melancholic');

    if (features.danceability > 0.7) parts.push('danceable groovy');

    if (features.acousticness > 0.7) parts.push('acoustic unplugged');

    if (features.tempo > 140) parts.push('fast upbeat');
    else if (features.tempo < 80) parts.push('slow');
  }

  return parts.join(' ');
}

/**
 * Get or generate embedding for a track
 */
export async function getTrackEmbedding(
  track: UnifiedTrack,
  mood?: string
): Promise<number[] | null> {
  const cacheKey = `${track.provider}:${track.id}`;

  // Check cache
  const cached = embeddingCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Check if Ollama is available
  if (!(await isOllamaRunning())) {
    return null;
  }

  // Generate embedding
  try {
    const text = buildTrackText(track, mood);
    const embedding = await embed(text);

    embeddingCache.set(cacheKey, embedding);
    saveCache();

    return embedding;
  } catch (error) {
    console.warn('Failed to generate track embedding:', error);
    return null;
  }
}

/**
 * Generate embeddings for multiple tracks
 */
export async function generateTrackEmbeddings(
  tracks: UnifiedTrack[],
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, number[]>> {
  const results = new Map<string, number[]>();

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const embedding = await getTrackEmbedding(track);

    if (embedding) {
      results.set(`${track.provider}:${track.id}`, embedding);
    }

    onProgress?.(i + 1, tracks.length);
  }

  return results;
}

/**
 * Calculate similarity between two tracks
 */
export async function getTrackSimilarity(
  track1: UnifiedTrack,
  track2: UnifiedTrack
): Promise<number> {
  const [emb1, emb2] = await Promise.all([
    getTrackEmbedding(track1),
    getTrackEmbedding(track2),
  ]);

  if (!emb1 || !emb2) {
    // Fall back to audio feature similarity
    return calculateFeatureSimilarity(track1.audioFeatures, track2.audioFeatures);
  }

  return cosineSimilarity(emb1, emb2);
}

/**
 * Calculate similarity based on audio features only
 */
export function calculateFeatureSimilarity(
  features1?: AudioFeatures,
  features2?: AudioFeatures
): number {
  if (!features1 || !features2) {
    return 0.5; // Neutral similarity
  }

  // Weighted feature comparison
  const weights = {
    energy: 0.2,
    valence: 0.2,
    danceability: 0.15,
    tempo: 0.15,
    acousticness: 0.15,
    instrumentalness: 0.1,
    key: 0.05,
  };

  let similarity = 0;

  // Energy similarity
  similarity += weights.energy * (1 - Math.abs(features1.energy - features2.energy));

  // Valence similarity
  similarity += weights.valence * (1 - Math.abs(features1.valence - features2.valence));

  // Danceability similarity
  similarity += weights.danceability * (1 - Math.abs(features1.danceability - features2.danceability));

  // Tempo similarity (normalize to 60-180 range)
  const tempoRange = 120;
  const tempoDiff = Math.abs(features1.tempo - features2.tempo);
  similarity += weights.tempo * Math.max(0, 1 - tempoDiff / tempoRange);

  // Acousticness similarity
  similarity += weights.acousticness * (1 - Math.abs(features1.acousticness - features2.acousticness));

  // Instrumentalness similarity
  similarity += weights.instrumentalness * (1 - Math.abs(features1.instrumentalness - features2.instrumentalness));

  // Key compatibility (using Camelot wheel concept)
  const keyDiff = Math.min(
    Math.abs(features1.key - features2.key),
    12 - Math.abs(features1.key - features2.key)
  );
  const keyCompatible = keyDiff <= 1 || keyDiff === 5; // Same key, adjacent, or relative
  similarity += weights.key * (keyCompatible ? 1 : 0.5);

  return Math.min(1, Math.max(0, similarity));
}

/**
 * Find tracks similar to a query embedding
 */
export function findSimilarByEmbedding(
  queryEmbedding: number[],
  tracks: UnifiedTrack[],
  threshold: number = 0.7,
  limit: number = 10
): Array<{ track: UnifiedTrack; similarity: number }> {
  const results: Array<{ track: UnifiedTrack; similarity: number }> = [];

  for (const track of tracks) {
    const cacheKey = `${track.provider}:${track.id}`;
    const trackEmbedding = embeddingCache.get(cacheKey);

    if (trackEmbedding) {
      const similarity = cosineSimilarity(queryEmbedding, trackEmbedding);

      if (similarity >= threshold) {
        results.push({ track, similarity });
      }
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, limit);
}

/**
 * Clear embedding cache
 */
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
  localStorage.removeItem(CACHE_KEY);
}

/**
 * Get cached embedding count
 */
export function getCachedEmbeddingCount(): number {
  return embeddingCache.size;
}
