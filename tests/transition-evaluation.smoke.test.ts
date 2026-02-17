import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  addRelevantTarget,
  analyzeTrackWithHeuristicV1,
  clearManualListeningChecklistMap,
  clearTransitionData,
  clearTransitionRelevanceMap,
  computeHitAtK,
  findTransitionCandidates,
  getAnalysisQueue,
  getAnalysisState,
  getAnalyzedNodes,
  getBaselineRunHistory,
  getManualListeningChecklist,
  getManualListeningChecklistMap,
  getTransitionRelevanceMap,
  removeRelevantTarget,
  runBaselineEvaluation,
  updateManualListeningChecklist,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
  clearTransitionRelevanceMap();
  clearManualListeningChecklistMap();
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

test('findTransitionCandidates respects pinned source moment', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-pin',
    name: 'Seed Track Pin',
    artist: 'Seed Artist Pin',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-pin-a',
    name: 'Target Track Pin A',
    artist: 'Target Artist Pin A',
    durationMs: 176_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-pin-b',
    name: 'Target Track Pin B',
    artist: 'Target Artist Pin B',
    durationMs: 188_000,
  });

  const seedNodes = getAnalyzedNodes('seed-track-pin');
  assert.ok(seedNodes.length > 0);

  const requestedSourceTimeMs = 95_000;
  const expectedSourceNode = seedNodes.reduce((nearest, current) => {
    const currentDiff = Math.abs(current.timeMs - requestedSourceTimeMs);
    const nearestDiff = Math.abs(nearest.timeMs - requestedSourceTimeMs);
    return currentDiff < nearestDiff ? current : nearest;
  });

  const pinnedCandidates = await findTransitionCandidates({
    trackId: 'seed-track-pin',
    sourceTimeMs: requestedSourceTimeMs,
    limit: 5,
  });

  assert.ok(pinnedCandidates.length > 0);
  const uniqueSourceTimes = new Set(pinnedCandidates.map((candidate) => candidate.sourceTimeMs));
  assert.equal(uniqueSourceTimes.size, 1);
  assert.equal(pinnedCandidates[0].sourceTimeMs, expectedSourceNode.timeMs);
});

test('hydrateFromStorage requeues stale analysis version for automatic reanalysis', () => {
  const trackId = 'seed-track-stale';

  localStorage.setItem('moodverter_transition_analysis_queue', JSON.stringify([]));
  localStorage.setItem('moodverter_transition_analysis_states', JSON.stringify({
    [trackId]: {
      trackId,
      status: 'ready',
      updatedAt: '2026-02-09T00:00:00.000Z',
      version: 1,
    },
  }));
  localStorage.setItem('moodverter_transition_nodes', JSON.stringify({
    [trackId]: [{
      id: `${trackId}:1000`,
      trackId,
      timeMs: 1000,
      eventType: 'drop',
      eventConfidence: 0.95,
      embedding: Array.from({ length: 16 }, () => 0.4),
      bpmLocal: 124,
      chroma: Array.from({ length: 12 }, () => 0.3),
      loudnessRms: -10,
    }],
  }));

  const state = getAnalysisState(trackId);
  const queue = getAnalysisQueue();
  const nodes = getAnalyzedNodes(trackId);

  assert.ok(state);
  assert.equal(state.status, 'pending');
  assert.equal(state.version, 2);
  assert.deepEqual(queue, [trackId]);
  assert.equal(nodes.length, 0);
});

test('relevance map helpers add and remove targets without duplicates', () => {
  let map = addRelevantTarget('seed-track-3', 'target-track-d');
  map = addRelevantTarget('seed-track-3', 'target-track-d');

  assert.deepEqual(map['seed-track-3'], ['target-track-d']);
  assert.deepEqual(getTransitionRelevanceMap()['seed-track-3'], ['target-track-d']);

  map = removeRelevantTarget('seed-track-3', 'target-track-d');
  assert.equal(map['seed-track-3'], undefined);
});

