// Metadata Mood Analyzer - Analyze song mood from title/artist using Ollama embeddings

import { embed, cosineSimilarity, isOllamaRunning } from '../ai/ollama';
import { extractVideoMetadata, getCachedMetadata } from '../youtube/metadata';
import type { VideoMetadata } from '../../types/youtube';
import type { AudioFeatures } from '../../types/provider';
import type { MoodParams } from '../../types/mood';
import moodPresets from '../../data/mood-presets.json';

export interface MetadataAnalysisResult {
  suggestedMood: string;
  confidence: number;
  audioParams: AudioFeatures;
  genres: string[];
  moods: string[];
  method: 'embedding' | 'keyword' | 'fallback';
}

// Cache for song embeddings
const embeddingCache = new Map<string, number[]>();
const analysisCache = new Map<string, MetadataAnalysisResult>();

// Preset type from JSON
interface MoodPreset {
  category: string;
  phrases: string[];
  params: {
    energy: number;
    valence: number;
    danceability: number;
    tempo: { min: number; max: number };
    acousticness?: number;
    instrumentalness?: number;
  };
  embeddings: number[][];
}

/**
 * Analyze song metadata to determine mood and audio parameters
 */
export async function analyzeSongMetadata(
  title: string,
  artist: string,
  videoId?: string
): Promise<MetadataAnalysisResult> {
  const cacheKey = `${title}|${artist}`.toLowerCase();

  // Check cache
  const cached = analysisCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Try to get additional metadata if video ID is provided
  let metadata: VideoMetadata | null = null;
  if (videoId) {
    metadata = getCachedMetadata(videoId);
    if (!metadata) {
      try {
        metadata = await extractVideoMetadata(videoId);
      } catch {
        // Continue without metadata
      }
    }
  }

  // Build text for embedding
  const textForEmbedding = buildEmbeddingText(title, artist, metadata);

  // Try embedding-based matching first
  if (await isOllamaRunning() && hasPresetEmbeddings()) {
    try {
      const result = await analyzeWithEmbeddings(textForEmbedding, metadata);
      analysisCache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.warn('Embedding analysis failed:', error);
    }
  }

  // Fall back to keyword-based analysis
  const result = analyzeWithKeywords(title, artist, metadata);
  analysisCache.set(cacheKey, result);
  return result;
}

/**
 * Build text string for embedding generation
 */
function buildEmbeddingText(
  title: string,
  artist: string,
  metadata: VideoMetadata | null
): string {
  const parts = [title, artist];

  if (metadata) {
    if (metadata.genres.length > 0) {
      parts.push(...metadata.genres);
    }
    if (metadata.moods.length > 0) {
      parts.push(...metadata.moods);
    }
    if (metadata.tags.length > 0) {
      // Add first few relevant tags
      parts.push(...metadata.tags.slice(0, 5));
    }
  }

  return parts.join(' ');
}

/**
 * Check if presets have embeddings
 */
function hasPresetEmbeddings(): boolean {
  const presets = moodPresets.presets as MoodPreset[];
  return presets.some(p => p.embeddings && p.embeddings.length > 0 && p.embeddings[0].length > 0);
}

/**
 * Analyze using Ollama embeddings
 */
async function analyzeWithEmbeddings(
  text: string,
  metadata: VideoMetadata | null
): Promise<MetadataAnalysisResult> {
  // Get or generate embedding for the song
  let songEmbedding = embeddingCache.get(text);
  if (!songEmbedding) {
    songEmbedding = await embed(text);
    embeddingCache.set(text, songEmbedding);
  }

  // Find best matching preset
  let bestMatch: MoodPreset | null = null;
  let bestSimilarity = -1;

  const presets = moodPresets.presets as MoodPreset[];

  for (const preset of presets) {
    if (!preset.embeddings || preset.embeddings.length === 0) continue;

    // Check similarity against all phrase embeddings
    for (const presetEmbedding of preset.embeddings) {
      if (presetEmbedding.length === 0) continue;

      const similarity = cosineSimilarity(songEmbedding, presetEmbedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = preset;
      }
    }
  }

  if (bestMatch && bestSimilarity > 0.5) {
    return {
      suggestedMood: bestMatch.category,
      confidence: bestSimilarity,
      audioParams: presetToAudioFeatures(bestMatch),
      genres: metadata?.genres || [],
      moods: metadata?.moods || [],
      method: 'embedding',
    };
  }

  // Fall back to keyword analysis
  return analyzeWithKeywords(
    text.split(' ')[0] || '',
    text.split(' ').slice(1).join(' ') || '',
    metadata
  );
}

