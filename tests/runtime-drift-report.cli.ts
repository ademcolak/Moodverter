import fs from 'node:fs/promises';
import path from 'node:path';
import {
  analyzeTrackWithHeuristicV1,
  buildRuntimeThresholdDriftReport,
  clearTransitionData,
  clearTransitionRelevanceMap,
  recordTransitionRuntimeEvent,
  runBaselineEvaluation,
  setTransitionRelevanceMap,
  type TransitionRelevanceMap,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

interface InputTrack {
  id: string;
  name: string;
  artist: string;
  durationMs: number;
}

interface RuntimeEventInput {
  sourceTrackId: string;
  targetTrackId: string;
  latencyMs: number;
  stalled?: boolean;
  dropped?: boolean;
  mode?: 'auto' | 'manual';
}

interface DriftRunInput {
  events: RuntimeEventInput[];
}

interface DriftReportInput {
  tracks: InputTrack[];
  seedTrackIds: string[];
  relevantTargetsBySeed?: TransitionRelevanceMap;
  runs: DriftRunInput[];
  scopeId?: string;
  windowSize?: number;
  limit?: number;
  goodThreshold?: number;
  requiredRelevantTargetsPerSeed?: number;
  requireReport?: boolean;
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

async function loadInput(filePath: string | null): Promise<DriftReportInput> {
  if (!filePath) {
    throw new Error('Input gerekli. Ornek: pnpm run runtime:drift-report -- --input ./configs/runtime-drift.json');
  }
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, 'utf-8');
  return JSON.parse(raw) as DriftReportInput;
}

function normalizeTracks(tracks: InputTrack[]): InputTrack[] {
  return tracks
    .map((track) => ({
      id: track.id.trim(),
      name: track.name.trim(),
      artist: track.artist.trim(),
      durationMs: Math.max(30_000, Math.floor(track.durationMs)),
    }))
    .filter((track) => track.id.length > 0 && track.name.length > 0);
}

function normalizeSeedTrackIds(seedTrackIds: string[], tracks: InputTrack[]): string[] {
  const trackSet = new Set(tracks.map((track) => track.id));
  return Array.from(new Set(seedTrackIds
    .map((trackId) => trackId.trim())
    .filter((trackId) => trackId.length > 0 && trackSet.has(trackId))
  ));
}

function normalizeRelevantTargets(
  relevantTargetsBySeed: TransitionRelevanceMap | undefined,
  seedTrackIds: string[]
): TransitionRelevanceMap {
  const fallbackMap = Object.fromEntries(
    seedTrackIds.map((seedTrackId) => [
      seedTrackId,
      seedTrackIds.filter((targetTrackId) => targetTrackId !== seedTrackId).slice(0, 2),
    ])
  );
  const map = relevantTargetsBySeed ?? fallbackMap;

  return Object.fromEntries(
    Object.entries(map)
      .map(([seedTrackId, targetTrackIds]) => [
        seedTrackId.trim(),
        Array.from(new Set((Array.isArray(targetTrackIds) ? targetTrackIds : [])
          .map((targetTrackId) => targetTrackId.trim())
          .filter((targetTrackId) => targetTrackId.length > 0)
        )),
      ] as const)
      .filter(([seedTrackId, targetTrackIds]) => seedTrackId.length > 0 && targetTrackIds.length > 0)
  );
}

async function prepareTransitionState(
  tracks: InputTrack[],
  relevanceMap: TransitionRelevanceMap
): Promise<TransitionRelevanceMap> {
  resetBrowserMocks();
  clearTransitionData();
  clearTransitionRelevanceMap();

  for (const track of tracks) {
    await analyzeTrackWithHeuristicV1(track);
  }

  return setTransitionRelevanceMap(relevanceMap);
}

function normalizeRuntimeEvents(events: RuntimeEventInput[]): RuntimeEventInput[] {
  return events
    .map((event): RuntimeEventInput => {
      const mode: RuntimeEventInput['mode'] = event.mode === 'manual' ? 'manual' : 'auto';
      return {
        sourceTrackId: event.sourceTrackId.trim(),
        targetTrackId: event.targetTrackId.trim(),
        latencyMs: Math.max(0, Math.floor(event.latencyMs)),
        stalled: Boolean(event.stalled),
        dropped: Boolean(event.dropped),
        mode,
      };
    })
    .filter((event) => event.sourceTrackId.length > 0 && event.targetTrackId.length > 0);
}

async function main(): Promise<void> {
  const { inputPath, outputPath } = parseArgs(process.argv.slice(2));
  const input = await loadInput(inputPath);

  if (!Array.isArray(input.tracks) || input.tracks.length < 2) {
    throw new Error('tracks alaninda en az 2 kayit gerekli.');
  }
  if (!Array.isArray(input.seedTrackIds) || input.seedTrackIds.length === 0) {
    throw new Error('seedTrackIds alani bos olamaz.');
  }
  if (!Array.isArray(input.runs) || input.runs.length === 0) {
    throw new Error('runs alani bos olamaz. Drift icin en az 2 run onerilir.');
  }

  const tracks = normalizeTracks(input.tracks);
  const seedTrackIds = normalizeSeedTrackIds(input.seedTrackIds, tracks);
  if (seedTrackIds.length === 0) {
    throw new Error('Gecerli seed bulunamadi.');
  }

  const scopeId = (input.scopeId ?? 'runtime-drift-cli').trim() || 'runtime-drift-cli';
  const windowSize = Math.max(3, Math.floor(input.windowSize ?? 8));
  const requiredRelevantTargetsPerSeed = Math.max(1, Math.floor(input.requiredRelevantTargetsPerSeed ?? 2));
  const limit = Math.max(1, Math.floor(input.limit ?? 5));
  const goodThreshold = Math.max(0, Math.min(1, input.goodThreshold ?? 0.6));

  const normalizedRelevanceMap = normalizeRelevantTargets(input.relevantTargetsBySeed, seedTrackIds);

  installBrowserMocks();
  const persistedRelevanceMap = await prepareTransitionState(tracks, normalizedRelevanceMap);

  for (const run of input.runs) {
    const runtimeEvents = normalizeRuntimeEvents(run.events ?? []);
    runtimeEvents.forEach((event) => {
      recordTransitionRuntimeEvent(event);
    });

    await runBaselineEvaluation({
      seedTrackIds,
      relevantTargetsBySeed: persistedRelevanceMap,
      scopeLabel: 'custom',
      scopeId,
      requiredRelevantTargetsPerSeed,
      limit,
      goodThreshold,
      enforceRelevantTargetMinimum: true,
    });
  }

  const report = buildRuntimeThresholdDriftReport({
    scopeId,
    windowSize,
  });

  if (input.requireReport && report === null) {
    throw new Error('Yeterli runtime run bulunamadi; drift raporu uretilemedi.');
  }

  const artifact = {
    generatedAt: new Date().toISOString(),
    scopeId,
    windowSize,
    runCount: input.runs.length,
    report,
  };

  if (report) {
    console.log(`[runtime:drift] overall=${report.overallStatus} runs=${report.runCount}`);
    console.log(`[runtime:drift] ${report.summary}`);
  } else {
    console.log('[runtime:drift] report unavailable (not enough runtime baseline runs).');
  }

  if (outputPath) {
    const absoluteOutputPath = path.isAbsolute(outputPath)
      ? outputPath
      : path.resolve(process.cwd(), outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await fs.writeFile(absoluteOutputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf-8');
    console.log(`[runtime:drift] artifact written: ${absoluteOutputPath}`);
    return;
  }

  console.log(JSON.stringify(artifact, null, 2));
}

void main().catch((error) => {
  console.error('[runtime:drift] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
