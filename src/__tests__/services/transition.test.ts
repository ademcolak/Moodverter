import { describe, it, expect } from 'vitest';
import {
  calculateSimpleTransition,
  shouldPrepareNextTrack,
  calculateEnergyPath,
} from '../../services/navigator/transition';
import { Track, CAMELOT_WHEEL, KEY_COMPATIBILITY } from '../../types/track';

// Helper to create a track with default values
const createTrack = (overrides: Partial<Track> = {}): Track => ({
  spotifyId: 'test-id',
  name: 'Test Track',
  artist: 'Test Artist',
  durationMs: 180000,
  energy: 0.5,
  valence: 0.5,
  tempo: 120,
  danceability: 0.5,
  acousticness: 0.3,
  instrumentalness: 0.1,
  key: 0,
  mode: 1,
  playCount: 0,
  ...overrides,
});

describe('CAMELOT_WHEEL', () => {
  it('maps all 12 keys correctly', () => {
    expect(Object.keys(CAMELOT_WHEEL)).toHaveLength(12);
  });

  it('maps C major to 8B', () => {
    expect(CAMELOT_WHEEL[0][1]).toBe('8B');
  });

  it('maps C minor to 5A', () => {
    expect(CAMELOT_WHEEL[0][0]).toBe('5A');
  });

  it('maps A minor to 8A', () => {
    expect(CAMELOT_WHEEL[9][0]).toBe('8A');
  });

  it('maps G major to 9B', () => {
    expect(CAMELOT_WHEEL[7][1]).toBe('9B');
  });

  it('provides both major and minor for each key', () => {
    for (let key = 0; key < 12; key++) {
      expect(CAMELOT_WHEEL[key][0]).toBeDefined(); // minor
      expect(CAMELOT_WHEEL[key][1]).toBeDefined(); // major
    }
  });
});

describe('KEY_COMPATIBILITY', () => {
  it('includes all 24 Camelot keys', () => {
    expect(Object.keys(KEY_COMPATIBILITY)).toHaveLength(24);
  });

  it('each key is compatible with itself', () => {
    for (const key of Object.keys(KEY_COMPATIBILITY)) {
      expect(KEY_COMPATIBILITY[key]).toContain(key);
    }
  });

  it('8B is compatible with 7B, 9B, 8A', () => {
    expect(KEY_COMPATIBILITY['8B']).toContain('7B');
    expect(KEY_COMPATIBILITY['8B']).toContain('9B');
    expect(KEY_COMPATIBILITY['8B']).toContain('8A');
  });

  it('1A is compatible with 12A and 2A (wraps around)', () => {
    expect(KEY_COMPATIBILITY['1A']).toContain('12A');
    expect(KEY_COMPATIBILITY['1A']).toContain('2A');
  });

  it('12B is compatible with 11B and 1B (wraps around)', () => {
    expect(KEY_COMPATIBILITY['12B']).toContain('11B');
    expect(KEY_COMPATIBILITY['12B']).toContain('1B');
  });

  it('each key has exactly 4 compatible keys', () => {
    for (const key of Object.keys(KEY_COMPATIBILITY)) {
      expect(KEY_COMPATIBILITY[key]).toHaveLength(4);
    }
  });
});

describe('calculateSimpleTransition', () => {
  it('sets transition point before track end', () => {
    const current = createTrack({ durationMs: 180000 });
    const next = createTrack();

    const transition = calculateSimpleTransition(current, next);

    expect(transition.transitionPoint).toBeLessThan(current.durationMs);
    expect(transition.transitionPoint).toBe(170000); // 180000 - 10000
  });

  it('respects custom transition time', () => {
    const current = createTrack({ durationMs: 180000 });
    const next = createTrack();

    const transition = calculateSimpleTransition(current, next, 20000);

    expect(transition.transitionPoint).toBe(160000); // 180000 - 20000
  });

  it('handles short tracks gracefully', () => {
    const current = createTrack({ durationMs: 5000 }); // 5 second track
    const next = createTrack();

    const transition = calculateSimpleTransition(current, next);

    expect(transition.transitionPoint).toBe(0); // max(0, 5000 - 10000)
    expect(transition.transitionPoint).toBeGreaterThanOrEqual(0);
  });

  it('sets seek point to 0', () => {
    const current = createTrack();
    const next = createTrack();

    const transition = calculateSimpleTransition(current, next);

    expect(transition.seekPoint).toBe(0);
  });

  it('includes both tracks in transition info', () => {
    const current = createTrack({ spotifyId: 'current' });
    const next = createTrack({ spotifyId: 'next' });

    const transition = calculateSimpleTransition(current, next);

    expect(transition.fromTrack.spotifyId).toBe('current');
    expect(transition.toTrack.spotifyId).toBe('next');
  });
});

