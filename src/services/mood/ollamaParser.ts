// Ollama LLM Parser
// Uses local LLM for complex mood descriptions

import { generate, parseJsonResponse, isOllamaRunning } from '../ai/ollama';
import type { MoodParams } from '../../types/mood';

// Prompt template for mood parsing
const MOOD_PARSE_PROMPT = `You are a music mood analyzer. Given a mood description, extract musical parameters.

Input: "{input}"

Respond with ONLY a JSON object (no explanation):
{
  "energy": 0.0-1.0,      // Low=calm, High=intense
  "valence": 0.0-1.0,     // Low=sad/dark, High=happy/bright
  "danceability": 0.0-1.0, // How suitable for dancing
  "tempo": {"min": 60-200, "max": 60-200}, // BPM range
  "acousticness": 0.0-1.0, // Acoustic vs electronic (optional)
  "instrumentalness": 0.0-1.0 // No vocals preference (optional)
}

Guidelines:
- "energetic/pumped" → high energy (0.7-0.9), high tempo (120-150)
- "sad/melancholic" → low valence (0.1-0.3), low energy (0.2-0.4)
- "chill/relaxed" → moderate energy (0.3-0.5), moderate tempo (80-110)
- "party/dance" → high danceability (0.8-0.9), high energy
- Consider language (English and Turkish descriptions)`;

// System prompt for consistent behavior
const SYSTEM_PROMPT = `You are a music mood parameter extractor. You only output valid JSON. No explanations.`;

export interface LLMParseResult {
  params: MoodParams;
  rawResponse: string;
}

// Parse mood using Ollama LLM
export async function parseMoodWithLLM(input: string): Promise<LLMParseResult | null> {
  // Check if Ollama is running
  const available = await isOllamaRunning();
  if (!available) {
    return null;
  }

  try {
    const prompt = MOOD_PARSE_PROMPT.replace('{input}', input);

    const response = await generate(prompt, {
      system: SYSTEM_PROMPT,
      temperature: 0.2, // Low temperature for consistent output
      maxTokens: 300,
    });

    const parsed = parseJsonResponse<{
      energy?: number;
      valence?: number;
      danceability?: number;
      tempo?: { min?: number; max?: number };
      acousticness?: number;
      instrumentalness?: number;
    }>(response);

    if (!parsed) {
      console.warn('Failed to parse LLM response:', response);
      return null;
    }

    // Validate and clamp values
    const params: MoodParams = {
      energy: clamp(parsed.energy ?? 0.5, 0, 1),
      valence: clamp(parsed.valence ?? 0.5, 0, 1),
      danceability: clamp(parsed.danceability ?? 0.5, 0, 1),
      tempo: {
        min: clamp(parsed.tempo?.min ?? 80, 40, 200),
        max: clamp(parsed.tempo?.max ?? 130, 40, 200),
      },
    };

    // Add optional params if present
    if (parsed.acousticness !== undefined) {
      params.acousticness = clamp(parsed.acousticness, 0, 1);
    }
    if (parsed.instrumentalness !== undefined) {
      params.instrumentalness = clamp(parsed.instrumentalness, 0, 1);
    }

    // Ensure min <= max for tempo
    if (params.tempo.min > params.tempo.max) {
      [params.tempo.min, params.tempo.max] = [params.tempo.max, params.tempo.min];
    }

    return {
      params,
      rawResponse: response,
    };
  } catch (error) {
    console.error('LLM parsing failed:', error);
    return null;
  }
}

// Helper to clamp value
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// Check if LLM parsing is available
export async function isLLMAvailable(): Promise<boolean> {
  return isOllamaRunning();
}
