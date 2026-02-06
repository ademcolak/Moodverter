import { describe, it, expect, vi } from 'vitest';
import type { UnifiedTrack } from '../../../types/provider';
import {
  calculateFeatureSimilarity,
  getTrackSimilarity,
} from '../../../services/recommendation/embeddings';

vi.mock('../../../services/ai/ollama', () => ({
  embed: vi.fn(),
  isOllamaRunning: vi.fn().mockResolvedValue(false),
  cosineSimilarity: (a: number[], b: number[]) => {
    let dot = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dot / magnitude;
  },
}));

function createTrack(overrides?: Partial<UnifiedTrack>): UnifiedTrack {
  return {
    id: 'track-1',
    provider: 'mock',
    name: 'Test Track',
    artist: 'Test Artist',
    durationMs: 180000,
    playCount: 0,
    audioFeatures: {
      energy: 0.8,
      valence: 0.7,
      tempo: 128,
      danceability: 0.85,
      acousticness: 0.1,
      instrumentalness: 0.05,
      key: 5,
      mode: 1,
    },
    ...overrides,
  };
}

describe('Embedding similarity', () => {
  it('calculates high feature similarity for close tracks', () => {
    const score = calculateFeatureSimilarity(
      createTrack().audioFeatures,
      createTrack({
        audioFeatures: {
          energy: 0.82,
          valence: 0.68,
          tempo: 126,
          danceability: 0.83,
          acousticness: 0.12,
          instrumentalness: 0.04,
          key: 6,
          mode: 1,
        },
      }).audioFeatures
    );

    expect(score).toBeGreaterThan(0.8);
  });

  it('calculates lower feature similarity for distant tracks', () => {
    const score = calculateFeatureSimilarity(
      createTrack().audioFeatures,
      createTrack({
        audioFeatures: {
          energy: 0.1,
          valence: 0.2,
          tempo: 70,
          danceability: 0.2,
          acousticness: 0.9,
          instrumentalness: 0.8,
          key: 0,
          mode: 0,
        },
      }).audioFeatures
    );

    expect(score).toBeLessThan(0.55);
  });

  it('falls back to feature similarity when embeddings are unavailable', async () => {
    const trackA = createTrack({ id: 'a' });
    const trackB = createTrack({
      id: 'b',
      audioFeatures: {
        energy: 0.78,
        valence: 0.72,
        tempo: 130,
        danceability: 0.82,
        acousticness: 0.15,
        instrumentalness: 0.03,
        key: 5,
        mode: 1,
      },
    });

    const score = await getTrackSimilarity(trackA, trackB);

    expect(score).toBeGreaterThan(0.75);
  });
});
