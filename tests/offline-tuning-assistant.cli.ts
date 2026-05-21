import fs from 'node:fs/promises';
import path from 'node:path';

type GateStatus = 'pass' | 'fail';
type RiskLevel = 'low' | 'medium' | 'high';
type ProposedActionType =
  | 'weight_change'
  | 'penalty_change'
  | 'gate_threshold_change'
  | 'label_fix'
  | 'data_gap'
  | 'runtime_investigation'
  | 'no_change';

interface CliArgs {
  inputPath: string | null;
  outputPath: string | null;
  diagnosticBundlePath: string | null;
  beforeAfterReportPath: string | null;
}

interface BottomSeedReport {
  trackId: string;
  top1Score?: number;
  meanTopKScore?: number;
  hitAt3?: number | null;
  hitAt5?: number | null;
  averageEventMatchScore?: number;
  averageEmbeddingSimilarity?: number;
  averageTempoRatioScore?: number;
  averageHarmonicCompatibilityScore?: number;
  averageRhythmAlignmentScore?: number;
  averageLoudnessContinuityScore?: number;
  averageSmoothnessScore?: number;
  averageArtifactPenalty?: number;
  dominantDriver?: string | null;
}

interface TuningAction {
  trackId: string;
  issue: string;
  recommendation: string;
  confidence: number;
  priority?: 'normal' | 'high';
  escalationReason?: string | null;
  gateFailDistribution?: Array<{
    reason: string;
    count: number;
    rate: number;
  }>;
}

interface BaselineLike {
  scopeId?: string;
  seedSetHash?: string;
  runMode?: string;
  scoringVersion?: string;
  analysisVersion?: string | number;
  runAt?: string;
  hitAt3?: number | null;
  hitAt5?: number | null;
  meanTopKScore?: number;
  coverageRate?: number;
  labeledSeedCount?: number;
  regressionDetected?: boolean;
  regressionSummary?: string | null;
  regressionGatePassed?: boolean;
  runtimeGatePassed?: boolean;
  runtimeGateSummary?: string | null;
  tuningValidationPassed?: boolean;
  tuningValidationSummary?: string | null;
  benchmarkMergeGatePassed?: boolean;
  bottomSeeds?: BottomSeedReport[];
  tuningActions?: TuningAction[];
}

interface DiagnosticCandidate {
  targetTrackId: string;
  targetTimeMs: number;
  finalScore: number;
  smoothnessScore: number;
  dominantDriver: string;
  explainTopReasons: string[];
  gateStatus: GateStatus;
  skipReason?: string;
}

interface DiagnosticEntry {
  trackId: string;
  candidateBreakdown?: DiagnosticCandidate[];
}

function parseArgs(argv: string[]): CliArgs {
  const readFlagValue = (flag: string): string | null => {
    const index = argv.findIndex((token) => token === flag);
    if (index < 0) return null;
    const value = argv[index + 1];
    return value ? value.trim() : null;
  };
  return {
    inputPath: readFlagValue('--input'),
    outputPath: readFlagValue('--output'),
    diagnosticBundlePath: readFlagValue('--diagnostic-bundle'),
    beforeAfterReportPath: readFlagValue('--before-after'),
  };
}

function toAbsolutePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
}

