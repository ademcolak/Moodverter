import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildEvaluationProgressReport,
  type AnalysisState,
  type ManualListeningChecklistMap,
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
  };
  const relevanceMap: TransitionRelevanceMap = {
    'seed-a': ['target-1', 'target-2'],
    'seed-b': ['target-3'],
  };
  const manualChecklistMap: ManualListeningChecklistMap = {
    'seed-a': {
      transitionSmooth: true,
      timingAligned: true,
      loudnessAcceptable: true,
      eventContinuity: true,
      replayWorth: true,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
    'seed-b': {
      transitionSmooth: true,
      timingAligned: false,
      loudnessAcceptable: false,
      eventContinuity: false,
      replayWorth: false,
      updatedAt: '2026-02-17T00:00:00.000Z',
    },
  };

  const report = buildEvaluationProgressReport({
    seedTrackIds: ['seed-a', 'seed-b', 'seed-c'],
    analysisStates,
    relevanceMap,
    manualChecklistMap,
    requiredRelevantTargetsPerSeed: 2,
  });

  assert.equal(report.totalSeedCount, 3);
  assert.equal(report.readySeedCount, 1);
  assert.equal(report.labelGatePassedSeedCount, 1);
  assert.equal(report.checklistGatePassedSeedCount, 1);
  assert.deepEqual(report.seedsMissingAnalysis, ['seed-b', 'seed-c']);
  assert.deepEqual(report.seedsNeedingLabels, ['seed-b', 'seed-c']);
  assert.deepEqual(report.seedsNeedingManualChecklist, ['seed-b', 'seed-c']);

  const readyRow = report.rows.find((row) => row.seedTrackId === 'seed-a');
  assert.ok(readyRow);
  assert.equal(readyRow.readyForBaseline, true);
});
