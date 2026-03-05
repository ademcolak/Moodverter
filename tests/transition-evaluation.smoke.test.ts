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
  scoreTransitionPair,
  buildBottomSeedDiagnosticBundle,
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

function recordRuntimeSeries(input: {
  sourceTrackId: string;
  targetTrackId: string;
  count: number;
  latencyMs: number;
  audibleReadyWaitMs: number;
  stalled: boolean;
  dropped: boolean;
  recordedAtFactory?: (index: number) => string | undefined;
}): void {
  for (let index = 0; index < input.count; index += 1) {
    recordTransitionRuntimeEvent({
      recordedAt: input.recordedAtFactory?.(index),
      sourceTrackId: input.sourceTrackId,
      targetTrackId: input.targetTrackId,
      latencyMs: input.latencyMs,
      audibleReadyWaitMs: input.audibleReadyWaitMs,
      stalled: input.stalled,
      dropped: input.dropped,
      mode: 'auto',
    });
  }
}

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

test('findTransitionCandidates adds positive runtime bias for reliable auto-transition history', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-positive',
    name: 'Seed Track Runtime Positive',
    artist: 'Seed Artist Runtime Positive',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-positive',
    name: 'Target Track Runtime Positive',
    artist: 'Target Artist Runtime Positive',
    durationMs: 176_000,
  });

  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-positive',
    targetTrackId: 'target-track-runtime-positive',
    count: 4,
    latencyMs: 420,
    audibleReadyWaitMs: 55,
    stalled: false,
    dropped: false,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-runtime-positive',
    limit: 5,
  });
  const pairCandidates = candidates.filter((candidate) => candidate.targetTrackId === 'target-track-runtime-positive');

  assert.ok(pairCandidates.length > 0);
  assert.ok((pairCandidates[0].runtimeBias ?? 0) > 0);
  assert.ok(pairCandidates[0].explain.topReasons.some((reason) => reason.includes('Runtime guven')));
});

test('findTransitionCandidates adds negative runtime bias for unstable auto-transition history', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-negative',
    name: 'Seed Track Runtime Negative',
    artist: 'Seed Artist Runtime Negative',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-negative',
    name: 'Target Track Runtime Negative',
    artist: 'Target Artist Runtime Negative',
    durationMs: 176_000,
  });

  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-negative',
    targetTrackId: 'target-track-runtime-negative',
    count: 4,
    latencyMs: 3200,
    audibleReadyWaitMs: 920,
    stalled: true,
    dropped: true,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-runtime-negative',
    limit: 5,
  });
  const pairCandidates = candidates.filter((candidate) => candidate.targetTrackId === 'target-track-runtime-negative');

  assert.ok(pairCandidates.length > 0);
  assert.ok((pairCandidates[0].runtimeBias ?? 0) < 0);
  assert.ok(pairCandidates[0].explain.topReasons.some((reason) => reason.includes('Runtime riski')));
});

test('findTransitionCandidates keeps runtime bias neutral when sample size is below minimum', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-neutral',
    name: 'Seed Track Runtime Neutral',
    artist: 'Seed Artist Runtime Neutral',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-neutral',
    name: 'Target Track Runtime Neutral',
    artist: 'Target Artist Runtime Neutral',
    durationMs: 176_000,
  });

  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-neutral',
    targetTrackId: 'target-track-runtime-neutral',
    count: 3,
    latencyMs: 380,
    audibleReadyWaitMs: 45,
    stalled: false,
    dropped: false,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-runtime-neutral',
    limit: 5,
  });
  const pairCandidates = candidates.filter((candidate) => candidate.targetTrackId === 'target-track-runtime-neutral');

  assert.ok(pairCandidates.length > 0);
  assert.equal(pairCandidates[0].runtimeBias ?? 0, 0);
});

