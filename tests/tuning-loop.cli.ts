import fs from 'node:fs/promises';
import path from 'node:path';
import {
  TRANSITION_SCORING_VERSION,
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  clearTransitionRelevanceMap,
  findTransitionCandidates,
  runBaselineEvaluation,
  setTransitionRelevanceMap,
  type BaselineEvaluationResult,
  type TransitionRelevanceMap,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

interface InputTrack {
  id: string;
  name: string;
  artist: string;
  durationMs: number;
}

interface RuntimeGateInput {
  enforce?: boolean;
  minTransitionRuntimeSampleCount?: number;
  maxTransitionLatencyP95Ms?: number;
  maxTransitionStallRate?: number;
  maxTransitionDropRate?: number;
}

interface TuningTrialInput {
  id?: string;
  limit?: number;
  goodThreshold?: number;
  requiredRelevantTargetsPerSeed?: number;
  runtimeGate?: RuntimeGateInput;
  enforceRegressionGate?: boolean;
  enforceTuningValidationGate?: boolean;
  enforceRelevantTargetMinimum?: boolean;
  enforceRuntimeGate?: boolean;
}

interface TuningSearchInput {
  trials: TuningTrialInput[];
  validateBestWithGates?: boolean;
}

interface TuningLoopInput {
  tracks: InputTrack[];
  seedTrackIds?: string[];
  relevantTargetsBySeed?: TransitionRelevanceMap;
  requiredRelevantTargetsPerSeed?: number;
  limit?: number;
  goodThreshold?: number;
  scopeId?: string;
  runtimeGate?: RuntimeGateInput;
  search?: TuningSearchInput;
}

interface NormalizedRuntimeGateInput {
  enforce: boolean;
  minTransitionRuntimeSampleCount?: number;
  maxTransitionLatencyP95Ms?: number;
  maxTransitionStallRate?: number;
  maxTransitionDropRate?: number;
}

interface TrialRunSummary {
  trialId: string;
  objectiveScore: number;
  result: BaselineEvaluationResult;
}

const OBJECTIVE_WEIGHTS = {
  hitAt3: 0.45,
  hitAt5: 0.35,
  meanTopK: 0.15,
  coverage: 0.05,
  stallPenalty: 0.08,
  dropPenalty: 0.12,
} as const;

function normalizeTrackId(trackId: string): string {
  return trackId.trim();
}

function normalizePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function parseArgs(argv: string[]): { inputPath: string | null; outputPath: string | null } {
  const readFlagValue = (flag: string): string | null => {
    const index = argv.findIndex((token) => token === flag);
    if (index < 0) return null;
    const value = argv[index + 1];
    return value ? value.trim() : null;
  };
  return {
    inputPath: readFlagValue('--input'),
    outputPath: readFlagValue('--output'),
  };
}

async function loadInput(filePath: string | null): Promise<TuningLoopInput> {
  if (!filePath) {
    throw new Error('Input gerekli. Ornek: pnpm run tuning:loop -- --input ./configs/tuning-loop.json');
  }
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, 'utf-8');
  return JSON.parse(raw) as TuningLoopInput;
}

function normalizeTracks(rawTracks: InputTrack[]): InputTrack[] {
  return rawTracks
    .map((track) => ({
      id: normalizeTrackId(track.id),
      name: track.name.trim(),
      artist: track.artist.trim(),
      durationMs: Math.max(30_000, Math.floor(track.durationMs)),
    }))
    .filter((track) => track.id.length > 0 && track.name.length > 0);
}

function normalizeSeedTrackIds(
  requestedSeedTrackIds: string[] | undefined,
  tracks: InputTrack[]
): string[] {
  const trackIdSet = new Set(tracks.map((track) => track.id));
  const normalized = Array.isArray(requestedSeedTrackIds) && requestedSeedTrackIds.length > 0
    ? requestedSeedTrackIds
        .map((trackId) => normalizeTrackId(trackId))
        .filter((trackId) => trackId.length > 0 && trackIdSet.has(trackId))
    : tracks.map((track) => track.id);
  return Array.from(new Set(normalized));
}

