import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEvaluationProgressReport,
  type AnalysisState,
  type TransitionRelevanceMap,
} from '../src/services/transition';

test('buildEvaluationProgressReport aggregates readiness and gate gaps', () => {
  const analysisStates: Record<string, AnalysisState> = {
    'seed-a': {
      trackId: 'seed-a',
      status: 'ready',
      updatedAt: '2026-02-17T00:00:00.000Z',
      version: 2,
    },
    'seed-b': {
      trackId: 'seed-b',
      status: 'pending',
      updatedAt: '2026-02-17T00:00:00.000Z',
      version: 2,
    },
    'seed-d': {
      trackId: 'seed-d',
      status: 'ready',
      updatedAt: '2026-02-17T00:00:00.000Z',
      version: 2,
    },
  };
  const relevanceMap: TransitionRelevanceMap = {
    'seed-a': ['target-1', 'target-2'],
    'seed-b': ['target-3'],
    'seed-d': ['target-4', 'target-5'],
  };
  const report = buildEvaluationProgressReport({
    seedTrackIds: ['seed-a', 'seed-b', 'seed-c', 'seed-d'],
    analysisStates,
    relevanceMap,
    requiredRelevantTargetsPerSeed: 2,
  });

  assert.equal(report.totalSeedCount, 4);
  assert.equal(report.readySeedCount, 2);
  assert.equal(report.labelGatePassedSeedCount, 2);
  assert.deepEqual(report.seedsMissingAnalysis, ['seed-b', 'seed-c']);
  assert.deepEqual(report.seedsNeedingLabels, ['seed-b', 'seed-c']);

  const readyRow = report.rows.find((row) => row.seedTrackId === 'seed-a');
  assert.ok(readyRow);
  if (!readyRow) throw new Error('ready row is missing');
  assert.equal(readyRow.readyForBaseline, true);
  const secondReadyRow = report.rows.find((row) => row.seedTrackId === 'seed-d');
  assert.ok(secondReadyRow);
  if (!secondReadyRow) throw new Error('seed-d row is missing');
  assert.equal(secondReadyRow.readyForBaseline, true);
});