test('findTransitionCandidates prioritizes recent runtime behavior in pair bias', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-recency',
    name: 'Seed Track Runtime Recency',
    artist: 'Seed Artist Runtime Recency',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-recency',
    name: 'Target Track Runtime Recency',
    artist: 'Target Artist Runtime Recency',
    durationMs: 176_000,
  });

  const nowMs = Date.now();
  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-recency',
    targetTrackId: 'target-track-runtime-recency',
    count: 4,
    latencyMs: 3400,
    audibleReadyWaitMs: 900,
    stalled: true,
    dropped: true,
    recordedAtFactory: (index) => new Date(nowMs - ((12 * 24 * 60 * 60 * 1000) + index * 1000)).toISOString(),
  });
  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-recency',
    targetTrackId: 'target-track-runtime-recency',
    count: 4,
    latencyMs: 380,
    audibleReadyWaitMs: 45,
    stalled: false,
    dropped: false,
    recordedAtFactory: (index) => new Date(nowMs - ((2 * 60 * 60 * 1000) + index * 1000)).toISOString(),
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-runtime-recency',
    limit: 5,
  });
  const pairCandidates = candidates.filter((candidate) => candidate.targetTrackId === 'target-track-runtime-recency');

  assert.ok(pairCandidates.length > 0);
  assert.ok((pairCandidates[0].runtimeBias ?? 0) > 0);
});

test('findTransitionCandidates uses context fallback runtime bias when direct pair sample is cold', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-fallback-source',
    name: 'Seed Track Runtime Fallback Source',
    artist: 'Seed Artist Runtime Fallback',
    durationMs: 175_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-fallback-main',
    name: 'Target Track Runtime Fallback Main',
    artist: 'Target Artist Runtime Fallback',
    durationMs: 176_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-runtime-fallback-alt',
    name: 'Target Track Runtime Fallback Alt',
    artist: 'Target Artist Runtime Fallback',
    durationMs: 177_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-runtime-fallback-alt',
    name: 'Seed Track Runtime Fallback Alt',
    artist: 'Seed Artist Runtime Fallback',
    durationMs: 178_000,
  });

  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-fallback-source',
    targetTrackId: 'target-track-runtime-fallback-alt',
    count: 6,
    latencyMs: 420,
    audibleReadyWaitMs: 50,
    stalled: false,
    dropped: false,
  });
  recordRuntimeSeries({
    sourceTrackId: 'seed-track-runtime-fallback-alt',
    targetTrackId: 'target-track-runtime-fallback-main',
    count: 6,
    latencyMs: 390,
    audibleReadyWaitMs: 55,
    stalled: false,
    dropped: false,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-runtime-fallback-source',
    limit: 5,
  });
  const pairCandidates = candidates.filter((candidate) => candidate.targetTrackId === 'target-track-runtime-fallback-main');

  assert.ok(pairCandidates.length > 0);
  assert.ok((pairCandidates[0].runtimeBias ?? 0) > 0);
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
  assert.equal(history[0].schemaVersion, 2);
  assert.equal(history[0].analysisVersion, 2);
  assert.equal(history[0].runMode, 'synthetic');
  assert.equal(typeof history[0].seedSetHash, 'string');
  assert.ok(history[0].seedSetHash.length > 0);
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