function normalizeRelevantTargets(map: TransitionRelevanceMap | undefined): TransitionRelevanceMap {
  if (!map) return {};
  return Object.fromEntries(
    Object.entries(map)
      .map(([seedTrackId, targetTrackIds]) => [
        normalizeTrackId(seedTrackId),
        Array.from(
          new Set(
            (Array.isArray(targetTrackIds) ? targetTrackIds : [])
              .map((targetTrackId) => normalizeTrackId(targetTrackId))
              .filter((targetTrackId) => targetTrackId.length > 0)
          )
        ),
      ] as const)
      .filter(([seedTrackId, targetTrackIds]) => seedTrackId.length > 0 && targetTrackIds.length > 0)
  );
}

function normalizeRuntimeGateInput(input: RuntimeGateInput | undefined): NormalizedRuntimeGateInput {
  if (!input) {
    return {
      enforce: false,
    };
  }
  return {
    enforce: Boolean(input.enforce),
    minTransitionRuntimeSampleCount:
      typeof input.minTransitionRuntimeSampleCount === 'number'
      && Number.isFinite(input.minTransitionRuntimeSampleCount)
        ? Math.max(1, Math.floor(input.minTransitionRuntimeSampleCount))
        : undefined,
    maxTransitionLatencyP95Ms:
      typeof input.maxTransitionLatencyP95Ms === 'number'
      && Number.isFinite(input.maxTransitionLatencyP95Ms)
        ? Math.max(1, Math.floor(input.maxTransitionLatencyP95Ms))
        : undefined,
    maxTransitionStallRate:
      typeof input.maxTransitionStallRate === 'number'
      && Number.isFinite(input.maxTransitionStallRate)
        ? normalizePercent(input.maxTransitionStallRate)
        : undefined,
    maxTransitionDropRate:
      typeof input.maxTransitionDropRate === 'number'
      && Number.isFinite(input.maxTransitionDropRate)
        ? normalizePercent(input.maxTransitionDropRate)
        : undefined,
  };
}

async function hydrateRelevantTargetsByCandidates(
  map: TransitionRelevanceMap,
  seedTrackIds: string[],
  requiredRelevantTargetsPerSeed: number
): Promise<TransitionRelevanceMap> {
  let nextMap = { ...map };
  for (const seedTrackId of seedTrackIds) {
    const existingTargets = nextMap[seedTrackId] ?? [];
    if (existingTargets.length >= requiredRelevantTargetsPerSeed) continue;
    const candidates = await findTransitionCandidates({
      trackId: seedTrackId,
      limit: Math.max(20, requiredRelevantTargetsPerSeed * 6),
    });
    const candidateTargets = Array.from(
      new Set(
        candidates
          .map((candidate) => candidate.targetTrackId)
          .filter((targetTrackId) => targetTrackId !== seedTrackId)
      )
    );
    const mergedTargets = Array.from(new Set([...existingTargets, ...candidateTargets]))
      .slice(0, Math.max(requiredRelevantTargetsPerSeed, existingTargets.length));
    if (mergedTargets.length > 0) {
      nextMap = {
        ...nextMap,
        [seedTrackId]: mergedTargets,
      };
    }
  }
  return nextMap;
}

async function prepareTrialState(
  tracks: InputTrack[],
  seedTrackIds: string[],
  baseRelevantTargets: TransitionRelevanceMap,
  requiredRelevantTargetsPerSeed: number
): Promise<TransitionRelevanceMap> {
  resetBrowserMocks();
  clearTransitionData();
  clearTransitionRelevanceMap();

  for (const track of tracks) {
    await analyzeTrackWithHeuristicV1(track);
  }

  const hydratedRelevantTargets = await hydrateRelevantTargetsByCandidates(
    baseRelevantTargets,
    seedTrackIds,
    requiredRelevantTargetsPerSeed
  );
  return setTransitionRelevanceMap(hydratedRelevantTargets);
}

