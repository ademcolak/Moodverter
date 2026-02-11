import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  addRelevantTarget,
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  clearTransitionRelevanceMap,
  computeHitAtK,
  findTransitionCandidates,
  getBaselineRunHistory,
  getTransitionRelevanceMap,
  removeRelevantTarget,
  runBaselineEvaluation,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
  clearTransitionRelevanceMap();
});

test('runBaselineEvaluation computes Hit@3/5 when labeled relevance exists', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-1',
    name: 'Seed Track',
    artist: 'Seed Artist',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-a',
    name: 'Target A',
    artist: 'Target Artist A',
    durationMs: 185_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-b',
    name: 'Target B',
    artist: 'Target Artist B',
    durationMs: 190_000,
  });

  const candidates = await findTransitionCandidates({ trackId: 'seed-track-1', limit: 5 });
  const expectedHitAt3 = computeHitAtK(candidates, ['target-track-a'], 3);
  const expectedHitAt5 = computeHitAtK(candidates, ['target-track-a'], 5);

  const result = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-1'],
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-1': ['target-track-a'],
    },
  });

  assert.equal(result.seedCount, 1);
  assert.equal(result.labeledSeedCount, 1);
  assert.equal(result.hitAt3, expectedHitAt3);
  assert.equal(result.hitAt5, expectedHitAt5);
});

test('runBaselineEvaluation returns null Hit@K when no labels are provided', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-2',
    name: 'Seed Track 2',
    artist: 'Seed Artist 2',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-c',
    name: 'Target C',
    artist: 'Target Artist C',
    durationMs: 170_000,
  });

  const result = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-2'],
    limit: 5,
  });

  assert.equal(result.labeledSeedCount, 0);
  assert.equal(result.hitAt3, null);
  assert.equal(result.hitAt5, null);
});

test('relevance map helpers add and remove targets without duplicates', () => {
  let map = addRelevantTarget('seed-track-3', 'target-track-d');
  map = addRelevantTarget('seed-track-3', 'target-track-d');

  assert.deepEqual(map['seed-track-3'], ['target-track-d']);
  assert.deepEqual(getTransitionRelevanceMap()['seed-track-3'], ['target-track-d']);

  map = removeRelevantTarget('seed-track-3', 'target-track-d');
  assert.equal(map['seed-track-3'], undefined);
});

test('baseline run history persists latest runs', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-history',
    name: 'Seed Track History',
    artist: 'Seed Artist History',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-history',
    name: 'Target Track History',
    artist: 'Target Artist History',
    durationMs: 182_000,
  });

  const first = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-history'],
    limit: 5,
  });
  const second = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-history'],
    limit: 3,
  });

  const history = getBaselineRunHistory(5);
  assert.equal(history.length, 2);
  assert.equal(history[0].runAt, second.runAt);
  assert.equal(history[1].runAt, first.runAt);
  assert.deepEqual(history[0].seedTrackIds, ['seed-track-history']);
});
