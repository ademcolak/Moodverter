// Mood Engine - Unified mood parsing with fallback chain
// Flow: Preset Check → Embedding Match → LLM Parse → Keyword Fallback

import {
  matchMood,
  clearEmbeddingCache,
  findExactMatch,
  findKeywordMatch,
  presetToMoodParams,
  hasEmbeddings,
} from './embedMatcher';
import { parseMoodWithLLM, isLLMAvailable } from './ollamaParser';
import { mapMoodFromKeywords } from './mapper';
import { getOllamaStatus } from '../ai/ollama';
import type { MoodParams, MoodParameters } from '../../types/mood';

export type ParseMethod = 'preset' | 'embedding' | 'llm' | 'keyword' | 'default';

export interface MoodParseResult {
  params: MoodParams;
  method: ParseMethod;
  confidence: number;
  category?: string;
  processingTimeMs: number;
}

export interface EngineStatus {
  ollamaRunning: boolean;
  ollamaModels: string[];
  hasEmbeddings: boolean;
  llmAvailable: boolean;
}

// Cache for parsed moods
const parseCache = new Map<string, MoodParseResult>();
const CACHE_MAX_SIZE = 100;

// Parse mood with full fallback chain
export async function parseMood(input: string): Promise<MoodParseResult> {
  const startTime = performance.now();
  const normalizedInput = input.toLowerCase().trim();

  // Check cache
  const cached = parseCache.get(normalizedInput);
  if (cached) {
    return {
      ...cached,
      processingTimeMs: performance.now() - startTime,
    };
  }

  // 1. Try preset/embedding match first
  const matchResult = await matchMood(normalizedInput);

  if (matchResult.params && matchResult.method !== 'none') {
    const result: MoodParseResult = {
      params: matchResult.params,
      method: matchResult.method === 'exact' ? 'preset' : matchResult.method as ParseMethod,
      confidence: matchResult.confidence,
      category: matchResult.category,
      processingTimeMs: performance.now() - startTime,
    };

    cacheResult(normalizedInput, result);
    return result;
  }

  // 2. Try LLM parsing for complex descriptions
  if (await isLLMAvailable()) {
    const llmResult = await parseMoodWithLLM(input);

    if (llmResult) {
      const result: MoodParseResult = {
        params: llmResult.params,
        method: 'llm',
        confidence: 0.8, // LLM confidence
        processingTimeMs: performance.now() - startTime,
      };

      cacheResult(normalizedInput, result);
      return result;
    }
  }

  // 3. Fall back to keyword mapping
  const keywordParams = mapMoodFromKeywords(input);
  const result: MoodParseResult = {
    params: legacyToMoodParams(keywordParams),
    method: 'keyword',
    confidence: 0.5,
    processingTimeMs: performance.now() - startTime,
  };

  cacheResult(normalizedInput, result);
  return result;
}

// Quick parse - uses only preset/keyword matching (no AI)
export function parseMoodQuick(input: string): MoodParseResult {
  const startTime = performance.now();
  const normalizedInput = input.toLowerCase().trim();

  // Check cache
  const cached = parseCache.get(normalizedInput);
  if (cached && (cached.method === 'preset' || cached.method === 'keyword')) {
    return {
      ...cached,
      processingTimeMs: performance.now() - startTime,
    };
  }

  // Try exact preset match
  const exactMatch = findExactMatch(normalizedInput);
  if (exactMatch) {
    const result: MoodParseResult = {
      params: presetToMoodParams(exactMatch),
      method: 'preset',
      confidence: 1.0,
      category: exactMatch.category,
      processingTimeMs: performance.now() - startTime,
    };

    cacheResult(normalizedInput, result);
    return result;
  }

  // Try keyword preset match
  const keywordMatch = findKeywordMatch(normalizedInput);
  if (keywordMatch && keywordMatch.similarity > 0.3) {
    const result: MoodParseResult = {
      params: presetToMoodParams(keywordMatch.preset),
      method: 'keyword',
      confidence: keywordMatch.similarity,
      category: keywordMatch.preset.category,
      processingTimeMs: performance.now() - startTime,
    };

    cacheResult(normalizedInput, result);
    return result;
  }

  // Fall back to legacy keyword mapper
  const keywordParams = mapMoodFromKeywords(input);
  return {
    params: legacyToMoodParams(keywordParams),
    method: 'default',
    confidence: 0.3,
    processingTimeMs: performance.now() - startTime,
  };
}

// Get engine status
export async function getEngineStatus(): Promise<EngineStatus> {
  const ollamaStatus = await getOllamaStatus();
  const llmAvailable = await isLLMAvailable();

  return {
    ollamaRunning: ollamaStatus.isRunning,
    ollamaModels: ollamaStatus.models,
    hasEmbeddings: hasEmbeddings(),
    llmAvailable,
  };
}

// Convert legacy MoodParameters to MoodParams
export function legacyToMoodParams(legacy: MoodParameters): MoodParams {
  return {
    energy: legacy.energy,
    valence: legacy.valence,
    danceability: legacy.danceability,
    tempo: { min: legacy.tempo_min, max: legacy.tempo_max },
    acousticness: legacy.acousticness,
  };
}

// Convert MoodParams to legacy MoodParameters
export function moodParamsToLegacy(params: MoodParams): MoodParameters {
  return {
    energy: params.energy,
    valence: params.valence,
    danceability: params.danceability,
    acousticness: params.acousticness ?? 0.3,
    tempo_min: params.tempo.min,
    tempo_max: params.tempo.max,
  };
}

// Cache management
function cacheResult(key: string, result: MoodParseResult): void {
  // Evict oldest entries if cache is full
  if (parseCache.size >= CACHE_MAX_SIZE) {
    const firstKey = parseCache.keys().next().value;
    if (firstKey) {
      parseCache.delete(firstKey);
    }
  }

  parseCache.set(key, result);
}

export function clearCache(): void {
  parseCache.clear();
  clearEmbeddingCache();
}

export function getCacheSize(): number {
  return parseCache.size;
}
