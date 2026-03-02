import fs from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  clearTransitionRelevanceMap,
  findTransitionCandidates,
  runBaselineEvaluation,
  type BaselineEvaluationResult,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

interface CliArgs {
  outputPath: string | null;
  scopeId: string;
}

function parseArgs(argv: string[]): CliArgs {
  const readArg = (flag: string): string | null => {
    const index = argv.findIndex((token) => token === flag);
    if (index < 0) return null;
    const value = argv[index + 1];
    return value ? value.trim() : null;
  };
  return {
    outputPath: readArg('--output'),
    scopeId: readArg('--scope-id') ?? 'benchmark-before-after-v1',
  };
}

function buildSeedTrackIds(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `report-seed-${index + 1}`);
}

function toSummary(result: BaselineEvaluationResult): Record<string, unknown> {
  return {
    runAt: result.runAt,
    seedCount: result.seedCount,
    hitAt3: result.hitAt3,
    hitAt5: result.hitAt5,
    meanTopKScore: result.meanTopKScore,
    coverageRate: result.coverageRate,
    regressionDetected: result.regressionDetected,
    regressionSummary: result.regressionSummary,
    runtimeGatePassed: result.runtimeGatePassed,
    runtimeGateSummary: result.runtimeGateSummary,
    tuningValidationPassed: result.tuningValidationPassed,
    tuningValidationSummary: result.tuningValidationSummary,
    autoTransitionSkipRate: result.autoTransitionSkipRate,
    topAutoTransitionSkipReasons: result.topAutoTransitionSkipReasons,
    bottomSeeds: result.bottomSeeds.map((seed) => seed.trackId),
    tuningActions: result.tuningActions.map((action) => ({
      trackId: action.trackId,
      issue: action.issue,
      confidence: action.confidence,
      gateFailSampleCount: action.gateFailSampleCount,
      gateFailDistribution: action.gateFailDistribution,
    })),
  };
}

async function main(): Promise<void> {
  const { outputPath, scopeId } = parseArgs(process.argv.slice(2));
  const seedTrackIds = buildSeedTrackIds(10);
  const targetTrackIds = Array.from({ length: 5 }, (_, index) => `report-target-${index + 1}`);

  installBrowserMocks();
  resetBrowserMocks();
  clearTransitionData();
  clearTransitionRelevanceMap();

  const allTrackIds = [...seedTrackIds, ...targetTrackIds];
  for (const [index, trackId] of allTrackIds.entries()) {
    await analyzeTrackWithHeuristicV1({
      id: trackId,
      name: `Report Track ${index + 1}`,
      artist: 'Benchmark Reporter',
      durationMs: 170_000 + index * 1_500,
    });
  }

  const beforeRelevantTargetsBySeed: Record<string, string[]> = {};
  for (const seedTrackId of seedTrackIds) {
    const candidates = await findTransitionCandidates({
      trackId: seedTrackId,
      limit: 5,
    });
    const uniqueTargets = Array.from(new Set(candidates.map((candidate) => candidate.targetTrackId)));
    const pickedTargets = uniqueTargets.filter((trackId) => trackId !== seedTrackId).slice(0, 2);
    if (pickedTargets.length < 2) {
      const fallbackTargets = allTrackIds.filter((trackId) => trackId !== seedTrackId).slice(0, 2);
      beforeRelevantTargetsBySeed[seedTrackId] = fallbackTargets;
      continue;
    }
    beforeRelevantTargetsBySeed[seedTrackId] = pickedTargets;
  }

  const before = await runBaselineEvaluation({
    seedTrackIds,
    scopeLabel: 'custom',
    scopeId,
    requiredRelevantTargetsPerSeed: 2,
    enforceRelevantTargetMinimum: true,
    limit: 5,
    relevantTargetsBySeed: beforeRelevantTargetsBySeed,
  });

  const afterRelevantTargetsBySeed = Object.fromEntries(
    seedTrackIds.map((trackId) => [trackId, ['missing-a', 'missing-b']])
  );

  const after = await runBaselineEvaluation({
    seedTrackIds,
    scopeLabel: 'custom',
    scopeId,
    requiredRelevantTargetsPerSeed: 2,
    enforceRelevantTargetMinimum: true,
    enforceRegressionGate: false,
    enforceTuningValidationGate: false,
    enforceRuntimeGate: false,
    limit: 5,
    relevantTargetsBySeed: afterRelevantTargetsBySeed,
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    scopeId,
    seedTrackIds,
    comparison: {
      sameSeedSet: before.seedCount === after.seedCount,
      sameScopeId: before.scopeId === after.scopeId,
      hitAt3Delta:
        before.hitAt3 !== null && after.hitAt3 !== null
          ? after.hitAt3 - before.hitAt3
          : null,
      hitAt5Delta:
        before.hitAt5 !== null && after.hitAt5 !== null
          ? after.hitAt5 - before.hitAt5
          : null,
      meanTopKScoreDelta: after.meanTopKScore - before.meanTopKScore,
    },
    before: toSummary(before),
    after: toSummary(after),
  };

  if (outputPath) {
    const absolutePath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    console.log(`[benchmark:before-after] artifact written: ${absolutePath}`);
    return;
  }

  console.log(JSON.stringify(artifact, null, 2));
}

void main().catch((error) => {
  console.error('[benchmark:before-after] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
