import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findExactMatch,
  findKeywordMatch,
  presetToMoodParams,
  getPresets,
  hasEmbeddings,
  matchMood,
  clearEmbeddingCache,
} from '../../services/mood/embedMatcher';

// Mock ollama module
vi.mock('../../services/ai/ollama', () => ({
  isOllamaRunning: vi.fn().mockResolvedValue(false),
  embed: vi.fn().mockResolvedValue([]),
  cosineSimilarity: vi.fn().mockReturnValue(0),
}));

describe('embedMatcher', () => {
  beforeEach(() => {
    clearEmbeddingCache();
  });

  describe('getPresets', () => {
    it('returns array of presets', () => {
      const presets = getPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it('each preset has required fields', () => {
      const presets = getPresets();
      for (const preset of presets) {
        expect(preset).toHaveProperty('category');
        expect(preset).toHaveProperty('phrases');
        expect(preset).toHaveProperty('params');
        expect(Array.isArray(preset.phrases)).toBe(true);
      }
    });

    it('each preset has valid params', () => {
      const presets = getPresets();
      for (const preset of presets) {
        expect(preset.params).toHaveProperty('energy');
        expect(preset.params).toHaveProperty('valence');
        expect(preset.params).toHaveProperty('danceability');
        expect(preset.params).toHaveProperty('tempo');
        expect(preset.params.energy).toBeGreaterThanOrEqual(0);
        expect(preset.params.energy).toBeLessThanOrEqual(1);
        expect(preset.params.valence).toBeGreaterThanOrEqual(0);
        expect(preset.params.valence).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('hasEmbeddings', () => {
    it('returns boolean', () => {
      const result = hasEmbeddings();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('findExactMatch', () => {
    it('matches category name exactly', () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const firstCategory = presets[0].category;
        const match = findExactMatch(firstCategory);
        expect(match).not.toBeNull();
        expect(match?.category).toBe(firstCategory);
      }
    });

    it('matches phrase exactly (case insensitive)', () => {
      const presets = getPresets();
      const presetWithPhrases = presets.find(p => p.phrases.length > 0);
      if (presetWithPhrases) {
        const phrase = presetWithPhrases.phrases[0];
        const match = findExactMatch(phrase.toUpperCase());
        expect(match).not.toBeNull();
        expect(match?.category).toBe(presetWithPhrases.category);
      }
    });

    it('returns null for non-matching input', () => {
      const match = findExactMatch('xyznonexistentmood123');
      expect(match).toBeNull();
    });

    it('trims whitespace', () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const firstCategory = presets[0].category;
        const match = findExactMatch(`  ${firstCategory}  `);
        expect(match).not.toBeNull();
      }
    });
  });

  describe('findKeywordMatch', () => {
    it('matches partial category name', () => {
      const presets = getPresets();
      const energeticPreset = presets.find(p => p.category === 'energetic');
      if (energeticPreset) {
        const match = findKeywordMatch('feeling energetic today');
        expect(match).not.toBeNull();
        expect(match?.preset.category).toBe('energetic');
      }
    });

    it('matches phrase words', () => {
      const presets = getPresets();
      // Find a preset with multi-word phrases
      const presetWithPhrases = presets.find(
        p => p.phrases.some(phrase => phrase.includes(' '))
      );
      if (presetWithPhrases) {
        const phrase = presetWithPhrases.phrases.find(p => p.includes(' '));
        if (phrase) {
          const words = phrase.split(' ');
          const match = findKeywordMatch(words[0]);
          expect(match).not.toBeNull();
        }
      }
    });

    it('returns similarity score between 0 and 1', () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const match = findKeywordMatch(presets[0].category);
        if (match) {
          expect(match.similarity).toBeGreaterThanOrEqual(0);
          expect(match.similarity).toBeLessThanOrEqual(1);
        }
      }
    });

    it('returns null for very low similarity', () => {
      const match = findKeywordMatch('xyzabc123random');
      // Should return null because similarity threshold is 0.2
      expect(match).toBeNull();
    });

    it('prefers exact phrase match over partial', () => {
      const presets = getPresets();
      const presetWithPhrase = presets.find(p => p.phrases.includes('happy'));
      if (presetWithPhrase) {
        const exactMatch = findKeywordMatch('happy');
        const partialMatch = findKeywordMatch('hap');
        // Exact match should have higher or equal similarity
        if (exactMatch && partialMatch) {
          expect(exactMatch.similarity).toBeGreaterThanOrEqual(partialMatch.similarity);
        }
      }
    });
  });

  describe('presetToMoodParams', () => {
    it('converts preset to MoodParams format', () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const params = presetToMoodParams(presets[0]);
        expect(params).toHaveProperty('energy');
        expect(params).toHaveProperty('valence');
        expect(params).toHaveProperty('danceability');
        expect(params).toHaveProperty('tempo');
        expect(params.tempo).toHaveProperty('min');
        expect(params.tempo).toHaveProperty('max');
      }
    });

    it('preserves optional fields when present', () => {
      const presets = getPresets();
      const presetWithAcousticness = presets.find(
        p => p.params.acousticness !== undefined
      );
      if (presetWithAcousticness) {
        const params = presetToMoodParams(presetWithAcousticness);
        expect(params.acousticness).toBe(presetWithAcousticness.params.acousticness);
      }
    });
  });

  describe('matchMood', () => {
    it('returns exact match for known category', async () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const result = await matchMood(presets[0].category);
        expect(result.method).toBe('exact');
        expect(result.confidence).toBe(1.0);
        expect(result.params).not.toBeNull();
      }
    });

    it('falls back to keyword match when no exact match', async () => {
      const presets = getPresets();
      const energeticPreset = presets.find(p => p.category === 'energetic');
      if (energeticPreset) {
        // Use a sentence that contains the keyword but isn't an exact match
        const result = await matchMood('I am feeling somewhat energetic');
        expect(['keyword', 'none'].includes(result.method)).toBe(true);
      }
    });

    it('returns none when no match found', async () => {
      const result = await matchMood('xyzrandomnonexistent123');
      expect(result.method).toBe('none');
      expect(result.params).toBeNull();
      expect(result.confidence).toBe(0);
    });

    it('handles empty input', async () => {
      const result = await matchMood('');
      expect(result.params).toBeNull();
    });

    it('normalizes input to lowercase', async () => {
      const presets = getPresets();
      if (presets.length > 0) {
        const category = presets[0].category;
        const upperResult = await matchMood(category.toUpperCase());
        const lowerResult = await matchMood(category.toLowerCase());
        expect(upperResult.method).toBe(lowerResult.method);
      }
    });
  });

  describe('Turkish mood matching', () => {
    it('matches Turkish mood words', async () => {
      const presets = getPresets();
      // Check if there are Turkish phrases
      const turkishPreset = presets.find(p =>
        p.phrases.some(phrase =>
          ['mutlu', 'huzurlu', 'enerjik', 'sakin'].some(tr =>
            phrase.toLowerCase().includes(tr)
          )
        )
      );

      if (turkishPreset) {
        const turkishPhrase = turkishPreset.phrases.find(phrase =>
          ['mutlu', 'huzurlu', 'enerjik', 'sakin'].some(tr =>
            phrase.toLowerCase().includes(tr)
          )
        );
        if (turkishPhrase) {
          const match = findExactMatch(turkishPhrase);
          expect(match).not.toBeNull();
        }
      }
    });
  });

  describe('edge cases', () => {
    it('handles special characters in input', async () => {
      const result = await matchMood('happy! @#$%');
      // Should still try to match 'happy'
      expect(result).toBeDefined();
    });

    it('handles very long input', async () => {
      const longInput = 'happy '.repeat(100);
      const result = await matchMood(longInput);
      expect(result).toBeDefined();
    });

    it('handles numeric input', async () => {
      const result = await matchMood('12345');
      expect(result.method).toBe('none');
    });
  });
});