test('manual listening checklist helpers persist per seed and keep defaults', () => {
  const firstMap = updateManualListeningChecklist('seed-check-1', {
    transitionSmooth: true,
    timingAligned: true,
  });

  assert.equal(firstMap['seed-check-1'].transitionSmooth, true);
  assert.equal(firstMap['seed-check-1'].timingAligned, true);
  assert.equal(firstMap['seed-check-1'].loudnessAcceptable, false);
  assert.equal(firstMap['seed-check-1'].eventContinuity, false);
  assert.equal(firstMap['seed-check-1'].replayWorth, false);

  const secondMap = updateManualListeningChecklist('seed-check-2', {
    replayWorth: true,
  });
  assert.equal(secondMap['seed-check-2'].replayWorth, true);
  assert.equal(secondMap['seed-check-1'].transitionSmooth, true);

  const firstSeed = getManualListeningChecklist('seed-check-1');
  assert.equal(firstSeed.transitionSmooth, true);
  assert.equal(firstSeed.timingAligned, true);
  assert.equal(firstSeed.replayWorth, false);

  const unknownSeed = getManualListeningChecklist('seed-check-unknown');
  assert.equal(unknownSeed.transitionSmooth, false);
  assert.equal(unknownSeed.replayWorth, false);

  const storedMap = getManualListeningChecklistMap();
  assert.equal(storedMap['seed-check-1'].transitionSmooth, true);
  assert.equal(storedMap['seed-check-2'].replayWorth, true);
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
    scopeLabel: 'selected',
  });
  const second = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-history'],
    limit: 3,
    scopeLabel: 'selected',
  });

  const history = getBaselineRunHistory(5);
  assert.equal(history.length, 2);
  assert.equal(history[0].runAt, second.runAt);
  assert.equal(history[1].runAt, first.runAt);
  assert.deepEqual(history[0].seedTrackIds, ['seed-track-history']);
  assert.equal(history[0].scopeLabel, 'selected');
  assert.equal(history[0].schemaVersion, 1);
  assert.equal(history[0].analysisVersion, 2);
});

test('baseline evaluation reports bottom seeds and detects Hit@K regression per scope', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-regression',
    name: 'Seed Track Regression',
    artist: 'Seed Artist Regression',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-regression-a',
    name: 'Target Track Regression A',
    artist: 'Target Artist Regression A',
    durationMs: 182_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-regression-b',
    name: 'Target Track Regression B',
    artist: 'Target Artist Regression B',
    durationMs: 184_000,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-regression',
    limit: 5,
  });
  assert.ok(candidates.length > 0);

  const firstResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-regression'],
    limit: 5,
    scopeLabel: 'all',
    relevantTargetsBySeed: {
      'seed-track-regression': [candidates[0].targetTrackId],
    },
  });
  assert.equal(firstResult.regressionDetected, false);
  assert.equal(firstResult.bottomSeeds.length, 1);
  assert.equal(firstResult.bottomSeeds[0].trackId, 'seed-track-regression');

  const secondResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-regression'],
    limit: 5,
    scopeLabel: 'all',
    relevantTargetsBySeed: {
      'seed-track-regression': ['missing-track-id'],
    },
  });
  assert.equal(secondResult.regressionDetected, true);
  assert.ok(secondResult.regressionSummary?.includes('Hit@3'));
});

test('regression gate rejects baseline run when enforced and Hit@K drops', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-gate',
    name: 'Seed Track Gate',
    artist: 'Seed Artist Gate',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-gate-a',
    name: 'Target Track Gate A',
    artist: 'Target Artist Gate A',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-gate-b',
    name: 'Target Track Gate B',
    artist: 'Target Artist Gate B',
    durationMs: 183_000,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-gate',
    limit: 5,
  });
  assert.ok(candidates.length > 0);

  await runBaselineEvaluation({
    seedTrackIds: ['seed-track-gate'],
    limit: 5,
    scopeLabel: 'all',
    relevantTargetsBySeed: {
      'seed-track-gate': [candidates[0].targetTrackId],
    },
  });

  await assert.rejects(
    runBaselineEvaluation({
      seedTrackIds: ['seed-track-gate'],
      limit: 5,
      scopeLabel: 'all',
      enforceRegressionGate: true,
      relevantTargetsBySeed: {
        'seed-track-gate': ['missing-track-id'],
      },
    }),
    /Regression gate failed/
  );
});

test('relevance target gate rejects baseline run when enforced and labels are insufficient', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-label-gate',
    name: 'Seed Track Label Gate',
    artist: 'Seed Artist Label Gate',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-label-gate-a',
    name: 'Target Track Label Gate A',
    artist: 'Target Artist Label Gate A',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-label-gate-b',
    name: 'Target Track Label Gate B',
    artist: 'Target Artist Label Gate B',
    durationMs: 182_000,
  });

  await assert.rejects(
    runBaselineEvaluation({
      seedTrackIds: ['seed-track-label-gate'],
      limit: 5,
      scopeLabel: 'selected',
      requiredRelevantTargetsPerSeed: 2,
      enforceRelevantTargetMinimum: true,
      relevantTargetsBySeed: {
        'seed-track-label-gate': ['target-track-label-gate-a'],
      },
    }),
    /Label quality gate failed/
  );
});
