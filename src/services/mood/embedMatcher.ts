// Embedding-Based Mood Matcher
// Uses cosine similarity to find the best matching mood preset

import { embed, cosineSimilarity, isOllamaRunning } from '../ai/ollama';
import presetsData from '../../data/mood-presets.json';
import type { MoodParams } from '../../types/mood';

export interface MoodPreset {
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

export interface MatchResult {
  preset: MoodPreset;
  similarity: number;
  matchedPhrase?: string;
}

// Confidence threshold for embedding match
const CONFIDENCE_THRESHOLD = 0.75;

// Cache for input embeddings
const embeddingCache = new Map<string, number[]>();

// Get all presets
export function getPresets(): MoodPreset[] {
  return presetsData.presets as MoodPreset[];
}

// Check if presets have embeddings
export function hasEmbeddings(): boolean {
  const presets = getPresets();
  return presets.some(p => p.embeddings && p.embeddings.length > 0);
}

// Exact match against preset phrases
export function findExactMatch(input: string): MoodPreset | null {
  const normalized = input.toLowerCase().trim();
  const presets = getPresets();

  for (const preset of presets) {
    if (preset.category === normalized) {
      return preset;
    }
    for (const phrase of preset.phrases) {
      if (phrase.toLowerCase() === normalized) {
        return preset;
      }
    }
  }

  return null;
}

// Keyword-based match (fallback when Ollama not available)
export function findKeywordMatch(input: string): MatchResult | null {
  const normalized = input.toLowerCase();
  const words = normalized.split(/\s+/);
  const presets = getPresets();

  let bestMatch: MatchResult | null = null;
  let bestScore = 0;

  for (const preset of presets) {
    let score = 0;
    let matchedPhrase: string | undefined;

    // Check category
    if (normalized.includes(preset.category)) {
      score += 2;
      matchedPhrase = preset.category;
    }

    // Check phrases
    for (const phrase of preset.phrases) {
      const phraseWords = phrase.toLowerCase().split(/\s+/);

      // Exact phrase match
      if (normalized.includes(phrase.toLowerCase())) {
        score += 3;
        matchedPhrase = phrase;
      }
      // Word overlap
      else {
        for (const word of phraseWords) {
          if (words.includes(word) && word.length > 2) {
            score += 1;
            if (!matchedPhrase) matchedPhrase = phrase;
          }
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        preset,
        similarity: Math.min(score / 5, 1), // Normalize to 0-1
        matchedPhrase,
      };
    }
  }

  return bestMatch && bestMatch.similarity > 0.2 ? bestMatch : null;
}

// Embedding-based match using Ollama
export async function findEmbeddingMatch(input: string): Promise<MatchResult | null> {
  // Check if Ollama is available
  const ollamaAvailable = await isOllamaRunning();
  if (!ollamaAvailable) {
    return null;
  }

  // Check if presets have embeddings
  if (!hasEmbeddings()) {
    return null;
  }

  // Get or compute input embedding
  let inputEmbedding = embeddingCache.get(input);
  if (!inputEmbedding) {
    try {
      inputEmbedding = await embed(input);
      embeddingCache.set(input, inputEmbedding);
    } catch (error) {
      console.error('Failed to embed input:', error);
      return null;
    }
  }

  const presets = getPresets();
  let bestMatch: MatchResult | null = null;
  let bestSimilarity = -1;

  for (const preset of presets) {
    if (!preset.embeddings || preset.embeddings.length === 0) {
      continue;
    }

    // Find best matching phrase embedding
    for (let i = 0; i < preset.embeddings.length; i++) {
      const similarity = cosineSimilarity(inputEmbedding, preset.embeddings[i]);

      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = {
          preset,
          similarity,
          matchedPhrase: preset.phrases[i],
        };
      }
    }
  }

  // Only return if confidence is above threshold
  if (bestMatch && bestMatch.similarity >= CONFIDENCE_THRESHOLD) {
    return bestMatch;
  }

  return null;
}

// Convert preset params to MoodParams
export function presetToMoodParams(preset: MoodPreset): MoodParams {
  return {
    energy: preset.params.energy,
    valence: preset.params.valence,
    danceability: preset.params.danceability,
    tempo: preset.params.tempo,
    acousticness: preset.params.acousticness,
    instrumentalness: preset.params.instrumentalness,
  };
}

// Combined matcher - tries all methods in order
export async function matchMood(input: string): Promise<{
  params: MoodParams | null;
  method: 'exact' | 'embedding' | 'keyword' | 'none';
  confidence: number;
  category?: string;
}> {
  // 1. Try exact match first (instant)
  const exactMatch = findExactMatch(input);
  if (exactMatch) {
    return {
      params: presetToMoodParams(exactMatch),
      method: 'exact',
      confidence: 1.0,
      category: exactMatch.category,
    };
  }

  // 2. Try embedding match (requires Ollama)
  const embeddingMatch = await findEmbeddingMatch(input);
  if (embeddingMatch) {
    return {
      params: presetToMoodParams(embeddingMatch.preset),
      method: 'embedding',
      confidence: embeddingMatch.similarity,
      category: embeddingMatch.preset.category,
    };
  }

  // 3. Fall back to keyword matching
  const keywordMatch = findKeywordMatch(input);
  if (keywordMatch) {
    return {
      params: presetToMoodParams(keywordMatch.preset),
      method: 'keyword',
      confidence: keywordMatch.similarity,
      category: keywordMatch.preset.category,
    };
  }

  // No match found
  return {
    params: null,
    method: 'none',
    confidence: 0,
  };
}

// Clear embedding cache
export function clearEmbeddingCache(): void {
  embeddingCache.clear();
}