async function readJson(filePath: string): Promise<unknown> {
  const raw = await fs.readFile(toAbsolutePath(filePath), 'utf-8');
  return JSON.parse(raw) as unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function extractBaselineArtifact(input: unknown): BaselineLike {
  const root = asRecord(input);
  const direct = root.baselineResult;
  if (isRecord(direct)) return direct as unknown as BaselineLike;

  const selected = asRecord(root.selected);
  if (isRecord(selected.baselineResult)) return selected.baselineResult as unknown as BaselineLike;

  if (Array.isArray(root.bottomSeeds) || Array.isArray(root.tuningActions)) {
    return root as unknown as BaselineLike;
  }

  throw new Error('Baseline artifact bulunamadi. tuning:loop ciktisi veya baselineResult iceren JSON gerekli.');
}

function extractDiagnostics(input: unknown): DiagnosticEntry[] {
  const root = asRecord(input);
  const diagnostics = root.diagnostics;
  if (!Array.isArray(diagnostics)) return [];
  return diagnostics
    .map((item) => asRecord(item))
    .filter((item) => typeof item.trackId === 'string')
    .map((item) => ({
      trackId: asString(item.trackId),
      candidateBreakdown: Array.isArray(item.candidateBreakdown)
        ? item.candidateBreakdown.map((candidate) => {
            const row = asRecord(candidate);
            return {
              targetTrackId: asString(row.targetTrackId),
              targetTimeMs: asNumber(row.targetTimeMs),
              finalScore: asNumber(row.finalScore),
              smoothnessScore: asNumber(row.smoothnessScore),
              dominantDriver: asString(row.dominantDriver, 'unknown'),
              explainTopReasons: Array.isArray(row.explainTopReasons)
                ? row.explainTopReasons.map((reason) => asString(reason)).filter(Boolean)
                : [],
              gateStatus: row.gateStatus === 'fail' ? 'fail' : 'pass',
              skipReason: typeof row.skipReason === 'string' ? row.skipReason : undefined,
            };
          })
        : [],
    }));
}

function extractBeforeAfterDelta(input: unknown): Record<string, unknown> | null {
  const comparison = asRecord(asRecord(input).comparison);
  if (Object.keys(comparison).length === 0) return null;
  return {
    hitAt3Delta: asNullableNumber(comparison.hitAt3Delta),
    hitAt5Delta: asNullableNumber(comparison.hitAt5Delta),
    meanTopKScoreDelta: asNullableNumber(comparison.meanTopKScoreDelta),
    sameScopeId: asBoolean(comparison.sameScopeId),
    sameSeedSet: asBoolean(comparison.sameSeedSet),
  };
}

function resolveRisk(input: {
  baseline: BaselineLike;
  seed: BottomSeedReport;
  action: TuningAction | null;
  candidateBreakdown: DiagnosticCandidate[];
}): RiskLevel {
  if (
    input.baseline.regressionDetected
    || input.baseline.regressionGatePassed === false
    || input.baseline.runtimeGatePassed === false
    || input.baseline.benchmarkMergeGatePassed === false
    || input.action?.priority === 'high'
  ) {
    return 'high';
  }
  if (
    asNumber(input.seed.averageArtifactPenalty) >= 0.55
    || asNumber(input.baseline.coverageRate, 1) < 0.8
    || input.candidateBreakdown.some((candidate) => candidate.gateStatus === 'fail')
  ) {
    return 'medium';
  }
  return 'low';
}

function describeDiagnosis(seed: BottomSeedReport, action: TuningAction | null, risk: RiskLevel): string {
  if (action) {
    return `${seed.trackId}: ${action.issue} baskin gorunuyor; risk=${risk}.`;
  }
  if (asNumber(seed.averageArtifactPenalty) >= 0.55) {
    return `${seed.trackId}: artifact penalty yuksek; penalty/gate etkisi incelenmeli.`;
  }
  return `${seed.trackId}: net tuning action yok; candidate breakdown ve label kalitesi kontrol edilmeli.`;
}

function buildValidationPlan(action: TuningAction | null): string {
  if (!action) {
    return 'Ayni scopeId ve seedSetHash ile benchmark baseline + regression gate kos.';
  }
  return `Oneri uygulamadan once ${action.issue} odakli tek deneme yap; ardindan ayni scopeId/seedSetHash ile pnpm run pipeline:quality kos.`;
}

function mapActionType(issue: string): ProposedActionType {
  if (issue === 'penalty') return 'penalty_change';
  if (issue === 'runtime') return 'runtime_investigation';
  if (issue === 'labels') return 'label_fix';
  if (issue === 'event' || issue === 'embedding' || issue === 'rhythm' || issue === 'loudness') {
    return 'weight_change';
  }
  return 'no_change';
}

function buildReport(input: {
  baseline: BaselineLike;
  inputPath: string;
  diagnosticBundlePath: string | null;
  beforeAfterReportPath: string | null;
  diagnostics: DiagnosticEntry[];
  beforeAfterDelta: Record<string, unknown> | null;
}): Record<string, unknown> {
  const actions = Array.isArray(input.baseline.tuningActions) ? input.baseline.tuningActions : [];
  const bottomSeeds = Array.isArray(input.baseline.bottomSeeds) ? input.baseline.bottomSeeds : [];
  const diagnosticsByTrackId = new Map(input.diagnostics.map((item) => [item.trackId, item]));
  const actionsByTrackId = new Map(actions.map((action) => [action.trackId, action]));

  const bottomSeedDiagnostics = bottomSeeds.slice(0, 3).map((seed, index) => {
    const currentAction = actionsByTrackId.get(seed.trackId) ?? null;
    const candidateBreakdown = diagnosticsByTrackId.get(seed.trackId)?.candidateBreakdown ?? [];
    const risk = resolveRisk({
      baseline: input.baseline,
      seed,
      action: currentAction,
      candidateBreakdown,
    });
    return {
      trackId: seed.trackId,
      rank: index + 1,
      seedScores: {
        top1Score: asNumber(seed.top1Score),
        meanTopKScore: asNumber(seed.meanTopKScore),
        hitAt3: seed.hitAt3 ?? null,
        hitAt5: seed.hitAt5 ?? null,
        event: asNumber(seed.averageEventMatchScore),
        embedding: asNumber(seed.averageEmbeddingSimilarity),
        tempoRatio: asNumber(seed.averageTempoRatioScore),
        harmonicCompatibility: asNumber(seed.averageHarmonicCompatibilityScore),
        rhythm: asNumber(seed.averageRhythmAlignmentScore),
        loudness: asNumber(seed.averageLoudnessContinuityScore),
        smoothness: asNumber(seed.averageSmoothnessScore),
        artifactPenalty: asNumber(seed.averageArtifactPenalty),
        dominantDriver: seed.dominantDriver ?? null,
      },
      currentAction,
      candidateBreakdown,
      assistantDiagnosis: describeDiagnosis(seed, currentAction, risk),
      assistantRecommendation: currentAction?.recommendation ?? 'Once label coverage ve candidate breakdown dogrulanmali.',
      risk,
    };
  });

  const proposedActions = actions.length === 0
    ? [{
        type: 'no_change' as ProposedActionType,
        target: 'labels',
        reason: 'Baseline tuning action uretmedi; veri/label kalitesi once kontrol edilmeli.',
        expectedMetricImpact: {
          hitAt3: 'unknown',
          hitAt5: 'unknown',
          meanTopKScore: 'unknown',
          runtimeGate: 'unknown',
        },
        validationPlan: buildValidationPlan(null),
      }]
    : actions.map((action) => ({
        type: mapActionType(action.issue),
        target: action.issue,
        reason: action.recommendation,
        expectedMetricImpact: {
          hitAt3: 'unknown',
          hitAt5: 'unknown',
          meanTopKScore: 'up',
          runtimeGate: action.issue === 'penalty' ? 'improve' : 'unknown',
        },
        validationPlan: buildValidationPlan(action),
      }));

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputArtifacts: {
      baselineArtifactPath: input.inputPath,
      diagnosticBundlePath: input.diagnosticBundlePath,
      beforeAfterReportPath: input.beforeAfterReportPath,
    },
    runIdentity: {
      scopeId: input.baseline.scopeId ?? null,
      seedSetHash: input.baseline.seedSetHash ?? null,
      runMode: input.baseline.runMode ?? null,
      scoringVersion: input.baseline.scoringVersion ?? null,
      analysisVersion: input.baseline.analysisVersion ?? null,
      runAt: input.baseline.runAt ?? null,
    },
    qualitySummary: {
      hitAt3: input.baseline.hitAt3 ?? null,
      hitAt5: input.baseline.hitAt5 ?? null,
      meanTopKScore: asNumber(input.baseline.meanTopKScore),
      coverageRate: asNumber(input.baseline.coverageRate),
      labeledSeedCount: asNumber(input.baseline.labeledSeedCount),
      regressionDetected: Boolean(input.baseline.regressionDetected),
      regressionSummary: input.baseline.regressionSummary ?? null,
      beforeAfterDelta: input.beforeAfterDelta,
    },
    gateSummary: {
      regressionGatePassed: input.baseline.regressionGatePassed !== false,
      runtimeGatePassed: input.baseline.runtimeGatePassed !== false,
      runtimeGateSummary: input.baseline.runtimeGateSummary ?? null,
      tuningValidationPassed: input.baseline.tuningValidationPassed !== false,
      tuningValidationSummary: input.baseline.tuningValidationSummary ?? null,
      benchmarkMergeGatePassed: input.baseline.benchmarkMergeGatePassed !== false,
    },
    bottomSeedDiagnostics,
    proposedActions,
    acceptanceCriteria: {
      sameScopeId: true,
      sameSeedSetHash: true,
      noHitAt3Regression: true,
      noHitAt5Regression: true,
      runtimeGatePassed: true,
      requiredCommand: 'pnpm run pipeline:quality',
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.inputPath) {
    throw new Error('Input gerekli. Ornek: pnpm run tuning:assistant -- --input ./dataset/output/tuning-loop.json --output ./dataset/output/tuning-assistant.json');
  }

  const baselineInput = await readJson(args.inputPath);
  const diagnosticInput = args.diagnosticBundlePath ? await readJson(args.diagnosticBundlePath) : null;
  const beforeAfterInput = args.beforeAfterReportPath ? await readJson(args.beforeAfterReportPath) : null;
  const report = buildReport({
    baseline: extractBaselineArtifact(baselineInput),
    inputPath: args.inputPath,
    diagnosticBundlePath: args.diagnosticBundlePath,
    beforeAfterReportPath: args.beforeAfterReportPath,
    diagnostics: diagnosticInput ? extractDiagnostics(diagnosticInput) : [],
    beforeAfterDelta: beforeAfterInput ? extractBeforeAfterDelta(beforeAfterInput) : null,
  });

  if (args.outputPath) {
    const absoluteOutputPath = toAbsolutePath(args.outputPath);
    await fs.mkdir(path.dirname(absoluteOutputPath), { recursive: true });
    await fs.writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
    console.log(`[offline:tuning-assistant] artifact written: ${absoluteOutputPath}`);
    return;
  }

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error('[offline:tuning-assistant] FAILED:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
