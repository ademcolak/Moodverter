import fs from 'node:fs/promises';
import path from 'node:path';
import { buildEvaluationProgressReport, type AnalysisState } from '../src/services/transition';
import type { TransitionRelevanceMap } from '../src/services/transition';

interface ReportInputFile {
  seedTrackIds?: string[];
  requiredRelevantTargetsPerSeed?: number;
  relevanceMap?: TransitionRelevanceMap;
  analysisStates?: Record<string, Partial<AnalysisState>>;
}

function parseArgs(argv: string[]): { inputPath: string | null } {
  const inputIndex = argv.findIndex((token) => token === '--input');
  if (inputIndex < 0) return { inputPath: null };
  const maybePath = argv[inputIndex + 1];
  return { inputPath: maybePath ? maybePath.trim() : null };
}

function normalizeAnalysisStates(raw: Record<string, Partial<AnalysisState>> | undefined): Record<string, AnalysisState> {
  if (!raw) return {};
  return Object.fromEntries(
    Object.entries(raw)
      .map(([trackId, state]) => {
        const normalizedTrackId = trackId.trim();
        if (!normalizedTrackId) return null;
        const status: AnalysisState['status'] =
          state.status === 'ready' || state.status === 'failed' || state.status === 'pending'
            ? state.status
            : 'pending';
        return [normalizedTrackId, {
          trackId: normalizedTrackId,
          status,
          updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
          version: Number.isFinite(state.version) ? Number(state.version) : 0,
        }] as const;
      })
      .filter((entry): entry is readonly [string, AnalysisState] => entry !== null)
  );
}

async function loadInputFile(filePath: string | null): Promise<ReportInputFile | null> {
  if (!filePath) return null;
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(absolutePath, 'utf-8');
  return JSON.parse(raw) as ReportInputFile;
}

function printUsage(): void {
  console.log('Usage: pnpm run eval:report -- --input <path-to-json>');
  console.log('Input schema keys: seedTrackIds, analysisStates, relevanceMap, requiredRelevantTargetsPerSeed');
}

async function main(): Promise<void> {
  const { inputPath } = parseArgs(process.argv.slice(2));
  const envInputPath = process.env.EVAL_REPORT_INPUT?.trim() || null;
  const resolvedInputPath = inputPath || envInputPath;
  const inputFile = await loadInputFile(resolvedInputPath);

  if (!inputFile) {
    printUsage();
    console.log('No input provided. Rendering empty report.');
  }

  const report = buildEvaluationProgressReport({
    seedTrackIds: inputFile?.seedTrackIds ?? [],
    analysisStates: normalizeAnalysisStates(inputFile?.analysisStates),
    relevanceMap: inputFile?.relevanceMap ?? {},
    requiredRelevantTargetsPerSeed: inputFile?.requiredRelevantTargetsPerSeed ?? 2,
  });

  console.log('Evaluation Progress Report');
  console.log(`GeneratedAt: ${report.generatedAt}`);
  console.log(`Ready: ${report.readySeedCount}/${report.totalSeedCount}`);
  console.log(`Label Gate: ${report.labelGatePassedSeedCount}/${report.totalSeedCount}`);

  if (report.rows.length === 0) {
    console.log('No seed rows found.');
    return;
  }

  console.log('Rows:');
  report.rows.forEach((row) => {
    console.log(
      `- ${row.seedTrackId} | analysis=${row.analysisStatus} | labels=${row.relevantTargetCount}/${report.requiredRelevantTargetsPerSeed} | ready=${row.readyForBaseline ? 'yes' : 'no'}`
    );
  });
}

void main().catch((error) => {
  console.error('eval:report failed:', error);
  process.exitCode = 1;
});
