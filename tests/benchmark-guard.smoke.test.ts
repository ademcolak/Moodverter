import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildBenchmarkSeedSelection,
  buildRelevantTargetGaps,
  resolveBenchmarkSeedTargetCount,
} from '../src/services/transition';
import type { UnifiedTrack } from '../src/types/provider';
import type { AnalysisState, TransitionRelevanceMap } from '../src/services/transition';

function createTrack(id: string, playCount: number): UnifiedTrack {
  return {
    id,
    provider: 'youtube',
    name: `Track ${id}`,
    artist: `Artist ${id}`,
    durationMs: 180_000,
    playCount,
  };
}

function createReadyState(trackId: string): AnalysisState {
  return {
    trackId,
    status: 'ready',
    updatedAt: '2026-02-20T00:00:00.000Z',
    version: 2,
  };
}

test('buildBenchmarkSeedSelection keeps existing eligible seeds first and fills with ready+labeled tracks', () => {
  const sortedLibrary: UnifiedTrack[] = [
    createTrack('seed-1', 50),
    createTrack('seed-2', 40),
    createTrack('seed-3', 30),
    createTrack('seed-4', 20),
    createTrack('seed-5', 10),
  ];
  const analysisStates: Record<string, AnalysisState> = {
    'seed-1': createReadyState('seed-1'),
    'seed-2': createReadyState('seed-2'),
    'seed-3': createReadyState('seed-3'),
    'seed-4': createReadyState('seed-4'),
    'seed-5': { ...createReadyState('seed-5'), status: 'pending' },
  };
  const relevanceMap: TransitionRelevanceMap = {
    'seed-1': ['seed-2', 'seed-3'],
    'seed-2': ['seed-1', 'seed-3'],
    'seed-3': ['seed-1', 'seed-2'],
    'seed-4': ['seed-1'],
  };

  const selected = buildBenchmarkSeedSelection({
    existingSeedTrackIds: ['seed-3', 'seed-4', 'missing-seed'],
    sortedLibrary,
    analysisStates,
    relevanceMap,
    requiredRelevantTargetsPerSeed: 2,
    targetSeedCount: 3,
  });

  assert.deepEqual(selected, ['seed-3', 'seed-1', 'seed-2']);
});

test('buildRelevantTargetGaps returns missing label counts sorted by biggest gap', () => {
  const gaps = buildRelevantTargetGaps(
    ['seed-a', 'seed-b', 'seed-c'],
    {
      'seed-a': ['x'],
      'seed-b': [],
      'seed-c': ['x', 'y'],
    },
    2
  );

  assert.deepEqual(gaps, [
    { trackId: 'seed-b', relevantTargetCount: 0, missingTargetCount: 2 },
    { trackId: 'seed-a', relevantTargetCount: 1, missingTargetCount: 1 },
  ]);
});

test('resolveBenchmarkSeedTargetCount keeps minimum floor and grows to preferred when possible', () => {
  assert.equal(resolveBenchmarkSeedTargetCount({
    eligibleSeedCount: 7,
    minimumSeedCount: 10,
    preferredSeedCount: 12,
  }), 10);

  assert.equal(resolveBenchmarkSeedTargetCount({
    eligibleSeedCount: 10,
    minimumSeedCount: 10,
    preferredSeedCount: 12,
  }), 10);

  assert.equal(resolveBenchmarkSeedTargetCount({
    eligibleSeedCount: 25,
    minimumSeedCount: 10,
    preferredSeedCount: 12,
  }), 12);
});