test('benchmark merge gate rejects when regression or runtime gate is degraded', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-merge-gate',
    name: 'Seed Track Merge Gate',
    artist: 'Seed Artist Merge Gate',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-merge-gate-a',
    name: 'Target Track Merge Gate A',
    artist: 'Target Artist Merge Gate',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-merge-gate-b',
    name: 'Target Track Merge Gate B',
    artist: 'Target Artist Merge Gate',
    durationMs: 182_000,
  });

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-merge-gate',
    limit: 5,
  });
  assert.ok(candidates.length > 0);

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-track-merge-gate',
    targetTrackId: 'target-track-merge-gate-a',
    latencyMs: 800,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });

  await runBaselineEvaluation({
    seedTrackIds: ['seed-track-merge-gate'],
    limit: 5,
    scopeLabel: 'custom',
    scopeId: 'benchmark-merge-gate-v1',
    relevantTargetsBySeed: {
      'seed-track-merge-gate': [candidates[0].targetTrackId],
    },
  });

  await assert.rejects(
    runBaselineEvaluation({
      seedTrackIds: ['seed-track-merge-gate'],
      limit: 5,
      scopeLabel: 'custom',
      scopeId: 'benchmark-merge-gate-v1',
      enforceBenchmarkMergeGate: true,
      maxTransitionLatencyP95Ms: 700,
      minTransitionRuntimeSampleCount: 1,
      relevantTargetsBySeed: {
        'seed-track-merge-gate': ['missing-track-id'],
      },
    }),
    /Benchmark merge gate failed/
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

test('seedSetHash is deterministic for the same seed set', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-hash-a',
    name: 'Seed Track Hash A',
    artist: 'Seed Artist Hash',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-hash-b',
    name: 'Seed Track Hash B',
    artist: 'Seed Artist Hash',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-hash-a',
    name: 'Target Track Hash A',
    artist: 'Target Artist Hash',
    durationMs: 182_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-hash-b',
    name: 'Target Track Hash B',
    artist: 'Target Artist Hash',
    durationMs: 183_000,
  });

  const first = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-hash-a', 'seed-track-hash-b'],
    scopeLabel: 'custom',
    scopeId: 'seed-hash-deterministic',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-hash-a': ['target-track-hash-a', 'target-track-hash-b'],
      'seed-track-hash-b': ['target-track-hash-a', 'target-track-hash-b'],
    },
  });
  const second = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-hash-b', 'seed-track-hash-a'],
    scopeLabel: 'custom',
    scopeId: 'seed-hash-deterministic',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-hash-a': ['target-track-hash-a', 'target-track-hash-b'],
      'seed-track-hash-b': ['target-track-hash-a', 'target-track-hash-b'],
    },
  });

  assert.equal(first.seedSetHash, second.seedSetHash);
});

test('runMode is synthetic by default and can be real when explicitly set', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-mode',
    name: 'Seed Track Mode',
    artist: 'Seed Artist Mode',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-mode',
    name: 'Target Track Mode',
    artist: 'Target Artist Mode',
    durationMs: 182_000,
  });

  const syntheticResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-mode'],
    scopeLabel: 'custom',
    scopeId: 'mode-synthetic',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-mode': ['target-track-mode', 'seed-track-mode'],
    },
  });
  const realResult = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-mode'],
    scopeLabel: 'custom',
    scopeId: 'mode-real',
    runMode: 'real',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-mode': ['target-track-mode', 'seed-track-mode'],
    },
  });

  assert.equal(syntheticResult.runMode, 'synthetic');
  assert.equal(realResult.runMode, 'real');
});

test('smoothnessScore stays within 0..1 for edge-case transition pairs', () => {
  const edgeA = scoreTransitionPair({
    id: 'a',
    trackId: 'seed-edge',
    timeMs: 10_000,
    eventType: 'drop',
    eventConfidence: 1,
    embedding: Array.from({ length: 16 }, () => 0.4),
    bpmLocal: 90,
    chroma: Array.from({ length: 12 }, () => 0),
    loudnessRms: -28,
  }, {
    id: 'b',
    trackId: 'target-edge',
    timeMs: 20_000,
    eventType: 'drop',
    eventConfidence: 1,
    embedding: Array.from({ length: 16 }, () => 0.3),
    bpmLocal: 190,
    chroma: Array.from({ length: 12 }, () => 1),
    loudnessRms: -2,
  });
  const edgeB = scoreTransitionPair({
    id: 'c',
    trackId: 'seed-edge-2',
    timeMs: 12_000,
    eventType: 'build-up',
    eventConfidence: 0.8,
    embedding: Array.from({ length: 16 }, () => 0.1),
    bpmLocal: 128,
    chroma: Array.from({ length: 12 }, () => 0.2),
    loudnessRms: -10,
  }, {
    id: 'd',
    trackId: 'target-edge-2',
    timeMs: 18_000,
    eventType: 'build-up',
    eventConfidence: 0.8,
    embedding: Array.from({ length: 16 }, () => 0.12),
    bpmLocal: 129,
    chroma: Array.from({ length: 12 }, () => 0.21),
    loudnessRms: -10.5,
  });

  assert.ok(edgeA.smoothnessScore >= 0 && edgeA.smoothnessScore <= 1);
  assert.ok(edgeB.smoothnessScore >= 0 && edgeB.smoothnessScore <= 1);
  assert.ok(edgeB.smoothnessScore > edgeA.smoothnessScore);
});