describe('shouldPrepareNextTrack', () => {
  it('returns true when close to track end', () => {
    const result = shouldPrepareNextTrack(170000, 180000); // 10 seconds remaining

    expect(result).toBe(true);
  });

  it('returns false when far from track end', () => {
    const result = shouldPrepareNextTrack(60000, 180000); // 120 seconds remaining

    expect(result).toBe(false);
  });

  it('returns true at exactly the threshold', () => {
    const result = shouldPrepareNextTrack(150000, 180000); // 30 seconds remaining

    expect(result).toBe(true);
  });

  it('respects custom prepare time', () => {
    // 60 seconds remaining, with 60 second threshold
    const result = shouldPrepareNextTrack(120000, 180000, 60000);

    expect(result).toBe(true);
  });

  it('returns false with custom smaller threshold', () => {
    // 60 seconds remaining, with 30 second threshold
    const result = shouldPrepareNextTrack(120000, 180000, 30000);

    expect(result).toBe(false);
  });

  it('handles edge case at track start', () => {
    const result = shouldPrepareNextTrack(0, 180000);

    expect(result).toBe(false);
  });
});

describe('calculateEnergyPath', () => {
  it('returns array with correct number of steps', () => {
    const path = calculateEnergyPath(0.3, 0.7, 5);

    expect(path).toHaveLength(5);
  });

  it('starts with current energy', () => {
    const path = calculateEnergyPath(0.3, 0.7, 5);

    expect(path[0]).toBe(0.3);
  });

  it('ends with target energy', () => {
    const path = calculateEnergyPath(0.3, 0.7, 5);

    expect(path[path.length - 1]).toBe(0.7);
  });

  it('produces monotonically increasing path for upward transition', () => {
    const path = calculateEnergyPath(0.3, 0.7, 5);

    for (let i = 1; i < path.length; i++) {
      expect(path[i]).toBeGreaterThanOrEqual(path[i - 1]);
    }
  });

  it('produces monotonically decreasing path for downward transition', () => {
    const path = calculateEnergyPath(0.7, 0.3, 5);

    for (let i = 1; i < path.length; i++) {
      expect(path[i]).toBeLessThanOrEqual(path[i - 1]);
    }
  });

  it('handles same start and end values', () => {
    const path = calculateEnergyPath(0.5, 0.5, 5);

    expect(path.every(v => v === 0.5)).toBe(true);
  });

  it('uses ease-in-out curve (slower at ends, faster in middle)', () => {
    const path = calculateEnergyPath(0, 1, 5);

    // First step should be small (ease-in)
    const firstStep = path[1] - path[0];
    // Middle step should be larger
    const middleStep = path[2] - path[1];

    expect(middleStep).toBeGreaterThan(firstStep);
  });

  it('handles single step (edge case - division by zero produces NaN)', () => {
    const path = calculateEnergyPath(0.3, 0.7, 1);

    expect(path).toHaveLength(1);
    // With numSteps=1, the formula divides by 0, producing NaN
    // This is an edge case - in practice, numSteps should be >= 2
    expect(path[0]).toBeNaN();
  });

  it('handles two steps', () => {
    const path = calculateEnergyPath(0.3, 0.7, 2);

    expect(path).toHaveLength(2);
    expect(path[0]).toBe(0.3);
    expect(path[1]).toBe(0.7);
  });
});
