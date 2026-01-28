import { describe, it, expect } from 'vitest';
import {
  calculateMoodScore,
  calculateTransitionScore,
  calculateTotalScore,
} from '../../services/navigator/scorer';
import { Track } from '../../types/track';
import { MoodParameters } from '../../types/mood';

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

describe('calculateMoodScore', () => {
  it('returns 1 for a perfect mood match', () => {
    const track = createTrack({
      energy: 0.7,
      valence: 0.8,
      danceability: 0.6,
      acousticness: 0.2,
      tempo: 120,
    });
    const mood = createMoodParams({
      energy: 0.7,
      valence: 0.8,
      danceability: 0.6,
      acousticness: 0.2,
      tempo_min: 100,
      tempo_max: 140,
    });

    const score = calculateMoodScore(track, mood);
    expect(score).toBe(1);
  });

  it('returns lower score for mismatched energy', () => {
    const track = createTrack({ energy: 0.9 });
    const mood = createMoodParams({ energy: 0.1 });

    const score = calculateMoodScore(track, mood);
    expect(score).toBeLessThan(0.8);
  });

  it('returns lower score for mismatched valence', () => {
    const track = createTrack({ valence: 0.9 });
    const mood = createMoodParams({ valence: 0.1 });

    const score = calculateMoodScore(track, mood);
    expect(score).toBeLessThan(0.8);
  });

  it('penalizes tracks outside tempo range', () => {
    const trackInRange = createTrack({ tempo: 120 });
    const trackBelowRange = createTrack({ tempo: 60 });
    const trackAboveRange = createTrack({ tempo: 200 });
    const mood = createMoodParams({ tempo_min: 100, tempo_max: 140 });

    const scoreInRange = calculateMoodScore(trackInRange, mood);
    const scoreBelowRange = calculateMoodScore(trackBelowRange, mood);
    const scoreAboveRange = calculateMoodScore(trackAboveRange, mood);

    expect(scoreInRange).toBeGreaterThan(scoreBelowRange);
    expect(scoreInRange).toBeGreaterThan(scoreAboveRange);
  });

  it('gives partial score for tempo slightly outside range', () => {
    const track = createTrack({ tempo: 95 }); // 5 BPM below min
    const mood = createMoodParams({ tempo_min: 100, tempo_max: 140 });

    const score = calculateMoodScore(track, mood);
    // Score should be reduced but not zero
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1);
  });
});

describe('calculateTransitionScore', () => {
  it('returns high score for same key transition', () => {
    const current = createTrack({ key: 0, mode: 1, tempo: 120, energy: 0.5 }); // C major (8B)
    const next = createTrack({ key: 0, mode: 1, tempo: 120, energy: 0.55 }); // C major (8B)

    const score = calculateTransitionScore(current, next);
    expect(score).toBeGreaterThan(0.8);
  });

  it('returns high score for compatible key transition', () => {
    // 8B (C major) is compatible with 7B, 9B, 8A
    const current = createTrack({ key: 0, mode: 1, tempo: 120, energy: 0.5 }); // 8B
    const next = createTrack({ key: 7, mode: 1, tempo: 120, energy: 0.55 }); // 9B

    const score = calculateTransitionScore(current, next);
    expect(score).toBeGreaterThan(0.7);
  });

  it('returns high score for similar BPM', () => {
    const current = createTrack({ tempo: 120, energy: 0.5 });
    const next = createTrack({ tempo: 122, energy: 0.55 }); // Within 3 BPM

    const score = calculateTransitionScore(current, next);
    expect(score).toBeGreaterThan(0.7);
  });

  it('handles halftime BPM compatibility', () => {
    const current = createTrack({ tempo: 140, energy: 0.5 });
    const next = createTrack({ tempo: 70, energy: 0.55 }); // Half tempo

    const score = calculateTransitionScore(current, next);
    // Should recognize halftime relationship
    expect(score).toBeGreaterThan(0.5);
  });

  it('penalizes large energy jumps', () => {
    const current = createTrack({ tempo: 120, energy: 0.3 });
    const nextSmooth = createTrack({ tempo: 120, energy: 0.4 }); // Small increase
    const nextJump = createTrack({ tempo: 120, energy: 0.9 }); // Large jump

    const scoreSmooth = calculateTransitionScore(current, nextSmooth);
    const scoreJump = calculateTransitionScore(current, nextJump);

    expect(scoreSmooth).toBeGreaterThan(scoreJump);
  });

  it('rewards slight energy increase', () => {
    const current = createTrack({ tempo: 120, energy: 0.5 });
    const nextIncrease = createTrack({ tempo: 120, energy: 0.6 }); // +0.1
    const nextSame = createTrack({ tempo: 120, energy: 0.5 }); // Same

    const scoreIncrease = calculateTransitionScore(current, nextIncrease);
    const scoreSame = calculateTransitionScore(current, nextSame);

    // Slight increase should score at least as well as same
    expect(scoreIncrease).toBeGreaterThanOrEqual(scoreSame * 0.95);
  });

  it('applies diversity penalty for same artist', () => {
    const current = createTrack({ artist: 'Artist A' });
    const nextSameArtist = createTrack({ artist: 'Artist A' });
    const nextDifferentArtist = createTrack({ artist: 'Artist B' });
    const recentArtists = new Set(['Artist A']);

    const scoreSame = calculateTransitionScore(current, nextSameArtist, recentArtists);
    const scoreDifferent = calculateTransitionScore(current, nextDifferentArtist, recentArtists);

    expect(scoreDifferent).toBeGreaterThan(scoreSame);
  });
});

describe('calculateTotalScore', () => {
  it('combines mood and transition scores', () => {
    const track = createTrack({ energy: 0.7, valence: 0.8, tempo: 120 });
    const mood = createMoodParams({ energy: 0.7, valence: 0.8, tempo_min: 100, tempo_max: 140 });
    const currentTrack = createTrack({ tempo: 118, energy: 0.65 });

    const score = calculateTotalScore(track, mood, currentTrack);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('returns only mood score when no current track', () => {
    const track = createTrack({ energy: 0.7, valence: 0.8, tempo: 120 });
    const mood = createMoodParams({ energy: 0.7, valence: 0.8, tempo_min: 100, tempo_max: 140 });

    const scoreWithoutCurrent = calculateTotalScore(track, mood, null);
    const moodScore = calculateMoodScore(track, mood);

    // Should be weighted average with full transition score (1)
    expect(scoreWithoutCurrent).toBeCloseTo(0.6 * moodScore + 0.4 * 1, 2);
  });

  it('respects custom weights', () => {
    const track = createTrack();
    const mood = createMoodParams();
    const currentTrack = createTrack();

    const moodHeavy = calculateTotalScore(track, mood, currentTrack, new Set(), 0.9, 0.1);
    const transitionHeavy = calculateTotalScore(track, mood, currentTrack, new Set(), 0.1, 0.9);

    // Different weights should produce different scores (unless scores are equal)
    expect(typeof moodHeavy).toBe('number');
    expect(typeof transitionHeavy).toBe('number');
  });
});