test('scopeId mismatch in seedSet/runMode context hard-fails for comparable runs', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-scope-hardfail-a',
    name: 'Seed Scope A',
    artist: 'Seed Scope',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-scope-hardfail-b',
    name: 'Seed Scope B',
    artist: 'Seed Scope',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-scope-hardfail',
    name: 'Target Scope',
    artist: 'Target Scope',
    durationMs: 182_000,
  });

  await runBaselineEvaluation({
    seedTrackIds: ['seed-track-scope-hardfail-a'],
    scopeLabel: 'custom',
    scopeId: 'scope-hard-fail-v1',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-scope-hardfail-a': ['target-track-scope-hardfail'],
    },
  });

  await assert.rejects(
    runBaselineEvaluation({
      seedTrackIds: ['seed-track-scope-hardfail-a', 'seed-track-scope-hardfail-b'],
      scopeLabel: 'custom',
      scopeId: 'scope-hard-fail-v1',
      limit: 5,
      relevantTargetsBySeed: {
        'seed-track-scope-hardfail-a': ['target-track-scope-hardfail'],
        'seed-track-scope-hardfail-b': ['target-track-scope-hardfail'],
      },
    }),
    /Scope comparison mismatch/
  );
});

test('buildBottomSeedDiagnosticBundle emits candidate breakdown for bottom seeds', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-diagnostic',
    name: 'Seed Diagnostic',
    artist: 'Seed Diagnostic Artist',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-diagnostic-a',
    name: 'Target Diagnostic A',
    artist: 'Target Diagnostic Artist',
    durationMs: 181_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-track-diagnostic-b',
    name: 'Target Diagnostic B',
    artist: 'Target Diagnostic Artist',
    durationMs: 182_000,
  });

  const baseline = await runBaselineEvaluation({
    seedTrackIds: ['seed-track-diagnostic'],
    scopeLabel: 'custom',
    scopeId: 'diag-bundle-test',
    limit: 5,
    relevantTargetsBySeed: {
      'seed-track-diagnostic': ['target-track-diagnostic-a', 'target-track-diagnostic-b'],
    },
  });
  const bundle = await buildBottomSeedDiagnosticBundle({
    baselineResult: baseline,
    candidateLimit: 5,
  });

  assert.equal(bundle.scopeId, baseline.scopeId);
  assert.ok(bundle.diagnostics.length >= 1);
  const first = bundle.diagnostics[0];
  assert.equal(typeof first.trackId, 'string');
  assert.ok(Array.isArray(first.candidateBreakdown));
  assert.ok(first.candidateBreakdown.length > 0);
  assert.equal(typeof first.candidateBreakdown[0].smoothnessScore, 'number');
});

test('findTransitionCandidates protects diversity budget in top-5 and suppresses near-duplicates', async () => {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-track-diversity',
    name: 'Seed Diversity',
    artist: 'Seed Diversity Artist',
    durationMs: 180_000,
  });
  const targetTrackIds = Array.from({ length: 8 }, (_, index) => `target-track-diversity-${index + 1}`);
  for (const [index, trackId] of targetTrackIds.entries()) {
    await analyzeTrackWithHeuristicV1({
      id: trackId,
      name: `Target Diversity ${index + 1}`,
      artist: 'Target Diversity Artist',
      durationMs: 175_000 + index * 800,
    });
  }

  const candidates = await findTransitionCandidates({
    trackId: 'seed-track-diversity',
    limit: 5,
  });

  assert.equal(candidates.length, 5);
  const uniqueTop5Tracks = new Set(candidates.slice(0, 5).map((item) => item.targetTrackId));
  assert.equal(uniqueTop5Tracks.size, 5);
  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      if (candidates[i].targetTrackId !== candidates[j].targetTrackId) continue;
      const deltaMs = Math.abs(candidates[i].targetTimeMs - candidates[j].targetTimeMs);
      assert.ok(deltaMs > 5000);
    }
  }
});