function computeTrialObjective(result: BaselineEvaluationResult): number {
  const hitAt3 = result.hitAt3 ?? 0;
  const hitAt5 = result.hitAt5 ?? 0;
  const meanTopK = result.meanTopKScore;
  const coverage = result.coverageRate;
  const stallPenalty = (result.transitionStallRate ?? 0) * OBJECTIVE_WEIGHTS.stallPenalty;
  const dropPenalty = (result.transitionDropRate ?? 0) * OBJECTIVE_WEIGHTS.dropPenalty;
  const gatePenalty = (
    (result.regressionGatePassed ? 0 : 0.25)
    + (result.tuningValidationPassed ? 0 : 0.15)
    + (result.relevanceTargetGatePassed ? 0 : 0.2)
    + (result.runtimeGatePassed ? 0 : 0.2)
  );

  const score = (
    hitAt3 * OBJECTIVE_WEIGHTS.hitAt3
    + hitAt5 * OBJECTIVE_WEIGHTS.hitAt5
    + meanTopK * OBJECTIVE_WEIGHTS.meanTopK
    + coverage * OBJECTIVE_WEIGHTS.coverage
    - stallPenalty
    - dropPenalty
    - gatePenalty
  );
  return Math.round(score * 1_000_000) / 1_000_000;
}

function printSummary(prefix: string, result: BaselineEvaluationResult): void {
  console.log(`${prefix} scoring=${result.scoringVersion} hit@3=${result.hitAt3 ?? 'NA'} hit@5=${result.hitAt5 ?? 'NA'}`);
  console.log(`${prefix} coverage=${Math.round(result.coverageRate * 100)}% labeled=${result.labeledSeedCount}`);
  console.log(`${prefix} gates regression=${result.regressionGatePassed ? 'PASS' : 'FAIL'} tuning=${result.tuningValidationPassed ? 'PASS' : 'FAIL'} label=${result.relevanceTargetGatePassed ? 'PASS' : 'FAIL'} runtime=${result.runtimeGatePassed ? 'PASS' : 'FAIL'}`);
  if (result.tuningActions.length > 0) {
    const first = result.tuningActions[0];
    console.log(`${prefix} top-action ${first.trackId} -> ${first.issue} (${Math.round(first.confidence * 100)}%)`);
    console.log(`${prefix} recommendation ${first.recommendation}`);
  }
}

async function runTrial(input: {
  trialId: string;
  tracks: InputTrack[];
  seedTrackIds: string[];
  baseRelevantTargets: TransitionRelevanceMap;
  scopeId: string;
  limit: number;
  goodThreshold: number;
  requiredRelevantTargetsPerSeed: number;
  runtimeGate: NormalizedRuntimeGateInput;
  enforceRegressionGate: boolean;
  enforceTuningValidationGate: boolean;
  enforceRelevantTargetMinimum: boolean;
  enforceRuntimeGate: boolean;
}): Promise<BaselineEvaluationResult> {
  const persistedRelevantTargets = await prepareTrialState(
    input.tracks,
    input.seedTrackIds,
    input.baseRelevantTargets,
    input.requiredRelevantTargetsPerSeed
  );

  return runBaselineEvaluation({
    seedTrackIds: input.seedTrackIds,
    relevantTargetsBySeed: persistedRelevantTargets,
    requiredRelevantTargetsPerSeed: input.requiredRelevantTargetsPerSeed,
    enforceRelevantTargetMinimum: input.enforceRelevantTargetMinimum,
    enforceRegressionGate: input.enforceRegressionGate,
    enforceTuningValidationGate: input.enforceTuningValidationGate,
    enforceRuntimeGate: input.enforceRuntimeGate,
    minTransitionRuntimeSampleCount: input.runtimeGate.minTransitionRuntimeSampleCount,
    maxTransitionLatencyP95Ms: input.runtimeGate.maxTransitionLatencyP95Ms,
    maxTransitionStallRate: input.runtimeGate.maxTransitionStallRate,
    maxTransitionDropRate: input.runtimeGate.maxTransitionDropRate,
    scopeLabel: 'custom',
    scopeId: `${input.scopeId}:${input.trialId}`,
    limit: input.limit,
    goodThreshold: input.goodThreshold,
  });
}

