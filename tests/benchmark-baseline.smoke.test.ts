import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  findTransitionCandidates,
  runBaselineEvaluation,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
});

function buildSeedTrackIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `benchmark-seed-${index + 1}`);
}

test('benchmark baseline passes with 10-seed set and enforces regression gate on next run', async () => {
  const seedTrackIds = buildSeedTrackIds(10);
  for (const [index, trackId] of seedTrackIds.entries()) {
    await analyzeTrackWithHeuristicV1({
      id: trackId,
      name: `Benchmark Seed ${index + 1}`,
      artist: 'Benchmark Artist',
      durationMs: 180_000 + index * 2_000,
    });
  }

  const firstRelevantTargetsBySeed: Record<string, string[]> = {};
  for (const seedTrackId of seedTrackIds) {
    const candidates = await findTransitionCandidates({
      trackId: seedTrackId,
      limit: 5,
    });
    assert.ok(candidates.length >= 2);
    const uniqueTargets = Array.from(new Set(candidates.map((candidate) => candidate.targetTrackId)));
    if (uniqueTargets.length < 2) {
      const fallbackTargets = seedTrackIds.filter((trackId) => trackId !== seedTrackId).slice(0, 2);
      firstRelevantTargetsBySeed[seedTrackId] = fallbackTargets;
      continue;
    }
    firstRelevantTargetsBySeed[seedTrackId] = [uniqueTargets[0], uniqueTargets[1]];
  }

  const firstRun = await runBaselineEvaluation({
    seedTrackIds,
    scopeLabel: 'custom',
    scopeId: 'benchmark-v1',
    limit: 5,
    enforceRelevantTargetMinimum: true,
    requiredRelevantTargetsPerSeed: 2,
    relevantTargetsBySeed: firstRelevantTargetsBySeed,
  });

  assert.equal(firstRun.seedCount, 10);
  assert.equal(firstRun.scopeId, 'benchmark-v1');
  assert.equal(firstRun.relevanceTargetGatePassed, true);
  assert.equal(firstRun.regressionDetected, false);

  const degradedRelevantTargetsBySeed = Object.fromEntries(
    seedTrackIds.map((trackId) => [trackId, ['missing-target-a', 'missing-target-b']])
  );

  await assert.rejects(
    runBaselineEvaluation({
      seedTrackIds,
      scopeLabel: 'custom',
      scopeId: 'benchmark-v1',
      limit: 5,
      enforceRegressionGate: true,
      enforceRelevantTargetMinimum: true,
      requiredRelevantTargetsPerSeed: 2,
      relevantTargetsBySeed: degradedRelevantTargetsBySeed,
    }),
    /Regression gate failed/
  );
});
