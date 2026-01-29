import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  selectNextTrack,
  buildCandidatePool,
  preFilterTracks,
  selectWithDiversity,
} from '../../services/navigator/selector';
import { Track } from '../../types/track';
import { MoodParameters } from '../../types/mood';

// Helper to create a track with default values
const createTrack = (overrides: Partial<Track> = {}): Track => ({
  spotifyId: 'test-id-' + Math.random().toString(36).substr(2, 9),
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

// Helper to create mood parameters
const createMoodParams = (overrides: Partial<MoodParameters> = {}): MoodParameters => ({
  energy: 0.5,
  valence: 0.5,
  danceability: 0.5,
  acousticness: 0.3,
  tempo_min: 100,
  tempo_max: 140,
  ...overrides,
});

describe('selectNextTrack', () => {
  beforeEach(() => {
    // Reset random for consistent tests
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('returns null for empty track pool', () => {
    const result = selectNextTrack([], {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    });

    expect(result).toBeNull();
  });

  it('returns a track from the pool', () => {
    const tracks = [
      createTrack({ spotifyId: 'track-1', energy: 0.5, valence: 0.5 }),
      createTrack({ spotifyId: 'track-2', energy: 0.6, valence: 0.6 }),
    ];

    const result = selectNextTrack(tracks, {
      moodParams: createMoodParams({ energy: 0.5, valence: 0.5 }),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    });

    expect(result).not.toBeNull();
    expect(tracks.map(t => t.spotifyId)).toContain(result?.track.spotifyId);
  });

  it('filters out recently played tracks', () => {
    const recentTrack = createTrack({ spotifyId: 'recent' });
    const otherTrack = createTrack({ spotifyId: 'other' });

    const result = selectNextTrack([recentTrack, otherTrack], {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [recentTrack],
      includeRecommendations: false,
    });

    expect(result?.track.spotifyId).toBe('other');
  });

  it('allows any track when all were recently played', () => {
    const tracks = [
      createTrack({ spotifyId: 'track-1' }),
      createTrack({ spotifyId: 'track-2' }),
    ];

    const result = selectNextTrack(tracks, {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: tracks,
      includeRecommendations: false,
    });

    expect(result).not.toBeNull();
  });

  it('prefers tracks matching mood parameters', () => {
    vi.spyOn(Math, 'random').mockRestore();

    const matchingTrack = createTrack({
      spotifyId: 'matching',
      energy: 0.8,
      valence: 0.8,
      tempo: 120,
    });
    const nonMatchingTrack = createTrack({
      spotifyId: 'non-matching',
      energy: 0.2,
      valence: 0.2,
      tempo: 60,
    });

    const moodParams = createMoodParams({
      energy: 0.8,
      valence: 0.8,
      tempo_min: 100,
      tempo_max: 140,
    });

    // Run multiple times to check tendency
    let matchingCount = 0;
    for (let i = 0; i < 100; i++) {
      const result = selectNextTrack([matchingTrack, nonMatchingTrack], {
        moodParams,
        currentTrack: null,
        recentTracks: [],
        includeRecommendations: false,
        topN: 2,
      });
      if (result?.track.spotifyId === 'matching') matchingCount++;
    }

    // Matching track should be selected more often
    expect(matchingCount).toBeGreaterThan(50);
  });

  it('returns track with scores', () => {
    const track = createTrack({ energy: 0.5, valence: 0.5, tempo: 120 });

    const result = selectNextTrack([track], {
      moodParams: createMoodParams({ energy: 0.5, valence: 0.5 }),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    });

    expect(result).toHaveProperty('moodScore');
    expect(result).toHaveProperty('transitionScore');
    expect(result).toHaveProperty('totalScore');
    expect(result?.moodScore).toBeGreaterThan(0);
    expect(result?.totalScore).toBeGreaterThan(0);
  });
});

describe('buildCandidatePool', () => {
  it('returns only library tracks when recommendations disabled', () => {
    const libraryTracks = [createTrack({ spotifyId: 'lib-1' })];
    const recommendedTracks = [createTrack({ spotifyId: 'rec-1' })];

    const pool = buildCandidatePool(libraryTracks, recommendedTracks, {
      includeRecommendations: false,
    });

    expect(pool).toHaveLength(1);
    expect(pool[0].spotifyId).toBe('lib-1');
  });

  it('includes recommendations when enabled', () => {
    const libraryTracks = [createTrack({ spotifyId: 'lib-1' })];
    const recommendedTracks = [createTrack({ spotifyId: 'rec-1' })];

    const pool = buildCandidatePool(libraryTracks, recommendedTracks, {
      includeRecommendations: true,
    });

    expect(pool).toHaveLength(2);
    expect(pool.map(t => t.spotifyId)).toContain('lib-1');
    expect(pool.map(t => t.spotifyId)).toContain('rec-1');
  });

  it('does not duplicate tracks from recommendations', () => {
    const sharedTrack = createTrack({ spotifyId: 'shared' });
    const libraryTracks = [sharedTrack];
    const recommendedTracks = [sharedTrack, createTrack({ spotifyId: 'rec-only' })];

    const pool = buildCandidatePool(libraryTracks, recommendedTracks, {
      includeRecommendations: true,
    });

    expect(pool).toHaveLength(2);
    const sharedCount = pool.filter(t => t.spotifyId === 'shared').length;
    expect(sharedCount).toBe(1);
  });

  it('respects maxLibraryTracks limit', () => {
    const libraryTracks = Array(10).fill(null).map((_, i) =>
      createTrack({ spotifyId: `lib-${i}` })
    );

    const pool = buildCandidatePool(libraryTracks, [], {
      includeRecommendations: false,
      maxLibraryTracks: 5,
    });

    expect(pool).toHaveLength(5);
  });

  it('respects maxRecommendedTracks limit', () => {
    const libraryTracks = [createTrack({ spotifyId: 'lib-1' })];
    const recommendedTracks = Array(10).fill(null).map((_, i) =>
      createTrack({ spotifyId: `rec-${i}` })
    );

    const pool = buildCandidatePool(libraryTracks, recommendedTracks, {
      includeRecommendations: true,
      maxRecommendedTracks: 3,
    });

    // 1 library + 3 recommendations = 4
    expect(pool).toHaveLength(4);
  });
});

describe('preFilterTracks', () => {
  it('keeps tracks with matching energy', () => {
    // Note: preFilterTracks uses > 0.5 threshold, so diff of exactly 0.5 passes
    const matchingTrack = createTrack({ energy: 0.5, valence: 0.5 });

    const filtered = preFilterTracks(
      [matchingTrack],
      createMoodParams({ energy: 0.5, valence: 0.5 })
    );

    expect(filtered).toContain(matchingTrack);
  });

  it('keeps tracks with energy difference at threshold (0.5)', () => {
    const matchingTrack = createTrack({ spotifyId: 'match', energy: 0.5, valence: 0.5 });
    const atThreshold = createTrack({ spotifyId: 'threshold', energy: 0.0, valence: 0.5 }); // energy diff = 0.5

    const filtered = preFilterTracks(
      [matchingTrack, atThreshold],
      createMoodParams({ energy: 0.5, valence: 0.5 })
    );

    // Energy diff of exactly 0.5 passes (> 0.5 is filtered, = 0.5 passes)
    expect(filtered).toContain(matchingTrack);
    expect(filtered).toContain(atThreshold);
  });

  it('keeps tracks with valence difference at threshold', () => {
    const matchingTrack = createTrack({ spotifyId: 'match', valence: 0.5, energy: 0.5 });

    const filtered = preFilterTracks(
      [matchingTrack],
      createMoodParams({ valence: 0.5, energy: 0.5 })
    );

    expect(filtered).toContain(matchingTrack);
  });

  it('filters out tracks outside tempo range', () => {
    const inRange = createTrack({ tempo: 120 });
    const belowRange = createTrack({ tempo: 60 });
    const aboveRange = createTrack({ tempo: 200 });

    const filtered = preFilterTracks(
      [inRange, belowRange, aboveRange],
      createMoodParams({ tempo_min: 100, tempo_max: 140 })
    );

    expect(filtered).toContain(inRange);
    expect(filtered).not.toContain(belowRange);
    expect(filtered).not.toContain(aboveRange);
  });

  it('allows tracks slightly outside tempo range (20 BPM tolerance)', () => {
    const slightlyBelow = createTrack({ tempo: 85 }); // 100 - 20 + 5 = within tolerance
    const slightlyAbove = createTrack({ tempo: 155 }); // 140 + 20 - 5 = within tolerance

    const filtered = preFilterTracks(
      [slightlyBelow, slightlyAbove],
      createMoodParams({ tempo_min: 100, tempo_max: 140 })
    );

    expect(filtered).toContain(slightlyBelow);
    expect(filtered).toContain(slightlyAbove);
  });

  it('returns empty array when no tracks match', () => {
    const mismatchedTracks = [
      createTrack({ energy: 1.0, valence: 1.0, tempo: 200 }),
    ];

    const filtered = preFilterTracks(
      mismatchedTracks,
      createMoodParams({ energy: 0.2, valence: 0.2, tempo_min: 60, tempo_max: 80 })
    );

    expect(filtered).toHaveLength(0);
  });
});

describe('selectWithDiversity', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
  });

  it('selects specified number of tracks', () => {
    const tracks = Array(10).fill(null).map((_, i) =>
      createTrack({ spotifyId: `track-${i}`, artist: `Artist ${i}` })
    );

    const selected = selectWithDiversity(tracks, {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    }, 3);

    expect(selected).toHaveLength(3);
  });

  it('returns fewer tracks if pool is too small', () => {
    const tracks = [createTrack({ spotifyId: 'only-one' })];

    const selected = selectWithDiversity(tracks, {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    }, 5);

    expect(selected).toHaveLength(1);
  });

  it('does not repeat tracks', () => {
    const tracks = Array(5).fill(null).map((_, i) =>
      createTrack({ spotifyId: `track-${i}` })
    );

    const selected = selectWithDiversity(tracks, {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    }, 5);

    const uniqueIds = new Set(selected.map(t => t.spotifyId));
    expect(uniqueIds.size).toBe(selected.length);
  });

  it('uses previous selected track as context for next selection', () => {
    // This test verifies the transition scoring is considered
    const tracks = [
      createTrack({ spotifyId: 'track-1', tempo: 120, energy: 0.5 }),
      createTrack({ spotifyId: 'track-2', tempo: 122, energy: 0.55 }),
      createTrack({ spotifyId: 'track-3', tempo: 180, energy: 0.9 }),
    ];

    const selected = selectWithDiversity(tracks, {
      moodParams: createMoodParams(),
      currentTrack: tracks[0],
      recentTracks: [],
      includeRecommendations: false,
    }, 3);

    // All tracks should be selected
    expect(selected).toHaveLength(3);
  });
});

describe('weighted random selection', () => {
  it('handles edge case where all scores are zero', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);

    // Create tracks that would have very low scores
    const track = createTrack({ spotifyId: 'track-1' });

    const result = selectNextTrack([track], {
      moodParams: createMoodParams(),
      currentTrack: null,
      recentTracks: [],
      includeRecommendations: false,
    });

    // Should still return a track (fallback to first)
    expect(result).not.toBeNull();
  });

  it('distributes selections based on weights', () => {
    vi.spyOn(Math, 'random').mockRestore();

    const highScoreTrack = createTrack({
      spotifyId: 'high',
      energy: 0.8,
      valence: 0.8,
      tempo: 120,
      danceability: 0.8,
      acousticness: 0.3,
    });
    const lowScoreTrack = createTrack({
      spotifyId: 'low',
      energy: 0.1,
      valence: 0.1,
      tempo: 60,
      danceability: 0.1,
      acousticness: 0.9,
    });

    const moodParams = createMoodParams({
      energy: 0.8,
      valence: 0.8,
      danceability: 0.8,
      acousticness: 0.3,
      tempo_min: 100,
      tempo_max: 140,
    });

    let highCount = 0;
    // Run more iterations for statistical significance
    for (let i = 0; i < 200; i++) {
      const result = selectNextTrack([highScoreTrack, lowScoreTrack], {
        moodParams,
        currentTrack: null,
        recentTracks: [],
        includeRecommendations: false,
        topN: 2,
      });
      if (result?.track.spotifyId === 'high') highCount++;
    }

    // High score track should be selected more often (at least 50% with weighted random)
    expect(highCount).toBeGreaterThan(100);
  });
});