async function runSingleMode(input: {
  tracks: InputTrack[];
  seedTrackIds: string[];
  baseRelevantTargets: TransitionRelevanceMap;
  scopeId: string;
  limit: number;
  goodThreshold: number;
  requiredRelevantTargetsPerSeed: number;
  runtimeGate: NormalizedRuntimeGateInput;
}): Promise<{
  result: BaselineEvaluationResult;
  artifact: Record<string, unknown>;
}> {
  const result = await runTrial({
    trialId: 'single',
    tracks: input.tracks,
    seedTrackIds: input.seedTrackIds,
    baseRelevantTargets: input.baseRelevantTargets,
    scopeId: input.scopeId,
    limit: input.limit,
    goodThreshold: input.goodThreshold,
    requiredRelevantTargetsPerSeed: input.requiredRelevantTargetsPerSeed,
    runtimeGate: input.runtimeGate,
    enforceRegressionGate: true,
    enforceTuningValidationGate: true,
    enforceRelevantTargetMinimum: true,
    enforceRuntimeGate: input.runtimeGate.enforce,
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    mode: 'single',
    config: {
      scopeId: result.scopeId,
      requiredRelevantTargetsPerSeed: input.requiredRelevantTargetsPerSeed,
      seedTrackIds: input.seedTrackIds,
      limit: result.limit,
      goodThreshold: result.goodThreshold,
      scoringVersion: TRANSITION_SCORING_VERSION,
      scoreWeights: result.scoreWeights,
      runtimeGateThresholds: result.runtimeGateThresholds,
      runtimeGateEnforced: result.runtimeGateEnforced,
    },
    objectiveScore: computeTrialObjective(result),
    summary: {
      hitAt3: result.hitAt3,
      hitAt5: result.hitAt5,
      meanTopKScore: result.meanTopKScore,
      coverageRate: result.coverageRate,
      transitionLatencyP95Ms: result.transitionLatencyP95Ms,
      transitionStallRate: result.transitionStallRate,
      transitionDropRate: result.transitionDropRate,
      regressionGatePassed: result.regressionGatePassed,
      tuningValidationPassed: result.tuningValidationPassed,
      relevanceTargetGatePassed: result.relevanceTargetGatePassed,
      runtimeGatePassed: result.runtimeGatePassed,
    },
    bottomSeeds: result.bottomSeeds,
    tuningActions: result.tuningActions,
    nextRecommendation: result.tuningActions[0]?.recommendation ?? null,
    baselineResult: result,
  };

  return {
    result,
    artifact,
  };
}

function normalizeTrialList(input: TuningSearchInput | undefined): TuningTrialInput[] {
  if (!input || !Array.isArray(input.trials)) return [];
  return input.trials.filter((trial) => trial && typeof trial === 'object');
}

async function runSearchMode(input: {
  tracks: InputTrack[];
  seedTrackIds: string[];
  baseRelevantTargets: TransitionRelevanceMap;
  scopeId: string;
  defaultLimit: number;
  defaultGoodThreshold: number;
  defaultRequiredRelevantTargetsPerSeed: number;
  defaultRuntimeGate: NormalizedRuntimeGateInput;
  search: TuningSearchInput;
}): Promise<{
  bestResult: BaselineEvaluationResult;
  artifact: Record<string, unknown>;
}> {
  const trials = normalizeTrialList(input.search);
  if (trials.length === 0) {
    throw new Error('search.trials alani bos olamaz.');
  }

  const trialSummaries: TrialRunSummary[] = [];
  for (let index = 0; index < trials.length; index += 1) {
    const trial = trials[index];
    const trialId = (trial.id ?? `trial-${index + 1}`).trim() || `trial-${index + 1}`;
    const runtimeGate = normalizeRuntimeGateInput(trial.runtimeGate ?? input.defaultRuntimeGate);
    const result = await runTrial({
      trialId,
      tracks: input.tracks,
      seedTrackIds: input.seedTrackIds,
      baseRelevantTargets: input.baseRelevantTargets,
      scopeId: input.scopeId,
      limit: Math.max(1, Math.floor(trial.limit ?? input.defaultLimit)),
      goodThreshold: normalizePercent(trial.goodThreshold ?? input.defaultGoodThreshold),
      requiredRelevantTargetsPerSeed: Math.max(
        1,
        Math.floor(trial.requiredRelevantTargetsPerSeed ?? input.defaultRequiredRelevantTargetsPerSeed)
      ),
      runtimeGate,
      enforceRegressionGate: Boolean(trial.enforceRegressionGate),
      enforceTuningValidationGate: Boolean(trial.enforceTuningValidationGate),
      enforceRelevantTargetMinimum: trial.enforceRelevantTargetMinimum !== false,
      enforceRuntimeGate: Boolean(
        trial.enforceRuntimeGate ?? runtimeGate.enforce
      ),
    });
    const objectiveScore = computeTrialObjective(result);
    trialSummaries.push({
      trialId,
      objectiveScore,
      result,
    });
    console.log(`[tuning:loop][search] ${trialId} objective=${objectiveScore} hit@3=${result.hitAt3 ?? 'NA'} hit@5=${result.hitAt5 ?? 'NA'} meanTopK=${Math.round(result.meanTopKScore * 1000) / 1000}`);
  }

  const ranking = [...trialSummaries]
    .sort((a, b) => b.objectiveScore - a.objectiveScore)
    .map((item) => ({
      trialId: item.trialId,
      objectiveScore: item.objectiveScore,
      hitAt3: item.result.hitAt3,
      hitAt5: item.result.hitAt5,
      meanTopKScore: item.result.meanTopKScore,
      coverageRate: item.result.coverageRate,
      runtimeGatePassed: item.result.runtimeGatePassed,
      regressionGatePassed: item.result.regressionGatePassed,
      tuningValidationPassed: item.result.tuningValidationPassed,
      relevanceTargetGatePassed: item.result.relevanceTargetGatePassed,
    }));
  const best = trialSummaries
    .sort((a, b) => b.objectiveScore - a.objectiveScore)[0];

  let bestValidation: BaselineEvaluationResult | null = null;
  if (input.search.validateBestWithGates) {
    const bestTrial = trials.find((trial, index) => {
      const trialId = (trial.id ?? `trial-${index + 1}`).trim() || `trial-${index + 1}`;
      return trialId === best.trialId;
    }) ?? {};
    const runtimeGate = normalizeRuntimeGateInput(bestTrial.runtimeGate ?? input.defaultRuntimeGate);
    bestValidation = await runTrial({
      trialId: `${best.trialId}-validated`,
      tracks: input.tracks,
      seedTrackIds: input.seedTrackIds,
      baseRelevantTargets: input.baseRelevantTargets,
      scopeId: input.scopeId,
      limit: Math.max(1, Math.floor(bestTrial.limit ?? input.defaultLimit)),
      goodThreshold: normalizePercent(bestTrial.goodThreshold ?? input.defaultGoodThreshold),
      requiredRelevantTargetsPerSeed: Math.max(
        1,
        Math.floor(bestTrial.requiredRelevantTargetsPerSeed ?? input.defaultRequiredRelevantTargetsPerSeed)
      ),
      runtimeGate,
      enforceRegressionGate: true,
      enforceTuningValidationGate: true,
      enforceRelevantTargetMinimum: true,
      enforceRuntimeGate: runtimeGate.enforce,
    });
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    mode: 'search',
    search: {
      trialCount: trials.length,
      ranking,
      bestTrialId: best.trialId,
      bestObjectiveScore: best.objectiveScore,
      validationEnabled: Boolean(input.search.validateBestWithGates),
      validationResult: bestValidation
        ? {
            scopeId: bestValidation.scopeId,
            runtimeGatePassed: bestValidation.runtimeGatePassed,
            regressionGatePassed: bestValidation.regressionGatePassed,
            tuningValidationPassed: bestValidation.tuningValidationPassed,
            relevanceTargetGatePassed: bestValidation.relevanceTargetGatePassed,
            runtimeGateSummary: bestValidation.runtimeGateSummary,
            regressionSummary: bestValidation.regressionSummary,
            tuningValidationSummary: bestValidation.tuningValidationSummary,
          }
        : null,
    },
    selected: {
      trialId: best.trialId,
      objectiveScore: best.objectiveScore,
      baselineResult: best.result,
    },
    nextRecommendation: best.result.tuningActions[0]?.recommendation ?? null,
  };

  return {
    bestResult: bestValidation ?? best.result,
    artifact,
  };
}

async function main(): Promise<void> {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const input = await loadInput(inputPath);

  if (!Array.isArray(input.tracks) || input.tracks.length < 2) {
    throw new Error('tracks alaninda en az 2 kayit gerekli.');
  }
  const tracks = normalizeTracks(input.tracks);
  if (tracks.length < 2) {
    throw new Error('Gecerli track sayisi en az 2 olmali.');
  }

  const seedTrackIds = normalizeSeedTrackIds(input.seedTrackIds, tracks);
  if (seedTrackIds.length === 0) {
    throw new Error('Gecerli seed bulunamadi.');
  }

  const requiredRelevantTargetsPerSeed = Math.max(
    1,
    Math.floor(input.requiredRelevantTargetsPerSeed ?? 2)
  );
  const normalizedRelevantTargets = normalizeRelevantTargets(input.relevantTargetsBySeed);
  const runtimeGate = normalizeRuntimeGateInput(input.runtimeGate);
  const scopeId = (input.scopeId ?? 'tuning-loop').trim() || 'tuning-loop';
  const limit = Math.max(1, Math.floor(input.limit ?? 5));
  const goodThreshold = normalizePercent(input.goodThreshold ?? 0.6);

  installBrowserMocks();

  if (input.search && normalizeTrialList(input.search).length > 0) {
    const { bestResult, artifact } = await runSearchMode({
      tracks,
      seedTrackIds,
      baseRelevantTargets: normalizedRelevantTargets,
      scopeId,
      defaultLimit: limit,
      defaultGoodThreshold: goodThreshold,
      defaultRequiredRelevantTargetsPerSeed: requiredRelevantTargetsPerSeed,
      defaultRuntimeGate: runtimeGate,
      search: input.search,
    });
    printSummary('[tuning:loop][best]', bestResult);

    if (outputPath) {
      const absoluteOutputPath = path.isAbsolute(outputPath)
        ? outputPath
        : path.resolve(process.cwd(), outputPath);
      await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
      await fs.writeFile(absoluteOutputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
      console.log(`[tuning:loop] artifact written: ${absoluteOutputPath}`);
      return;
    }

    console.log(JSON.stringify(artifact, null, 2));
    return;
  }

  const { result, artifact } = await runSingleMode({
    tracks,
    seedTrackIds,
    baseRelevantTargets: normalizedRelevantTargets,
    scopeId,
    limit,
    goodThreshold,
    requiredRelevantTargetsPerSeed,
    runtimeGate,
  });
  printSummary('[tuning:loop]', result);

  if (outputPath) {
    const absoluteOutputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await fs.writeFile(absoluteOutputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    console.log(`[tuning:loop] artifact written: ${absoluteOutputPath}`);
    return;
  }

  console.log(JSON.stringify(artifact, null, 2));
}

void main().catch((error) => {
  console.error('[tuning:loop] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
