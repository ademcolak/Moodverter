import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  addRelevantTarget,
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  clearTransitionRelevanceMap,
  computeHitAtK,
  findTransitionCandidates,
  getAnalysisQueue,
  getAnalysisState,
  getAnalyzedNodes,
  getBaselineRunHistory,
  getTransitionRelevanceMap,
  recordTransitionRuntimeEvent,
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

test('runBaselineEvaluation reports runtime p95/stall/drop metrics for benchmark scope seeds', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime',
    name: 'Seed Track Runtime',
    artist: 'Seed Artist Runtime',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime',
    name: 'Target Track Runtime',
    artist: 'Target Artist Runtime',
    durationMs: 176_000,
  });

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-runtime',
    targetTrackId: 'target-track-runtime',
    latencyMs: 800,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-runtime',
    targetTrackId: 'target-track-runtime',
    latencyMs: 1200,
    stalled: false,
    dropped: false,
    mode: 'manual',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-runtime',
    targetTrackId: 'target-track-runtime',
    latencyMs: 2200,
    stalled: true,
    dropped: true,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-other',
    targetTrackId: 'target-track-runtime',
    latencyMs: 2800,
    stalled: true,
    dropped: true,
    mode: 'auto',
  });

  const result = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-runtime'],
    scopeLabel: 'custom',
    scopeId: 'benchmark-v1',
    limit: 5,
  });

  assert.equal(result.transitionRuntimeSampleCount, 2);
  assert.equal(result.transitionLatencyP95Ms, 2200);
  assert.equal(result.transitionStallRate, 0.5);
  assert.equal(result.transitionDropRate, 0.5);
});

test('runBaselineEvaluation reports auto-skip metrics when decision policy skips auto transition', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-skip',
    name: 'Seed Track Skip',
    artist: 'Seed Artist Skip',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-skip',
    name: 'Target Track Skip',
    artist: 'Target Artist Skip',
    durationMs: 176_000,
  });

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-skip',
    targetTrackId: 'target-track-skip',
    latencyMs: 920,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-skip',
    targetTrackId: 'target-track-skip',
    latencyMs: 0,
    stalled: false,
    dropped: false,
    mode: 'auto',
    skippedAutoTransition: true,
    skipReasons: ['LOW_SCORE', 'LOW_MARGIN'],
  });

  const result = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-skip'],
    scopeLabel: 'custom',
    scopeId: 'benchmark-v1',
    limit: 5,
  });

  assert.equal(result.autoTransitionDecisionSampleCount, 2);
  assert.equal(result.autoTransitionSkippedCount, 1);
  assert.equal(result.autoTransitionSkipRate, 0.5);
  assert.deepEqual(result.topAutoTransitionSkipReasons, ['LOW_MARGIN', 'LOW_SCORE']);
  assert.equal(result.transitionRuntimeSampleCount, 1);
});

test('runtime gate rejects benchmark baseline when runtime slo is degraded', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-gate',
    name: 'Seed Track Runtime Gate',
    artist: 'Seed Artist Runtime Gate',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-gate',
    name: 'Target Track Runtime Gate',
    artist: 'Target Artist Runtime Gate',
    durationMs: 176_000,
  });

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-runtime-gate',
    targetTrackId: 'target-track-runtime-gate',
    latencyMs: 2600,
    stalled: true,
    dropped: true,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-runtime-gate',
    targetTrackId: 'target-track-runtime-gate',
    latencyMs: 2400,
    stalled: true,
    dropped: false,
    mode: 'auto',
  });

  await assert.rejects(
    () => runBaselineEvaluation({
      seedTrackIds: ['seed-track-runtime-gate'],
      scopeLabel: 'custom',
      scopeId: 'benchmark-v1',
      limit: 5,
      enforceRuntimeGate: true,
      minTransitionRuntimeSampleCount: 2,
      maxTransitionLatencyP95Ms: 2000,
      maxTransitionStallRate: 0.2,
      maxTransitionDropRate: 0.2,
    }),
    /Runtime gate failed/
  );
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
  if (!state) throw new Error('analysis state is missing');
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
  assert.ok(firstResult.bottomSeeds[0].averageTempoRatioScore >= 0);
  assert.ok(firstResult.bottomSeeds[0].averageHarmonicCompatibilityScore >= 0);
  assert.ok(firstResult.bottomSeeds[0].averageArtifactPenalty >= 0);
  assert.ok(firstResult.bottomSeeds[0].dominantDriver !== null);
  assert.equal(firstResult.tuningActions.length, 1);
  assert.equal(firstResult.tuningActions[0].trackId, 'seed-track-regression');
  assert.equal(firstResult.tuningActions[0].gateFailSampleCount, 0);
  assert.deepEqual(firstResult.tuningActions[0].gateFailDistribution, []);
  assert.equal(firstResult.tuningValidationSummary, null);
  assert.equal(firstResult.tuningValidationPassed, true);

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
  assert.equal(secondResult.tuningActions.length, 1);
  assert.ok(secondResult.tuningValidationSummary?.includes('Top issue'));
  assert.ok(secondResult.tuningValidationSummary?.includes('quality improved without gate degradation'));
  assert.equal(secondResult.tuningValidationPassed, false);
});

test('custom scope regression comparison respects scopeId', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-custom-scope',
    name: 'Seed Track Custom Scope',
    artist: 'Seed Artist Custom Scope',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-custom-scope-a',
    name: 'Target Track Custom Scope A',
    artist: 'Target Artist Custom Scope A',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-custom-scope-b',
    name: 'Target Track Custom Scope B',
    artist: 'Target Artist Custom Scope B',
    durationMs: 182_000,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-custom-scope',
    limit: 5,
  });
  assert.ok(candidates.length > 0);

  const firstResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-custom-scope'],
    limit: 5,
    scopeLabel: 'custom',
    scopeId: 'benchmark-a',
    relevantTargetsBySeed: {
      'seed-track-custom-scope': [candidates[0].targetTrackId],
    },
  });
  assert.equal(firstResult.regressionDetected, false);

  const differentScopeIdResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-custom-scope'],
    limit: 5,
    scopeLabel: 'custom',
    scopeId: 'benchmark-b',
    relevantTargetsBySeed: {
      'seed-track-custom-scope': ['missing-track-id'],
    },
  });
  assert.equal(differentScopeIdResult.regressionDetected, false);

  const sameScopeIdResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-custom-scope'],
    limit: 5,
    scopeLabel: 'custom',
    scopeId: 'benchmark-a',
    relevantTargetsBySeed: {
      'seed-track-custom-scope': ['missing-track-id'],
    },
  });
  assert.equal(sameScopeIdResult.regressionDetected, true);
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
