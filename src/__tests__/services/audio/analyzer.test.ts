import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateSyntheticFeatures,
  getCachedAnalysis,
  cacheAnalysis,
  clearAnalysisCache
} from '../../../services/audio/analyzer';

describe('Audio Analyzer', () => {
  beforeEach(() => {
    clearAnalysisCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearAnalysisCache();
  });

  describe('generateSyntheticFeatures', () => {
    it('should generate energetic features for rock music', () => {
      const features = generateSyntheticFeatures('Hard Rock Song', 'Artist');
      expect(features.energy).toBeGreaterThan(0.7);
      expect(features.valence).toBeGreaterThan(0.5);
    });

    it('should generate calm features for chill music', () => {
      const features = generateSyntheticFeatures('Chill Lo-Fi Beat', 'Artist');
      expect(features.energy).toBeLessThan(0.4);
    });

    it('should generate sad features for melancholic music', () => {
      const features = generateSyntheticFeatures('Sad Song', 'Artist');
      expect(features.valence).toBeLessThan(0.4);
    });

    it('should generate dance features for electronic music', () => {
      const features = generateSyntheticFeatures('House Party EDM', 'Artist');
      expect(features.danceability).toBeGreaterThan(0.7);
      expect(features.energy).toBeGreaterThan(0.7);
    });

    it('should return default features for unknown genres', () => {
      const features = generateSyntheticFeatures('Unknown Song', 'Artist');
      expect(features.energy).toBe(0.5);
      expect(features.valence).toBe(0.5);
    });
  });

  describe('Cache Management', () => {
    it('should cache and retrieve analysis results', () => {
      const mockResult = {
        energy: 0.8,
        valence: 0.6,
        tempo: 120,
        danceability: 0.7,
        acousticness: 0.1,
        instrumentalness: 0,
        key: 5,
        mode: 1,
        analyzedAt: Date.now(),
        sampleCount: 100
      };

      cacheAnalysis('test-id', mockResult);
      const retrieved = getCachedAnalysis('test-id');

      expect(retrieved).toEqual(mockResult);
    });

    it('should return null for missing cache', () => {
      const retrieved = getCachedAnalysis('missing-id');
      expect(retrieved).toBeNull();
    });

    it('should clear cache', () => {
      const mockResult = {
        energy: 0.8,
        valence: 0.6,
        tempo: 120,
        danceability: 0.7,
        acousticness: 0.1,
        instrumentalness: 0,
        key: 5,
        mode: 1,
        analyzedAt: Date.now(),
        sampleCount: 100
      };

      cacheAnalysis('test-id', mockResult);
      clearAnalysisCache();
      const retrieved = getCachedAnalysis('test-id');

      expect(retrieved).toBeNull();
    });
  });
});
