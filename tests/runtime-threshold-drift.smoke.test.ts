import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  analyzeTrackWithHeuristicV1,
  buildRuntimeThresholdDriftReport,
  clearTransitionData,
  clearTransitionRelevanceMap,
  runBaselineEvaluation,
  recordTransitionRuntimeEvent,
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

async function prepareScope(): Promise<void> {
  await analyzeTrackWithHeuristicV1({
    id: 'seed-runtime-drift',
    name: 'Seed Runtime Drift',
    artist: 'Seed Artist',
    durationMs: 180_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-runtime-drift-a',
    name: 'Target Runtime Drift A',
    artist: 'Target Artist A',
    durationMs: 176_000,
  });
  await analyzeTrackWithHeuristicV1({
    id: 'target-runtime-drift-b',
    name: 'Target Runtime Drift B',
    artist: 'Target Artist B',
    durationMs: 174_000,
  });
}

test('buildRuntimeThresholdDriftReport returns null when there are not enough benchmark runs', async () => {
  await prepareScope();

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-runtime-drift',
    targetTrackId: 'target-runtime-drift-a',
    latencyMs: 1100,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });

  await runBaselineEvaluation({
    seedTrackIds: ['seed-runtime-drift'],
    scopeLabel: 'custom',
    scopeId: 'runtime-drift-scope',
    relevantTargetsBySeed: {
      'seed-runtime-drift': ['target-runtime-drift-a'],
    },
    limit: 5,
  });

  const report = buildRuntimeThresholdDriftReport({
    scopeId: 'runtime-drift-scope',
  });

  assert.equal(report, null);
});

test('buildRuntimeThresholdDriftReport marks degrading when runtime metrics drift upward', async () => {
  await prepareScope();

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-runtime-drift',
    targetTrackId: 'target-runtime-drift-a',
    latencyMs: 1000,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-runtime-drift',
    targetTrackId: 'target-runtime-drift-b',
    latencyMs: 1100,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });

  await runBaselineEvaluation({
    seedTrackIds: ['seed-runtime-drift'],
    scopeLabel: 'custom',
    scopeId: 'runtime-drift-scope',
    relevantTargetsBySeed: {
      'seed-runtime-drift': ['target-runtime-drift-a', 'target-runtime-drift-b'],
    },
    limit: 5,
  });

  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-runtime-drift',
    targetTrackId: 'target-runtime-drift-a',
    latencyMs: 2500,
    stalled: true,
    dropped: true,
    mode: 'auto',
  });
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-runtime-drift',
    targetTrackId: 'target-runtime-drift-b',
    latencyMs: 2600,
    stalled: true,
    dropped: true,
    mode: 'auto',
  });

  await runBaselineEvaluation({
    seedTrackIds: ['seed-runtime-drift'],
    scopeLabel: 'custom',
    scopeId: 'runtime-drift-scope',
    relevantTargetsBySeed: {
      'seed-runtime-drift': ['target-runtime-drift-a', 'target-runtime-drift-b'],
    },
    limit: 5,
  });

  const report = buildRuntimeThresholdDriftReport({
    scopeId: 'runtime-drift-scope',
    windowSize: 5,
  });

  assert.ok(report !== null);
  if (report === null) return;
  assert.equal(report.scopeId, 'runtime-drift-scope');
  assert.equal(report.runCount, 2);
  assert.equal(report.overallStatus, 'degrading');
  assert.match(report.summary, /Runtime drift \(degrading\)/);

  const latencyMetric = report.metrics.find((metric) => metric.key === 'latencyP95Ms');
  assert.ok(latencyMetric);
  if (!latencyMetric) return;
  assert.ok(latencyMetric.driftRatio !== null && latencyMetric.driftRatio > 0);
  assert.equal(latencyMetric.status, 'degrading');
});
