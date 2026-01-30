import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseMood, parseMoodQuick } from '../../services/mood/engine';
import * as ollamaService from '../../services/ai/ollama';
import * as embedMatcher from '../../services/mood/embedMatcher';

// Mock dependencies
vi.mock('../../services/ai/ollama');
vi.mock('../../services/mood/embedMatcher');

describe('Integration: Mood Engine Fallback Chain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use exact preset match when available', async () => {
    // Mock matchMood to return exact match
    vi.spyOn(embedMatcher, 'matchMood').mockResolvedValue({
      params: { energy: 0.9, valence: 0.9, danceability: 0.9, tempo: { min: 120, max: 140 }, acousticness: 0 },
      method: 'exact',
      confidence: 1.0,
      category: 'happy'
    });

    const result = await parseMood('happy');
    
    expect(result.method).toBe('preset');
    expect(result.confidence).toBe(1.0);
    expect(embedMatcher.matchMood).toHaveBeenCalled();
  });

  it('should use embedding match when exact match fails', async () => {
    // Mock matchMood to return embedding match
    vi.spyOn(embedMatcher, 'matchMood').mockResolvedValue({
      params: { energy: 0.8, valence: 0.8, danceability: 0.8, tempo: { min: 110, max: 130 }, acousticness: 0.1 },
      method: 'embedding',
      confidence: 0.85,
      category: 'joyful'
    });

    const result = await parseMood('joyful');
    
    expect(result.method).toBe('embedding');
    expect(result.confidence).toBe(0.85);
  });

  it('should fallback to keyword mapping when no match found', async () => {
    // Mock matchMood to return no match
    vi.spyOn(embedMatcher, 'matchMood').mockResolvedValue({
      params: null,
      method: 'none',
      confidence: 0
    });

    // Mock LLM unavailable
    vi.spyOn(ollamaService, 'isOllamaRunning').mockResolvedValue(false);

    const result = await parseMood('unknown mood');
    
    expect(result.method).toBe('keyword');
    expect(result.params).toBeDefined();
    // Verify keyword mapper fallback logic (default params usually)
    expect(result.confidence).toBe(0.5);
  });
});