/**
 * Analyze using keyword matching
 */
function analyzeWithKeywords(
  title: string,
  artist: string,
  metadata: VideoMetadata | null
): MetadataAnalysisResult {
  const searchText = [
    title.toLowerCase(),
    artist.toLowerCase(),
    ...(metadata?.genres || []).map(g => g.toLowerCase()),
    ...(metadata?.moods || []).map(m => m.toLowerCase()),
    ...(metadata?.tags || []).map(t => t.toLowerCase()),
  ].join(' ');

  // Score each preset based on keyword matches
  let bestMatch: MoodPreset | null = null;
  let bestScore = 0;

  const presets = moodPresets.presets as MoodPreset[];

  for (const preset of presets) {
    let score = 0;

    for (const phrase of preset.phrases) {
      if (searchText.includes(phrase.toLowerCase())) {
        score += 1;
      }
    }

    // Bonus for category match
    if (searchText.includes(preset.category.toLowerCase())) {
      score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = preset;
    }
  }

  if (bestMatch && bestScore > 0) {
    const confidence = Math.min(1, bestScore / 3); // Normalize to 0-1

    return {
      suggestedMood: bestMatch.category,
      confidence,
      audioParams: presetToAudioFeatures(bestMatch),
      genres: metadata?.genres || [],
      moods: metadata?.moods || [],
      method: 'keyword',
    };
  }

  // Default fallback
  return {
    suggestedMood: 'neutral',
    confidence: 0.3,
    audioParams: getDefaultAudioFeatures(),
    genres: metadata?.genres || [],
    moods: metadata?.moods || [],
    method: 'fallback',
  };
}

/**
 * Convert preset params to AudioFeatures
 */
function presetToAudioFeatures(preset: MoodPreset): AudioFeatures {
  const params = preset.params;
  const avgTempo = (params.tempo.min + params.tempo.max) / 2;

  return {
    energy: params.energy,
    valence: params.valence,
    danceability: params.danceability,
    tempo: avgTempo,
    acousticness: params.acousticness ?? 0.3,
    instrumentalness: params.instrumentalness ?? 0.1,
    key: 0, // Unknown
    mode: params.valence > 0.5 ? 1 : 0, // Major if positive
  };
}

/**
 * Get default audio features for fallback
 */
function getDefaultAudioFeatures(): AudioFeatures {
  return {
    energy: 0.5,
    valence: 0.5,
    danceability: 0.5,
    tempo: 120,
    acousticness: 0.3,
    instrumentalness: 0.1,
    key: 0,
    mode: 1,
  };
}

/**
 * Batch analyze multiple songs
 */
export async function analyzeMetadataBatch(
  songs: Array<{ title: string; artist: string; videoId?: string }>,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, MetadataAnalysisResult>> {
  const results = new Map<string, MetadataAnalysisResult>();

  for (let i = 0; i < songs.length; i++) {
    const song = songs[i];
    const key = `${song.title}|${song.artist}`.toLowerCase();

    try {
      const result = await analyzeSongMetadata(song.title, song.artist, song.videoId);
      results.set(key, result);
    } catch (error) {
      console.warn(`Failed to analyze ${song.title}:`, error);
    }

    onProgress?.(i + 1, songs.length);
  }

  return results;
}

/**
 * Clear analysis cache
 */
export function clearAnalysisCache(): void {
  embeddingCache.clear();
  analysisCache.clear();
}

/**
 * Get suggested mood params from analysis
 */
export function analysisToMoodParams(analysis: MetadataAnalysisResult): MoodParams {
  const { audioParams } = analysis;

  return {
    energy: audioParams.energy,
    valence: audioParams.valence,
    danceability: audioParams.danceability,
    tempo: {
      min: Math.max(60, audioParams.tempo - 15),
      max: Math.min(200, audioParams.tempo + 15),
    },
    acousticness: audioParams.acousticness,
  };
}
