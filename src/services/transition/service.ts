import type {
  AutoTransitionSeedSkipSummary,
  AutoTransitionDecisionConfig,
  BenchmarkRunMeta,
  BenchmarkRunMode,
  AnalysisState,
  AnalysisStatus,
  BaselineEvaluationInput,
  BaselineEvaluationResult,
  BaselineRunArtifact,
  BaselineScopeLabel,
  BaselineSeedReport,
  BaselineTuningAction,
  FindTransitionCandidatesInput,
  HardGateConfig,
  RecordTransitionRuntimeEventInput,
  RuntimeDriftStatus,
  RuntimeGateCalibration,
  RuntimeGateCalibrationInput,
  RuntimeThresholdDriftInput,
  RuntimeThresholdDriftMetric,
  RuntimeThresholdDriftReport,
  SeedRelevantTargetGap,
  BottomSeedDiagnostic,
  BottomSeedDiagnosticBundle,
  TransitionCandidate,
  TransitionFeedbackEntry,
  TransitionFeedbackModel,
  TransitionFeedbackPairStats,
  TransitionDecisionExplain,
  TransitionDecision,
  TransitionEdgeScore,
  TransitionGateReason,
  TransitionGateResult,
  TransitionPerformanceTier,
  TransitionScoreDiagnostic,
  TransitionScoreDriver,
  TransitionEventType,
  TransitionNode,
  TransitionRuntimeEvent,
  TransitionSkipReasonBreakdown,
} from './types';
import { extractTransitionNodesV1 } from './analyzer';
import { computeHitAtK } from './metrics';
import type { UnifiedTrack } from '../../types/provider';
import { createRetrievalIndex } from './retrieval-index';

const ANALYSIS_VERSION = 2;
const BASELINE_RUN_SCHEMA_VERSION = 2;
export const TRANSITION_SCORING_VERSION = 'v2';
export const TRANSITION_VNEXT_ENABLED = true;
export const LEARNING_BIAS_ENABLED = true;
export const SILENCE_AWARE_ENVELOPE_ENABLED = true;
export const PHASE_04_BASELINE_REFERENCE = Object.freeze({
  decisionPolicy: {
    minTop1Score: 0.62,
    minTop1Top2Margin: 0.06,
    maxArtifactPenalty: 0.58,
  },
  hardGate: {
    minEventConfidence: 0.45,
    maxTempoRatioDistance: 0.35,
    maxKeyDistanceClass: 4,
    maxLoudnessJumpDb: 9,
  },
  runtimeGate: {
    minTransitionRuntimeSampleCount: 10,
    maxTransitionLatencyP95Ms: 2200,
    maxTransitionStallRate: 0.2,
    maxTransitionDropRate: 0.1,
  },
});

const STORAGE_KEYS = {
  queue: 'moodverter_transition_analysis_queue',
  states: 'moodverter_transition_analysis_states',
  nodes: 'moodverter_transition_nodes',
  baselineRuns: 'moodverter_transition_baseline_runs',
  runtimeEvents: 'moodverter_transition_runtime_events',
  trackMetadata: 'moodverter_transition_track_metadata',
  feedbackModel: 'moodverter_transition_feedback_model',
} as const;

const SCORE_WEIGHTS = {
  eventMatch: 0.35,
  embedding: 0.3,
  rhythm: 0.2,
  loudness: 0.15,
  artifactPenalty: 0.25,
} as const;
export const TRANSITION_SCORE_WEIGHTS = {
  ...SCORE_WEIGHTS,
} as const;

export const DEFAULT_RUNTIME_GATE_THRESHOLDS = {
  ...PHASE_04_BASELINE_REFERENCE.runtimeGate,
} as const;

export const DEFAULT_HARD_GATE_CONFIG: HardGateConfig = {
  ...PHASE_04_BASELINE_REFERENCE.hardGate,
};

export const DEFAULT_AUTO_TRANSITION_DECISION_CONFIG: AutoTransitionDecisionConfig = {
  ...PHASE_04_BASELINE_REFERENCE.decisionPolicy,
  confidenceThreshold: 0.58,
  fallbackOnLowConfidence: true,
  manualQueueOnLowConfidence: true,
};
const DIVERSITY_BUDGET_BY_TIER: Record<TransitionPerformanceTier, number> = {
  high: 3,
  mid: 5,
  low: 7,
};
const NEAR_DUPLICATE_TARGET_WINDOW_MS = 5000;
const FEEDBACK_BAD_STREAK_BLACKLIST_THRESHOLD = 3;
const FEEDBACK_BLACKLIST_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LEARNING_BIAS_MAX_ABS = 0.12;
const RUNTIME_PAIR_BIAS_MAX_ABS = 0.14;
const RUNTIME_PAIR_BIAS_MIN_SAMPLES = 4;
const RUNTIME_PAIR_BIAS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const RUNTIME_PAIR_BIAS_HALFLIFE_MS = 3 * 24 * 60 * 60 * 1000;
const RUNTIME_CONTEXT_BIAS_MAX_ABS = 0.08;
const RUNTIME_CONTEXT_BIAS_MIN_SAMPLES = 5;
const DECISION_MARGIN_UNCERTAINTY_MULTIPLIER = 1.35;
const DECISION_RUNTIME_RISK_BIAS_THRESHOLD = -0.04;
const DECISION_ARTIFACT_RISK_THRESHOLD = 0.36;
const BENCHMARK_MINIMUM_COVERAGE_DEFAULT = 0.8;

const EVENT_COMPATIBILITY: Record<string, Partial<Record<string, number>>> = {
  'scream-hit': {
    'scream-hit': 1,
    'vocal-hit': 0.75,
    'build-up': 0.45,
    drop: 0.5,
    'bass-hit': 0.55,
    'percussive-hit': 0.35,
    'silence-break': 0.25,
    other: 0.2,
  },
  'vocal-hit': {
    'vocal-hit': 1,
    'scream-hit': 0.75,
    'build-up': 0.7,
    drop: 0.45,
    'bass-hit': 0.5,
    'percussive-hit': 0.3,
    'silence-break': 0.2,
    other: 0.2,
  },
  'build-up': {
    'build-up': 1,
    drop: 0.9,
    'bass-hit': 0.8,
    'vocal-hit': 0.7,
    'percussive-hit': 0.55,
    'scream-hit': 0.45,
    'silence-break': 0.25,
    other: 0.3,
  },
  drop: {
    drop: 1,
    'bass-hit': 0.85,
    'build-up': 0.7,
    'percussive-hit': 0.65,
    'vocal-hit': 0.45,
    'scream-hit': 0.5,
    'silence-break': 0.2,
    other: 0.25,
  },
  'bass-hit': {
    'bass-hit': 1,
    drop: 0.85,
    'build-up': 0.8,
    'percussive-hit': 0.75,
    'vocal-hit': 0.5,
    'scream-hit': 0.55,
    'silence-break': 0.2,
    other: 0.25,
  },
  'percussive-hit': {
    'percussive-hit': 1,
    'bass-hit': 0.75,
    drop: 0.65,
    'build-up': 0.55,
    'vocal-hit': 0.3,
    'scream-hit': 0.35,
    'silence-break': 0.2,
    other: 0.2,
  },
  'silence-break': {
    'silence-break': 1,
    'build-up': 0.45,
    drop: 0.3,
    'bass-hit': 0.3,
    'vocal-hit': 0.2,
    'scream-hit': 0.2,
    'percussive-hit': 0.2,
    other: 0.2,
  },
  other: {
    other: 1,
    'vocal-hit': 0.25,
    'scream-hit': 0.25,
    'build-up': 0.3,
    drop: 0.25,
    'bass-hit': 0.3,
    'percussive-hit': 0.25,
    'silence-break': 0.25,
  },
};

let isHydrated = false;
let analysisQueue: string[] = [];
let analysisStates: Record<string, AnalysisState> = {};
let nodesByTrack: Record<string, TransitionNode[]> = {};
let trackMetadataById: Record<string, { name: string; artist: string }> = {};
let baselineRunHistory: BaselineRunArtifact[] = [];
let transitionRuntimeEvents: TransitionRuntimeEvent[] = [];
let transitionFeedbackModel: TransitionFeedbackModel = {
  updatedAt: nowIsoString(),
  byPair: {},
};
let isStorageWriteDisabled = false;
const warnedStorageKeys = new Set<string>();

function normalizeTrackId(trackId: string): string {
  const normalized = trackId.trim();
  if (!normalized) {
    throw new Error('trackId is required');
  }
  return normalized;
}

function normalizeScopeId(scopeLabel: BaselineScopeLabel, scopeId: string | undefined, seedTrackIds: string[]): string {
  const normalizedScopeId = (scopeId ?? '').trim();
  if (normalizedScopeId.length > 0) return normalizedScopeId;
  if (scopeLabel !== 'custom') return scopeLabel;
  const sortedSeedIds = [...seedTrackIds].sort((a, b) => a.localeCompare(b));
  return `custom:${sortedSeedIds.join(',')}`;
}

function computeSeedSetHash(seedTrackIds: string[]): string {
  const canonical = [...new Set(seedTrackIds.map((trackId) => trackId.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b))
    .join('|');
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

function resolveRunMode(value: BaselineEvaluationInput['runMode']): BenchmarkRunMode {
  return value === 'real' ? 'real' : 'synthetic';
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.round(clamp(value, min, max));
}

function normalizeTrackIds(trackIds: string[] | undefined): string[] {
  if (!Array.isArray(trackIds)) return [];
  return Array.from(
    new Set(
      trackIds
        .map((trackId) => trackId.trim())
        .filter((trackId) => trackId.length > 0)
    )
  );
}

function computePercentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sortedValues = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)
  );
  return sortedValues[index];
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return fallback;
}

function sanitizeNumericArray(value: unknown, fallbackSize: number): number[] {
  if (!Array.isArray(value)) {
    return Array.from({ length: fallbackSize }, () => 0);
  }

  const next = value
    .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : 0))
    .slice(0, fallbackSize);

  if (next.length < fallbackSize) {
    return [...next, ...Array.from({ length: fallbackSize - next.length }, () => 0)];
  }
  return next;
}

function toOptionalFiniteRate(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clamp(value, 0, 1);
  }
  return null;
}

function parseTransitionScoreDriver(value: unknown): TransitionScoreDriver | null {
  if (
    value === 'event'
    || value === 'embedding'
    || value === 'rhythm'
    || value === 'loudness'
    || value === 'penalty'
  ) {
    return value;
  }
  return null;
}

function isTransitionGateReason(value: unknown): value is TransitionGateReason {
  return value === 'NO_CANDIDATE'
    || value === 'DUPLICATE_CLUSTER'
    || value === 'LOW_CONFIDENCE_FALLBACK'
    || value === 'HIGH_ARTIFACT_RISK'
    || value === 'MANUAL_QUEUE_SUGGESTED'
    || value === 'EVENT_MISMATCH'
    || value === 'LOW_EVENT_CONFIDENCE'
    || value === 'TEMPO_OUT_OF_RANGE'
    || value === 'KEY_DISTANCE_HIGH'
    || value === 'LOUDNESS_JUMP_HIGH'
    || value === 'LOW_SCORE'
    || value === 'LOW_MARGIN';
}

function parseTransitionGateReasons(value: unknown): TransitionGateReason[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter(isTransitionGateReason)));
}

function sanitizeTransitionSkipReasonBreakdowns(value: unknown): TransitionSkipReasonBreakdown[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const typed = item as Record<string, unknown>;
      const reason = parseTransitionGateReasons([typed.reason])[0];
      if (!reason) return null;
      return {
        reason,
        count: Math.max(0, Math.floor(toFiniteNumber(typed.count, 0))),
        rate: clamp(toFiniteNumber(typed.rate, 0), 0, 1),
      } as TransitionSkipReasonBreakdown;
    })
    .filter((item): item is TransitionSkipReasonBreakdown => item !== null);
}

function sanitizeAutoTransitionSeedSkipSummary(value: unknown): AutoTransitionSeedSkipSummary | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const trackId = typeof entry.trackId === 'string' ? entry.trackId.trim() : '';
  if (!trackId) return null;
  return {
    trackId,
    decisionSampleCount: Math.max(0, Math.floor(toFiniteNumber(entry.decisionSampleCount, 0))),
    skippedCount: Math.max(0, Math.floor(toFiniteNumber(entry.skippedCount, 0))),
    skipRate: toOptionalFiniteRate(entry.skipRate),
    topSkipReasons: sanitizeTransitionSkipReasonBreakdowns(entry.topSkipReasons),
  };
}

function sanitizeBaselineSeedReport(value: unknown): BaselineSeedReport | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const trackId = typeof entry.trackId === 'string' ? entry.trackId.trim() : '';
  if (trackId.length === 0) return null;

  return {
    trackId,
    candidateCount: Math.max(0, Math.floor(toFiniteNumber(entry.candidateCount, 0))),
    top1Score: clamp(toFiniteNumber(entry.top1Score, 0), 0, 1),
    meanTopKScore: clamp(toFiniteNumber(entry.meanTopKScore, 0), 0, 1),
    hasGoodCandidate: Boolean(entry.hasGoodCandidate),
    hitAt3: toOptionalFiniteRate(entry.hitAt3),
    hitAt5: toOptionalFiniteRate(entry.hitAt5),
    averageEventMatchScore: clamp(toFiniteNumber(entry.averageEventMatchScore, 0), 0, 1),
    averageEmbeddingSimilarity: clamp(toFiniteNumber(entry.averageEmbeddingSimilarity, 0), 0, 1),
    averageTempoRatioScore: clamp(toFiniteNumber(entry.averageTempoRatioScore, 0), 0, 1),
    averageHarmonicCompatibilityScore: clamp(toFiniteNumber(entry.averageHarmonicCompatibilityScore, 0), 0, 1),
    averageRhythmAlignmentScore: clamp(toFiniteNumber(entry.averageRhythmAlignmentScore, 0), 0, 1),
    averageLoudnessContinuityScore: clamp(toFiniteNumber(entry.averageLoudnessContinuityScore, 0), 0, 1),
    averageSmoothnessScore: clamp(
      toFiniteNumber(
        entry.averageSmoothnessScore,
        (
          toFiniteNumber(entry.averageRhythmAlignmentScore, 0)
          + toFiniteNumber(entry.averageLoudnessContinuityScore, 0)
        ) / 2
      ),
      0,
      1
    ),
    averageArtifactPenalty: clamp(toFiniteNumber(entry.averageArtifactPenalty, 0), 0, 1),
    dominantDriver: parseTransitionScoreDriver(entry.dominantDriver),
  };
}

function sanitizeBaselineTuningAction(value: unknown): BaselineTuningAction | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const trackId = typeof entry.trackId === 'string' ? entry.trackId.trim() : '';
  const issue = parseTransitionScoreDriver(entry.issue);
  if (trackId.length === 0 || issue === null) return null;

  const recommendation = typeof entry.recommendation === 'string'
    ? entry.recommendation.trim()
    : '';
  if (recommendation.length === 0) return null;
  const gateFailSampleCount = Math.max(0, Math.floor(toFiniteNumber(entry.gateFailSampleCount, 0)));
  const gateFailDistribution = Array.isArray(entry.gateFailDistribution)
    ? entry.gateFailDistribution
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const typed = item as Record<string, unknown>;
          const reasons = parseTransitionGateReasons([typed.reason]);
          const reason = reasons[0];
          if (!reason) return null;
          return {
            reason,
            count: Math.max(0, Math.floor(toFiniteNumber(typed.count, 0))),
            rate: clamp(toFiniteNumber(typed.rate, 0), 0, 1),
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
    : [];

  return {
    trackId,
    issue,
    recommendation,
    confidence: clamp(toFiniteNumber(entry.confidence, 0.5), 0, 1),
    priority: entry.priority === 'high' ? 'high' : 'normal',
    escalationReason: typeof entry.escalationReason === 'string' ? entry.escalationReason : null,
    gateFailSampleCount,
    gateFailDistribution,
  };
}

function sanitizeTransitionRuntimeEvent(value: unknown): TransitionRuntimeEvent | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const sourceTrackId = typeof entry.sourceTrackId === 'string' ? entry.sourceTrackId.trim() : '';
  const targetTrackId = typeof entry.targetTrackId === 'string' ? entry.targetTrackId.trim() : '';
  if (sourceTrackId.length === 0 || targetTrackId.length === 0) return null;

  const recordedAt = typeof entry.recordedAt === 'string' && entry.recordedAt.trim().length > 0
    ? entry.recordedAt
    : nowIsoString();
  const latencyMs = Math.max(0, Math.round(toFiniteNumber(entry.latencyMs, 0)));
  const audibleReadyWaitMs =
    typeof entry.audibleReadyWaitMs === 'number' && Number.isFinite(entry.audibleReadyWaitMs)
      ? Math.max(0, Math.round(entry.audibleReadyWaitMs))
      : undefined;
  const recoverPlaybackWaitMs =
    typeof entry.recoverPlaybackWaitMs === 'number' && Number.isFinite(entry.recoverPlaybackWaitMs)
      ? Math.max(0, Math.round(entry.recoverPlaybackWaitMs))
      : undefined;
  const overlapAppliedMs =
    typeof entry.overlapAppliedMs === 'number' && Number.isFinite(entry.overlapAppliedMs)
      ? Math.max(0, Math.round(entry.overlapAppliedMs))
      : undefined;
  const sourceFadeOutMs =
    typeof entry.sourceFadeOutMs === 'number' && Number.isFinite(entry.sourceFadeOutMs)
      ? Math.max(0, Math.round(entry.sourceFadeOutMs))
      : undefined;
  const mode = entry.mode === 'manual' ? 'manual' : 'auto';

  return {
    recordedAt,
    sourceTrackId,
    targetTrackId,
    latencyMs,
    audibleReadyWaitMs,
    recoverPlaybackWaitMs,
    overlapAppliedMs,
    sourceFadeOutMs,
    stalled: Boolean(entry.stalled),
    dropped: Boolean(entry.dropped),
    mode,
    skippedAutoTransition: Boolean(entry.skippedAutoTransition),
    skipReasons: parseTransitionGateReasons(entry.skipReasons),
    confidenceScore: toOptionalFiniteRate(entry.confidenceScore) ?? undefined,
    decisionReasonPrimary: parseTransitionGateReasons([entry.decisionReasonPrimary])[0],
    fallbackTriggered: Boolean(entry.fallbackTriggered),
    manualQueueSuggested: Boolean(entry.manualQueueSuggested),
    manualAccepted: Boolean(entry.manualAccepted),
  };
}

function sanitizeFeedbackPairStats(value: unknown): TransitionFeedbackPairStats | null {
  if (!value || typeof value !== 'object') return null;
  const entry = value as Record<string, unknown>;
  const sourceTrackId = typeof entry.sourceTrackId === 'string' ? entry.sourceTrackId.trim() : '';
  const targetTrackId = typeof entry.targetTrackId === 'string' ? entry.targetTrackId.trim() : '';
  if (!sourceTrackId || !targetTrackId) return null;
  const pairKey = typeof entry.pairKey === 'string' && entry.pairKey.trim().length > 0
    ? entry.pairKey.trim()
    : `${sourceTrackId}->${targetTrackId}`;
  const updatedAt = typeof entry.updatedAt === 'string' && entry.updatedAt.trim().length > 0
    ? entry.updatedAt
    : nowIsoString();
  const totalCount = Math.max(0, Math.floor(toFiniteNumber(entry.totalCount, 0)));
  const goodCount = Math.max(0, Math.floor(toFiniteNumber(entry.goodCount, 0)));
  const okCount = Math.max(0, Math.floor(toFiniteNumber(entry.okCount, 0)));
  const badCount = Math.max(0, Math.floor(toFiniteNumber(entry.badCount, 0)));
  const meanScore = clamp(toFiniteNumber(entry.meanScore, 0.5), 0, 1);
  const badStreak = Math.max(0, Math.floor(toFiniteNumber(entry.badStreak, 0)));
  const blacklistUntil = typeof entry.blacklistUntil === 'string' && entry.blacklistUntil.trim().length > 0
    ? entry.blacklistUntil
    : undefined;
  return {
    pairKey,
    sourceTrackId,
    targetTrackId,
    totalCount: totalCount > 0 ? totalCount : goodCount + okCount + badCount,
    goodCount,
    okCount,
    badCount,
    meanScore,
    badStreak,
    updatedAt,
    ...(blacklistUntil ? { blacklistUntil } : {}),
  };
}

function sanitizeTransitionFeedbackModel(value: unknown): TransitionFeedbackModel {
  if (!value || typeof value !== 'object') {
    return {
      updatedAt: nowIsoString(),
      byPair: {},
    };
  }
  const entry = value as Record<string, unknown>;
  const rawByPair = (entry.byPair && typeof entry.byPair === 'object')
    ? (entry.byPair as Record<string, unknown>)
    : {};
  const byPair = Object.fromEntries(
    Object.entries(rawByPair)
      .map(([, pairStats]) => sanitizeFeedbackPairStats(pairStats))
      .filter((pairStats): pairStats is TransitionFeedbackPairStats => pairStats !== null)
      .map((pairStats) => [pairStats.pairKey, pairStats])
  );
  return {
    updatedAt: typeof entry.updatedAt === 'string' && entry.updatedAt.trim().length > 0
      ? entry.updatedAt
      : nowIsoString(),
    byPair,
  };
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  return safeParseJson(window.localStorage.getItem(key), fallback);
}

function writeStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  if (isStorageWriteDisabled) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    isStorageWriteDisabled = true;
    if (!warnedStorageKeys.has(key)) {
      warnedStorageKeys.add(key);
      console.warn(`Transition storage write disabled (quota) for ${key}.`);
    }
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(key);
}

function hydrateFromStorage(): void {
  if (isHydrated) return;
  analysisQueue = readStorage<string[]>(STORAGE_KEYS.queue, []);
  analysisStates = readStorage<Record<string, AnalysisState>>(STORAGE_KEYS.states, {});
  const rawNodesByTrack = readStorage<Record<string, TransitionNode[]>>(STORAGE_KEYS.nodes, {});
  const rawTrackMetadata = readStorage<Record<string, { name?: unknown; artist?: unknown }>>(
    STORAGE_KEYS.trackMetadata,
    {}
  );
  trackMetadataById = Object.fromEntries(
    Object.entries(rawTrackMetadata).map(([rawTrackId, metadata]) => {
      const trackId = rawTrackId.trim();
      const typedMetadata = metadata as { name?: unknown; artist?: unknown } | undefined;
      const name = typeof typedMetadata?.name === 'string' ? typedMetadata.name.trim() : trackId;
      const artist = typeof typedMetadata?.artist === 'string' ? typedMetadata.artist.trim() : 'Unknown Artist';
      return [trackId, { name: name || trackId, artist: artist || 'Unknown Artist' }] as const;
    }).filter(([trackId]) => trackId.length > 0)
  );
  transitionFeedbackModel = sanitizeTransitionFeedbackModel(
    readStorage<TransitionFeedbackModel | null>(STORAGE_KEYS.feedbackModel, null)
  );
  baselineRunHistory = readStorage<BaselineRunArtifact[]>(STORAGE_KEYS.baselineRuns, [])
    .filter((run) => typeof run?.runAt === 'string' && Array.isArray(run?.seedTrackIds))
    .map((run) => {
      const regressionDetected = Boolean(run.regressionDetected);
      const seedTrackIds = run.seedTrackIds
        .map((trackId) => trackId.trim())
        .filter((trackId) => trackId.length > 0);
      const scopeLabel = (run.scopeLabel ?? 'custom') as BaselineScopeLabel;
      const bottomSeeds = Array.isArray(run.bottomSeeds)
        ? run.bottomSeeds
            .map((seed) => sanitizeBaselineSeedReport(seed))
            .filter((seed): seed is BaselineSeedReport => seed !== null)
        : [];
      const tuningActions = Array.isArray(run.tuningActions)
        ? run.tuningActions
            .map((action) => sanitizeBaselineTuningAction(action))
            .filter((action): action is BaselineTuningAction => action !== null)
        : [];
      const requiredRelevantTargetsPerSeed = Math.max(
        1,
        Math.floor(Number(run.requiredRelevantTargetsPerSeed ?? 2))
      );
      const seedsBelowRelevantTargetMinimumDetails = Array.isArray(run.seedsBelowRelevantTargetMinimumDetails)
        ? run.seedsBelowRelevantTargetMinimumDetails
            .map((item) => {
              if (!item || typeof item !== 'object') return null;
              const gap = item as Partial<SeedRelevantTargetGap>;
              const trackId = typeof gap.trackId === 'string' ? gap.trackId.trim() : '';
              if (!trackId) return null;
              const relevantTargetCount = Math.max(
                0,
                Math.floor(Number(gap.relevantTargetCount ?? 0))
              );
              const missingTargetCount = Math.max(
                0,
                Math.floor(Number(gap.missingTargetCount ?? requiredRelevantTargetsPerSeed))
              );
              return {
                trackId,
                relevantTargetCount,
                missingTargetCount,
              } as SeedRelevantTargetGap;
            })
            .filter((item): item is SeedRelevantTargetGap => item !== null)
        : [];
      const legacySeedsBelowRelevantTargetMinimum = Array.isArray(run.seedsBelowRelevantTargetMinimum)
        ? run.seedsBelowRelevantTargetMinimum
            .map((trackId) => (typeof trackId === 'string' ? trackId.trim() : ''))
            .filter((trackId) => trackId.length > 0)
        : [];
      const normalizedSeedsBelowRelevantTargetMinimumDetails = seedsBelowRelevantTargetMinimumDetails.length > 0
        ? seedsBelowRelevantTargetMinimumDetails
        : legacySeedsBelowRelevantTargetMinimum.map((trackId) => ({
            trackId,
            relevantTargetCount: 0,
            missingTargetCount: requiredRelevantTargetsPerSeed,
          }));
      const normalizedSeedsBelowRelevantTargetMinimum = normalizedSeedsBelowRelevantTargetMinimumDetails
        .map((item) => item.trackId);
      return {
        ...run,
        schemaVersion: Math.max(1, Math.floor(Number(run.schemaVersion ?? BASELINE_RUN_SCHEMA_VERSION))),
        analysisVersion: Math.max(1, Math.floor(Number(run.analysisVersion ?? ANALYSIS_VERSION))),
        scoringVersion: typeof run.scoringVersion === 'string'
          ? run.scoringVersion
          : TRANSITION_SCORING_VERSION,
        seedSetHash: typeof run.seedSetHash === 'string' && run.seedSetHash.trim().length > 0
          ? run.seedSetHash
          : computeSeedSetHash(seedTrackIds),
        runMode: (run.runMode === 'real' ? 'real' : 'synthetic') as BenchmarkRunMode,
        runtimeSampleCount: Math.max(
          0,
          Math.floor(Number(
            run.runtimeSampleCount
            ?? run.transitionRuntimeSampleCount
            ?? run.benchmarkMeta?.runtimeSampleCount
            ?? 0
          ))
        ),
        benchmarkMeta: {
          seedSetHash: typeof run.benchmarkMeta?.seedSetHash === 'string' && run.benchmarkMeta.seedSetHash.trim().length > 0
            ? run.benchmarkMeta.seedSetHash
            : (typeof run.seedSetHash === 'string' && run.seedSetHash.trim().length > 0
              ? run.seedSetHash
              : computeSeedSetHash(seedTrackIds)),
          scoringVersion: typeof run.benchmarkMeta?.scoringVersion === 'string' && run.benchmarkMeta.scoringVersion.trim().length > 0
            ? run.benchmarkMeta.scoringVersion
            : (typeof run.scoringVersion === 'string' ? run.scoringVersion : TRANSITION_SCORING_VERSION),
          analysisVersion: typeof run.benchmarkMeta?.analysisVersion === 'string' && run.benchmarkMeta.analysisVersion.trim().length > 0
            ? run.benchmarkMeta.analysisVersion
            : `v${Math.max(1, Math.floor(Number(run.analysisVersion ?? ANALYSIS_VERSION)))}`,
          runMode: (run.benchmarkMeta?.runMode === 'real' || run.runMode === 'real' ? 'real' : 'synthetic') as BenchmarkRunMode,
          runtimeSampleCount: Math.max(
            0,
            Math.floor(Number(
              run.benchmarkMeta?.runtimeSampleCount
              ?? run.runtimeSampleCount
              ?? run.transitionRuntimeSampleCount
              ?? 0
            ))
          ),
        } as BenchmarkRunMeta,
        scoreWeights: {
          eventMatch: clamp(
            Number(run.scoreWeights?.eventMatch ?? TRANSITION_SCORE_WEIGHTS.eventMatch),
            0,
            1
          ),
          embedding: clamp(
            Number(run.scoreWeights?.embedding ?? TRANSITION_SCORE_WEIGHTS.embedding),
            0,
            1
          ),
          rhythm: clamp(
            Number(run.scoreWeights?.rhythm ?? TRANSITION_SCORE_WEIGHTS.rhythm),
            0,
            1
          ),
          loudness: clamp(
            Number(run.scoreWeights?.loudness ?? TRANSITION_SCORE_WEIGHTS.loudness),
            0,
            1
          ),
          artifactPenalty: clamp(
            Number(run.scoreWeights?.artifactPenalty ?? TRANSITION_SCORE_WEIGHTS.artifactPenalty),
            0,
            1
          ),
        },
        scopeLabel,
        scopeId: normalizeScopeId(
          scopeLabel,
          typeof run.scopeId === 'string' ? run.scopeId : undefined,
          seedTrackIds
        ),
        bottomSeeds,
        tuningActions,
        tuningValidationSummary: typeof run.tuningValidationSummary === 'string'
          ? run.tuningValidationSummary
          : null,
        tuningValidationPassed: typeof run.tuningValidationPassed === 'boolean'
          ? run.tuningValidationPassed
          : true,
        tuningValidationGateEnforced: Boolean(run.tuningValidationGateEnforced),
        regressionDetected,
        regressionSummary: typeof run.regressionSummary === 'string' ? run.regressionSummary : null,
        regressionGateEnforced: Boolean(run.regressionGateEnforced),
        regressionGatePassed: typeof run.regressionGatePassed === 'boolean'
          ? run.regressionGatePassed
          : !regressionDetected,
        requiredRelevantTargetsPerSeed,
        relevanceTargetGateEnforced: Boolean(run.relevanceTargetGateEnforced),
        relevanceTargetGatePassed: typeof run.relevanceTargetGatePassed === 'boolean'
          ? run.relevanceTargetGatePassed
          : true,
        seedsBelowRelevantTargetMinimum: normalizedSeedsBelowRelevantTargetMinimum,
        seedsBelowRelevantTargetMinimumDetails: normalizedSeedsBelowRelevantTargetMinimumDetails,
        relevanceTargetGateSummary: typeof run.relevanceTargetGateSummary === 'string'
          ? run.relevanceTargetGateSummary
          : null,
        transitionRuntimeSampleCount: Math.max(
          0,
          Math.floor(Number(run.transitionRuntimeSampleCount ?? 0))
        ),
        transitionLatencyP95Ms: typeof run.transitionLatencyP95Ms === 'number'
          && Number.isFinite(run.transitionLatencyP95Ms)
          ? Math.max(0, Math.round(run.transitionLatencyP95Ms))
          : null,
        transitionStallRate: toOptionalFiniteRate(run.transitionStallRate),
        transitionDropRate: toOptionalFiniteRate(run.transitionDropRate),
        autoTransitionDecisionSampleCount: Math.max(
          0,
          Math.floor(Number(run.autoTransitionDecisionSampleCount ?? 0))
        ),
        autoTransitionSkippedCount: Math.max(
          0,
          Math.floor(Number(run.autoTransitionSkippedCount ?? 0))
        ),
        autoTransitionSkipRate: toOptionalFiniteRate(run.autoTransitionSkipRate),
        topAutoTransitionSkipReasons: parseTransitionGateReasons(run.topAutoTransitionSkipReasons),
        autoTransitionSkipBySeed: Array.isArray(run.autoTransitionSkipBySeed)
          ? run.autoTransitionSkipBySeed
              .map((item) => sanitizeAutoTransitionSeedSkipSummary(item))
              .filter((item): item is AutoTransitionSeedSkipSummary => item !== null)
          : [],
        runtimeGateEnforced: Boolean(run.runtimeGateEnforced),
        runtimeGatePassed: typeof run.runtimeGatePassed === 'boolean'
          ? run.runtimeGatePassed
          : true,
        runtimeGateSummary: typeof run.runtimeGateSummary === 'string'
          ? run.runtimeGateSummary
          : null,
        averageDecisionConfidenceScore: toOptionalFiniteRate(run.averageDecisionConfidenceScore),
        fallbackTriggeredCount: Math.max(0, Math.floor(Number(run.fallbackTriggeredCount ?? 0))),
        manualQueueSuggestedCount: Math.max(0, Math.floor(Number(run.manualQueueSuggestedCount ?? 0))),
        manualQueueAcceptedCount: Math.max(0, Math.floor(Number(run.manualQueueAcceptedCount ?? 0))),
        benchmarkMergeGateEnforced: Boolean(run.benchmarkMergeGateEnforced),
        benchmarkMergeGatePassed: typeof run.benchmarkMergeGatePassed === 'boolean'
          ? run.benchmarkMergeGatePassed
          : true,
        benchmarkMergeGateSummary: typeof run.benchmarkMergeGateSummary === 'string'
          ? run.benchmarkMergeGateSummary
          : null,
        minimumCoverageRate: clamp(toFiniteNumber(run.minimumCoverageRate, BENCHMARK_MINIMUM_COVERAGE_DEFAULT), 0, 1),
        coverageGatePassed: typeof run.coverageGatePassed === 'boolean'
          ? run.coverageGatePassed
          : true,
        runtimeGateThresholds: {
          minTransitionRuntimeSampleCount: Math.max(
            1,
            Math.floor(Number(
              run.runtimeGateThresholds?.minTransitionRuntimeSampleCount
              ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.minTransitionRuntimeSampleCount
            ))
          ),
          maxTransitionLatencyP95Ms: Math.max(
            1,
            Math.floor(Number(
              run.runtimeGateThresholds?.maxTransitionLatencyP95Ms
              ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionLatencyP95Ms
            ))
          ),
          maxTransitionStallRate: clamp(
            Number(
              run.runtimeGateThresholds?.maxTransitionStallRate
              ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionStallRate
            ),
            0,
            1
          ),
          maxTransitionDropRate: clamp(
            Number(
              run.runtimeGateThresholds?.maxTransitionDropRate
              ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionDropRate
            ),
            0,
            1
          ),
        },
        seedTrackIds,
      };
    })
    .slice(-100);
  transitionRuntimeEvents = readStorage<TransitionRuntimeEvent[]>(STORAGE_KEYS.runtimeEvents, [])
    .map((event) => sanitizeTransitionRuntimeEvent(event))
    .filter((event): event is TransitionRuntimeEvent => event !== null)
    .slice(-500);

  nodesByTrack = Object.fromEntries(
    Object.entries(rawNodesByTrack).map(([trackId, nodes]) => [
      trackId,
      (Array.isArray(nodes) ? nodes : []).map((node) => sanitizeNode(trackId, node)),
    ])
  );

  // Requeue stale analyses when analysis version changes.
  const staleTrackIds = new Set<string>();
  const nextAnalysisStates: Record<string, AnalysisState> = {};
  Object.entries(analysisStates).forEach(([trackId, state]) => {
    const normalizedTrackId = trackId.trim();
    if (!normalizedTrackId) return;

    const normalizedStatus: AnalysisStatus =
      state.status === 'ready' || state.status === 'failed' || state.status === 'pending'
        ? state.status
        : 'pending';
    const storedVersion = Number.isFinite(state.version) ? Number(state.version) : 0;

    if (storedVersion < ANALYSIS_VERSION) {
      staleTrackIds.add(normalizedTrackId);
      delete nodesByTrack[normalizedTrackId];
      nextAnalysisStates[normalizedTrackId] = {
        trackId: normalizedTrackId,
        status: 'pending',
        updatedAt: nowIsoString(),
        version: ANALYSIS_VERSION,
      };
      return;
    }

    nextAnalysisStates[normalizedTrackId] = {
      trackId: normalizedTrackId,
      status: normalizedStatus,
      updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : nowIsoString(),
      version: ANALYSIS_VERSION,
      ...(typeof state.errorMessage === 'string' ? { errorMessage: state.errorMessage } : {}),
    };
  });
  analysisStates = nextAnalysisStates;

  const queueSet = new Set(
    analysisQueue
      .map((trackId) => trackId.trim())
      .filter((trackId) => trackId.length > 0 && (trackId in nodesByTrack || trackId in analysisStates))
  );
  staleTrackIds.forEach((trackId) => queueSet.add(trackId));
  analysisQueue = [...queueSet];

  persistStorage();
  isHydrated = true;
}

function persistStorage(): void {
  writeStorage(STORAGE_KEYS.queue, analysisQueue);
  writeStorage(STORAGE_KEYS.states, analysisStates);
  writeStorage(STORAGE_KEYS.nodes, nodesByTrack);
  writeStorage(STORAGE_KEYS.trackMetadata, trackMetadataById);
  writeStorage(STORAGE_KEYS.baselineRuns, baselineRunHistory);
  writeStorage(STORAGE_KEYS.runtimeEvents, transitionRuntimeEvents);
  writeStorage(STORAGE_KEYS.feedbackModel, transitionFeedbackModel);
}

function setAnalysisState(
  trackId: string,
  status: AnalysisStatus,
  errorMessage?: string
): AnalysisState {
  const state: AnalysisState = {
    trackId,
    status,
    updatedAt: nowIsoString(),
    version: ANALYSIS_VERSION,
    ...(errorMessage ? { errorMessage } : {}),
  };
  analysisStates[trackId] = state;
  return state;
}

function getSourceNode(nodes: TransitionNode[], sourceTimeMs?: number): TransitionNode {
  if (nodes.length === 0) {
    throw new Error('source nodes are required');
  }

  if (sourceTimeMs === undefined) {
    return nodes[nodes.length - 1];
  }

  return nodes.reduce((nearest, current) => {
    const currentDiff = Math.abs(current.timeMs - sourceTimeMs);
    const nearestDiff = Math.abs(nearest.timeMs - sourceTimeMs);
    return currentDiff < nearestDiff ? current : nearest;
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }

  if (aNorm === 0 || bNorm === 0) return 0;
  const similarity = dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
  return clamp((similarity + 1) / 2, 0, 1);
}

function argmaxIndex(values: number[]): number {
  if (values.length === 0) return 0;
  let bestIndex = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > values[bestIndex]) {
      bestIndex = i;
    }
  }
  return bestIndex;
}

function circularPitchClassDistance(sourceClass: number, targetClass: number): number {
  const diff = Math.abs(sourceClass - targetClass) % 12;
  return Math.min(diff, 12 - diff);
}

function computeHarmonicCompatibility(source: TransitionNode, target: TransitionNode): number {
  const sourcePitchClass = argmaxIndex(source.chroma);
  const targetPitchClass = argmaxIndex(target.chroma);
  const distance = circularPitchClassDistance(sourcePitchClass, targetPitchClass);

  if (distance === 0) return 1;
  if (distance === 5 || distance === 7) return 0.85;
  if (distance === 3 || distance === 4 || distance === 8 || distance === 9) return 0.65;
  if (distance === 2 || distance === 10) return 0.45;
  if (distance === 1 || distance === 11) return 0.3;
  return 0.2;
}

function computeTempoRatioScore(source: TransitionNode, target: TransitionNode): number {
  const sourceBpm = Math.max(1, toFiniteNumber(source.bpmLocal, 120));
  const targetBpm = Math.max(1, toFiniteNumber(target.bpmLocal, 120));
  const bpmDiff = Math.min(
    Math.abs(sourceBpm - targetBpm),
    Math.abs(sourceBpm * 2 - targetBpm),
    Math.abs(sourceBpm - targetBpm * 2)
  );
  return 1 - clamp(bpmDiff / 40, 0, 1);
}

interface RhythmAlignmentFeatures {
  rhythmAlignmentScore: number;
  tempoRatioScore: number;
  harmonicCompatibilityScore: number;
}

function computeRhythmAlignmentFeatures(
  source: TransitionNode,
  target: TransitionNode
): RhythmAlignmentFeatures {
  const tempoRatioScore = computeTempoRatioScore(source, target);
  const chromaCosineScore = cosineSimilarity(source.chroma, target.chroma);
  const harmonicCompatibilityScore = computeHarmonicCompatibility(source, target);
  const rhythmAlignmentScore = clamp(
    0.5 * tempoRatioScore + 0.25 * chromaCosineScore + 0.25 * harmonicCompatibilityScore,
    0,
    1
  );
  return {
    rhythmAlignmentScore,
    tempoRatioScore,
    harmonicCompatibilityScore,
  };
}

function computeLoudnessContinuity(source: TransitionNode, target: TransitionNode): number {
  const loudnessDiff = Math.abs(source.loudnessRms - target.loudnessRms);
  return 1 - clamp(loudnessDiff / 24, 0, 1);
}

function computeArtifactPenalty(source: TransitionNode, target: TransitionNode): number {
  const bpmDiffPenalty = clamp(Math.abs(source.bpmLocal - target.bpmLocal) / 80, 0, 1);
  const loudnessPenalty = clamp(Math.abs(source.loudnessRms - target.loudnessRms) / 36, 0, 1);
  return clamp(0.5 * bpmDiffPenalty + 0.5 * loudnessPenalty, 0, 1);
}

function computeSmoothnessScore(input: {
  rhythmAlignmentScore: number;
  loudnessContinuityScore: number;
  artifactPenalty: number;
}): number {
  return clamp(
    input.rhythmAlignmentScore * 0.45
      + input.loudnessContinuityScore * 0.45
      + (1 - input.artifactPenalty) * 0.1,
    0,
    1
  );
}

function getEventFamily(eventType: TransitionEventType): string {
  if (eventType === 'vocal-hit' || eventType === 'scream-hit') return 'vocal';
  if (eventType === 'drop' || eventType === 'build-up' || eventType === 'bass-hit') return 'energy';
  if (eventType === 'percussive-hit') return 'rhythm';
  if (eventType === 'silence-break') return 'break';
  return 'other';
}

function toUnixMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : null;
}

function buildFeedbackPairKey(sourceTrackId: string, targetTrackId: string): string {
  return `${sourceTrackId}->${targetTrackId}`;
}

function getFeedbackPairStats(sourceTrackId: string, targetTrackId: string): TransitionFeedbackPairStats | null {
  const key = buildFeedbackPairKey(sourceTrackId, targetTrackId);
  return transitionFeedbackModel.byPair[key] ?? null;
}

function isFeedbackPairBlacklisted(
  sourceTrackId: string,
  targetTrackId: string,
  nowMs = Date.now()
): boolean {
  const pair = getFeedbackPairStats(sourceTrackId, targetTrackId);
  if (!pair?.blacklistUntil) return false;
  const blacklistUntilMs = toUnixMs(pair.blacklistUntil);
  if (blacklistUntilMs === null) return false;
  return nowMs < blacklistUntilMs;
}

function computeLearningBias(
  sourceTrackId: string,
  targetTrackId: string
): number {
  if (!LEARNING_BIAS_ENABLED) return 0;
  const pair = getFeedbackPairStats(sourceTrackId, targetTrackId);
  if (!pair) return 0;
  const centered = (pair.meanScore - 0.5) * 2;
  const confidence = clamp(pair.totalCount / 6, 0, 1);
  return clamp(centered * LEARNING_BIAS_MAX_ABS * confidence, -LEARNING_BIAS_MAX_ABS, LEARNING_BIAS_MAX_ABS);
}

interface RuntimeBiasSnapshot {
  event: TransitionRuntimeEvent;
  weight: number;
}

interface RuntimeRiskSummary {
  risk: number;
  sampleCount: number;
  weightedCount: number;
}

function computeRecencyWeight(eventMs: number, nowMs: number): number {
  const ageMs = Math.max(0, nowMs - eventMs);
  return Math.pow(0.5, ageMs / RUNTIME_PAIR_BIAS_HALFLIFE_MS);
}

function computeWeightedAverage(
  values: Array<{ value: number; weight: number }>
): number | null {
  if (values.length === 0) return null;
  const weightedSum = values.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  const totalWeight = values.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  return weightedSum / totalWeight;
}

function summarizeRuntimeRisk(snapshots: RuntimeBiasSnapshot[]): RuntimeRiskSummary | null {
  if (snapshots.length === 0) return null;
  const totalWeight = snapshots.reduce((sum, snapshot) => sum + snapshot.weight, 0);
  if (totalWeight <= 0) return null;

  const weightedStallRate =
    snapshots.reduce((sum, snapshot) => sum + (snapshot.event.stalled ? snapshot.weight : 0), 0) / totalWeight;
  const weightedDropRate =
    snapshots.reduce((sum, snapshot) => sum + (snapshot.event.dropped ? snapshot.weight : 0), 0) / totalWeight;
  const weightedLatencyMs = computeWeightedAverage(
    snapshots
      .map((snapshot) => ({ value: snapshot.event.latencyMs, weight: snapshot.weight }))
      .filter((entry) => Number.isFinite(entry.value))
  );
  const weightedAudibleWaitMs = computeWeightedAverage(
    snapshots
      .map((snapshot) => ({ value: snapshot.event.audibleReadyWaitMs ?? Number.NaN, weight: snapshot.weight }))
      .filter((entry) => Number.isFinite(entry.value))
  );

  const latencyPenalty = weightedLatencyMs === null ? 0 : clamp((weightedLatencyMs - 1400) / 1800, 0, 1);
  const audiblePenalty = weightedAudibleWaitMs === null ? 0 : clamp((weightedAudibleWaitMs - 320) / 500, 0, 1);

  return {
    risk: clamp(
      weightedStallRate * 0.45
        + weightedDropRate * 0.6
        + latencyPenalty * 0.25
        + audiblePenalty * 0.2,
      0,
      1
    ),
    sampleCount: snapshots.length,
    weightedCount: totalWeight,
  };
}

function toRuntimeBias(
  summary: RuntimeRiskSummary,
  options: {
    maxAbs: number;
    confidenceDivisor: number;
  }
): number {
  const reliabilityScore = 1 - summary.risk;
  const centered = (reliabilityScore - 0.5) * 2;
  const confidence = clamp(summary.weightedCount / options.confidenceDivisor, 0, 1);
  return clamp(centered * options.maxAbs * confidence, -options.maxAbs, options.maxAbs);
}

function computeRuntimeContextFallbackBias(
  snapshots: RuntimeBiasSnapshot[],
  sourceTrackId: string,
  targetTrackId: string
): number {
  const sourceSummary = summarizeRuntimeRisk(
    snapshots.filter((snapshot) => snapshot.event.sourceTrackId === sourceTrackId)
  );
  const targetSummary = summarizeRuntimeRisk(
    snapshots.filter((snapshot) => snapshot.event.targetTrackId === targetTrackId)
  );
  const sourceArtist = (trackMetadataById[sourceTrackId]?.artist ?? '').trim().toLowerCase();
  const targetArtist = (trackMetadataById[targetTrackId]?.artist ?? '').trim().toLowerCase();
  const sourceArtistSummary = sourceArtist.length > 0
    ? summarizeRuntimeRisk(
      snapshots.filter((snapshot) => {
        const snapshotSourceArtist = (trackMetadataById[snapshot.event.sourceTrackId]?.artist ?? '').trim().toLowerCase();
        return snapshotSourceArtist === sourceArtist;
      })
    )
    : null;
  const targetArtistSummary = targetArtist.length > 0
    ? summarizeRuntimeRisk(
      snapshots.filter((snapshot) => {
        const snapshotTargetArtist = (trackMetadataById[snapshot.event.targetTrackId]?.artist ?? '').trim().toLowerCase();
        return snapshotTargetArtist === targetArtist;
      })
    )
    : null;

  const components: Array<{ summary: RuntimeRiskSummary; baseWeight: number }> = [];
  if (sourceSummary) components.push({ summary: sourceSummary, baseWeight: 0.45 });
  if (targetSummary) components.push({ summary: targetSummary, baseWeight: 0.35 });
  if (sourceArtistSummary) components.push({ summary: sourceArtistSummary, baseWeight: 0.12 });
  if (targetArtistSummary) components.push({ summary: targetArtistSummary, baseWeight: 0.08 });

  const eligibleComponents = components.filter(
    (component) => component.summary.sampleCount >= Math.floor(RUNTIME_CONTEXT_BIAS_MIN_SAMPLES / 2)
  );
  if (eligibleComponents.length === 0) return 0;

  const effectiveSampleCount = eligibleComponents.reduce(
    (sum, component) => sum + component.summary.sampleCount * component.baseWeight,
    0
  );
  if (effectiveSampleCount < RUNTIME_CONTEXT_BIAS_MIN_SAMPLES) return 0;

  const weightedRiskSum = eligibleComponents.reduce((sum, component) => (
    sum + component.summary.risk * component.baseWeight
  ), 0);
  const totalBaseWeight = eligibleComponents.reduce((sum, component) => sum + component.baseWeight, 0);
  if (totalBaseWeight <= 0) return 0;

  const aggregateSummary: RuntimeRiskSummary = {
    risk: clamp(weightedRiskSum / totalBaseWeight, 0, 1),
    sampleCount: Math.round(effectiveSampleCount),
    weightedCount: eligibleComponents.reduce((sum, component) => sum + component.summary.weightedCount, 0),
  };
  return toRuntimeBias(aggregateSummary, {
    maxAbs: RUNTIME_CONTEXT_BIAS_MAX_ABS,
    confidenceDivisor: 12,
  });
}

function computeCandidateSelectionScore(candidate: TransitionCandidate): number {
  const runtimeBias = candidate.runtimeBias ?? 0;
  const runtimeRiskPenalty = runtimeBias < 0 ? Math.abs(runtimeBias) * 0.6 : 0;
  return (
    candidate.score.finalScore
    + candidate.learningBias
    + runtimeBias * 0.9
    + candidate.confidenceScore * 0.12
    - candidate.score.artifactPenalty * 0.12
    - runtimeRiskPenalty
  );
}

function computeRuntimeReliabilityBias(
  sourceTrackId: string,
  targetTrackId: string,
  nowMs = Date.now()
): number {
  const cutoffMs = nowMs - RUNTIME_PAIR_BIAS_WINDOW_MS;
  const autoSnapshots = transitionRuntimeEvents
    .filter((event) => {
      if (event.mode !== 'auto') return false;
      if (event.skippedAutoTransition) return false;
      const eventMs = toUnixMs(event.recordedAt);
      return eventMs !== null && eventMs >= cutoffMs;
    })
    .map((event) => {
      const eventMs = toUnixMs(event.recordedAt);
      if (eventMs === null) return null;
      return {
        event,
        weight: computeRecencyWeight(eventMs, nowMs),
      } satisfies RuntimeBiasSnapshot;
    })
    .filter((snapshot): snapshot is RuntimeBiasSnapshot => snapshot !== null)
    .slice(-40);
  const pairSnapshots = autoSnapshots.filter(
    (snapshot) => snapshot.event.sourceTrackId === sourceTrackId && snapshot.event.targetTrackId === targetTrackId
  );

  if (pairSnapshots.length >= RUNTIME_PAIR_BIAS_MIN_SAMPLES) {
    const pairSummary = summarizeRuntimeRisk(pairSnapshots);
    if (!pairSummary) return 0;
    return toRuntimeBias(pairSummary, {
      maxAbs: RUNTIME_PAIR_BIAS_MAX_ABS,
      confidenceDivisor: 8,
    });
  }
  return computeRuntimeContextFallbackBias(autoSnapshots, sourceTrackId, targetTrackId);
}

function resolveSeedPerformanceTier(
  sourceTrackId: string,
  requestedTier?: TransitionPerformanceTier
): TransitionPerformanceTier {
  if (requestedTier) return requestedTier;
  const latestRun = [...baselineRunHistory]
    .reverse()
    .find((run) => run.bottomSeeds.some((seed) => seed.trackId === sourceTrackId));
  const seedSnapshot = latestRun?.bottomSeeds.find((seed) => seed.trackId === sourceTrackId);
  if (!seedSnapshot) return 'mid';
  if (seedSnapshot.meanTopKScore >= 0.72) return 'high';
  if (seedSnapshot.meanTopKScore < 0.55) return 'low';
  return 'mid';
}

function resolveDiversityBudgetTopN(
  limit: number,
  seedTier: TransitionPerformanceTier
): number {
  const targetBudget = DIVERSITY_BUDGET_BY_TIER[seedTier];
  return Math.max(2, Math.min(limit, targetBudget));
}

function computeDecisionConfidenceScore(input: {
  topCandidate: TransitionCandidate;
  top1Top2Margin: number | null;
  gateReasonsCount: number;
}): number {
  const marginScore = input.top1Top2Margin === null ? 1 : clamp(input.top1Top2Margin / 0.2, 0, 1);
  const gatePenalty = clamp(input.gateReasonsCount / 5, 0, 1);
  const artifactRisk = clamp(input.topCandidate.score.artifactPenalty, 0, 1);
  const runtimeBias = typeof input.topCandidate.runtimeBias === 'number'
    ? clamp(input.topCandidate.runtimeBias, -RUNTIME_PAIR_BIAS_MAX_ABS, RUNTIME_PAIR_BIAS_MAX_ABS)
    : 0;
  const runtimeTrustScore = clamp(
    (runtimeBias + RUNTIME_PAIR_BIAS_MAX_ABS) / (RUNTIME_PAIR_BIAS_MAX_ABS * 2),
    0,
    1
  );
  return clamp(
    input.topCandidate.score.finalScore * 0.5
      + marginScore * 0.22
      + (1 - artifactRisk) * 0.14
      + (1 - gatePenalty) * 0.05
      + runtimeTrustScore * 0.09,
    0,
    1
  );
}

function resolveHardGateConfig(config: Partial<HardGateConfig> = {}): HardGateConfig {
  return {
    minEventConfidence: clamp(
      config.minEventConfidence ?? DEFAULT_HARD_GATE_CONFIG.minEventConfidence,
      0,
      1
    ),
    maxTempoRatioDistance: clamp(
      config.maxTempoRatioDistance ?? DEFAULT_HARD_GATE_CONFIG.maxTempoRatioDistance,
      0.05,
      1
    ),
    maxKeyDistanceClass: clampInteger(
      config.maxKeyDistanceClass ?? DEFAULT_HARD_GATE_CONFIG.maxKeyDistanceClass,
      0,
      6
    ),
    maxLoudnessJumpDb: clamp(
      config.maxLoudnessJumpDb ?? DEFAULT_HARD_GATE_CONFIG.maxLoudnessJumpDb,
      2,
      24
    ),
  };
}

function normalizeGateResult(reasons: TransitionGateReason[]): TransitionGateResult {
  const uniqueReasons = Array.from(new Set(reasons));
  return {
    passed: uniqueReasons.length === 0,
    reasons: uniqueReasons,
  };
}

export function applyHardGate(
  source: TransitionNode,
  target: TransitionNode,
  config: Partial<HardGateConfig> = {}
): TransitionGateResult {
  const gateConfig = resolveHardGateConfig(config);
  const reasons: TransitionGateReason[] = [];

  const sourceEventFamily = getEventFamily(source.eventType);
  const targetEventFamily = getEventFamily(target.eventType);
  const eventCompatibility = EVENT_COMPATIBILITY[source.eventType]?.[target.eventType] ?? 0.2;
  if (eventCompatibility < 0.35 || sourceEventFamily !== targetEventFamily) {
    reasons.push('EVENT_MISMATCH');
  }

  const eventConfidence = clamp(
    Math.min(
      toFiniteNumber(source.eventConfidence, 0.6),
      toFiniteNumber(target.eventConfidence, 0.6)
    ),
    0,
    1
  );
  if (eventConfidence < gateConfig.minEventConfidence) {
    reasons.push('LOW_EVENT_CONFIDENCE');
  }

  const tempoRatioScore = computeTempoRatioScore(source, target);
  const tempoRatioDistance = 1 - tempoRatioScore;
  if (tempoRatioDistance > gateConfig.maxTempoRatioDistance) {
    reasons.push('TEMPO_OUT_OF_RANGE');
  }

  const sourcePitchClass = argmaxIndex(source.chroma);
  const targetPitchClass = argmaxIndex(target.chroma);
  const keyDistanceClass = circularPitchClassDistance(sourcePitchClass, targetPitchClass);
  if (keyDistanceClass > gateConfig.maxKeyDistanceClass) {
    reasons.push('KEY_DISTANCE_HIGH');
  }

  const loudnessJumpDb = Math.abs(source.loudnessRms - target.loudnessRms);
  if (loudnessJumpDb > gateConfig.maxLoudnessJumpDb) {
    reasons.push('LOUDNESS_JUMP_HIGH');
  }

  return normalizeGateResult(reasons);
}

function resolveAutoTransitionDecisionConfig(
  config: Partial<AutoTransitionDecisionConfig> = {}
): AutoTransitionDecisionConfig {
  return {
    minTop1Score: clamp(
      config.minTop1Score ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.minTop1Score,
      0,
      1
    ),
    minTop1Top2Margin: clamp(
      config.minTop1Top2Margin ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.minTop1Top2Margin,
      0,
      0.5
    ),
    maxArtifactPenalty: clamp(
      config.maxArtifactPenalty ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.maxArtifactPenalty,
      0,
      1
    ),
    confidenceThreshold: clamp(
      config.confidenceThreshold ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.confidenceThreshold,
      0,
      1
    ),
    fallbackOnLowConfidence: config.fallbackOnLowConfidence
      ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.fallbackOnLowConfidence,
    manualQueueOnLowConfidence: config.manualQueueOnLowConfidence
      ?? DEFAULT_AUTO_TRANSITION_DECISION_CONFIG.manualQueueOnLowConfidence,
  };
}

export function decideAutoTransition(
  candidates: TransitionCandidate[],
  config: Partial<AutoTransitionDecisionConfig> = {}
): TransitionDecision {
  const decisionConfig = resolveAutoTransitionDecisionConfig(config);
  const topCandidate = candidates[0] ?? null;
  const secondCandidate = candidates[1] ?? null;
  const top1Score = topCandidate ? topCandidate.score.finalScore : null;
  const top1Top2Margin = topCandidate && secondCandidate
    ? topCandidate.score.finalScore - secondCandidate.score.finalScore
    : null;

  if (!topCandidate) {
    return {
      selectedCandidate: null,
      manualQueueCandidate: null,
      decision: 'skipped',
      gate: {
        passed: false,
        reasons: ['NO_CANDIDATE'],
      },
      top1Score: null,
      top1Top2Margin: null,
      confidenceScore: null,
    };
  }

  const reasons: TransitionGateReason[] = [];
  let hasLowConfidence = false;
  const gatePreview = topCandidate.gatePreview;
  if (gatePreview && !gatePreview.wouldPassV3) {
    reasons.push(...gatePreview.reasons);
  }
  if (topCandidate.score.finalScore < decisionConfig.minTop1Score) {
    reasons.push('LOW_SCORE');
    hasLowConfidence = true;
  }
  if (topCandidate.score.artifactPenalty > decisionConfig.maxArtifactPenalty) {
    reasons.push('HIGH_ARTIFACT_RISK');
    hasLowConfidence = true;
  }
  if (
    top1Top2Margin !== null
    && top1Top2Margin < decisionConfig.minTop1Top2Margin
  ) {
    reasons.push('LOW_MARGIN');
    hasLowConfidence = true;
  }
  const runtimeBias = typeof topCandidate.runtimeBias === 'number' ? topCandidate.runtimeBias : 0;
  const hasRuntimeUncertaintyRisk = top1Top2Margin !== null
    && top1Top2Margin >= decisionConfig.minTop1Top2Margin
    && top1Top2Margin < (decisionConfig.minTop1Top2Margin * DECISION_MARGIN_UNCERTAINTY_MULTIPLIER)
    && (
      runtimeBias <= DECISION_RUNTIME_RISK_BIAS_THRESHOLD
      || topCandidate.score.artifactPenalty >= DECISION_ARTIFACT_RISK_THRESHOLD
    );
  if (hasRuntimeUncertaintyRisk) {
    hasLowConfidence = true;
  }
  if (topCandidate.diversityPenalty > 0.6) {
    reasons.push('DUPLICATE_CLUSTER');
    hasLowConfidence = true;
  }
  if (hasLowConfidence && decisionConfig.fallbackOnLowConfidence) {
    reasons.push('LOW_CONFIDENCE_FALLBACK');
  }
  const confidenceScore = computeDecisionConfidenceScore({
    topCandidate,
    top1Top2Margin,
    gateReasonsCount: reasons.length,
  });
  if (confidenceScore < decisionConfig.confidenceThreshold) {
    reasons.push('LOW_CONFIDENCE_FALLBACK');
    hasLowConfidence = true;
  }
  if (hasLowConfidence && decisionConfig.manualQueueOnLowConfidence) {
    reasons.push('MANUAL_QUEUE_SUGGESTED');
  }

  const gate = normalizeGateResult(reasons);
  const manualQueueCandidate = gate.passed || !decisionConfig.manualQueueOnLowConfidence
    ? null
    : topCandidate;
  return {
    selectedCandidate: gate.passed ? topCandidate : null,
    manualQueueCandidate,
    decision: gate.passed ? 'selected' : 'skipped',
    gate,
    top1Score,
    top1Top2Margin,
    confidenceScore,
  };
}

function scoreTransition(source: TransitionNode, target: TransitionNode): TransitionEdgeScore {
  const eventCompatibility = EVENT_COMPATIBILITY[source.eventType]?.[target.eventType] ?? 0.2;
  const eventConfidence = clamp(
    Math.min(
      toFiniteNumber(source.eventConfidence, 0.6),
      toFiniteNumber(target.eventConfidence, 0.6)
    ),
    0,
    1
  );
  const eventMatchScore = clamp(eventCompatibility * eventConfidence, 0, 1);
  const embeddingSimilarity = cosineSimilarity(source.embedding, target.embedding);
  const rhythmFeatures = computeRhythmAlignmentFeatures(source, target);
  const loudnessContinuityScore = computeLoudnessContinuity(source, target);
  const artifactPenalty = computeArtifactPenalty(source, target);
  const smoothnessScore = computeSmoothnessScore({
    rhythmAlignmentScore: rhythmFeatures.rhythmAlignmentScore,
    loudnessContinuityScore,
    artifactPenalty,
  });

  const finalScore = clamp(
    SCORE_WEIGHTS.eventMatch * eventMatchScore
      + SCORE_WEIGHTS.embedding * embeddingSimilarity
      + SCORE_WEIGHTS.rhythm * rhythmFeatures.rhythmAlignmentScore
      + SCORE_WEIGHTS.loudness * loudnessContinuityScore
      - SCORE_WEIGHTS.artifactPenalty * artifactPenalty,
    0,
    1
  );

  return {
    eventMatchScore,
    embeddingSimilarity,
    tempoRatioScore: rhythmFeatures.tempoRatioScore,
    harmonicCompatibilityScore: rhythmFeatures.harmonicCompatibilityScore,
    rhythmAlignmentScore: rhythmFeatures.rhythmAlignmentScore,
    loudnessContinuityScore,
    smoothnessScore,
    artifactPenalty,
    finalScore,
  };
}

function formatPercentLabel(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}

function pickPrimaryDriver(score: TransitionEdgeScore): TransitionScoreDriver {
  const positiveDrivers: Array<{ key: Exclude<TransitionScoreDriver, 'penalty'>; value: number }> = [
    { key: 'event', value: SCORE_WEIGHTS.eventMatch * score.eventMatchScore },
    { key: 'embedding', value: SCORE_WEIGHTS.embedding * score.embeddingSimilarity },
    { key: 'rhythm', value: SCORE_WEIGHTS.rhythm * score.rhythmAlignmentScore },
    { key: 'loudness', value: SCORE_WEIGHTS.loudness * score.loudnessContinuityScore },
  ];

  const topPositive = positiveDrivers.reduce((best, current) =>
    current.value > best.value ? current : best
  );
  const weightedPenalty = SCORE_WEIGHTS.artifactPenalty * score.artifactPenalty;
  if (weightedPenalty > topPositive.value) return 'penalty';
  return topPositive.key;
}

function buildScoreDiagnostic(score: TransitionEdgeScore): TransitionScoreDiagnostic {
  return {
    primaryDriver: pickPrimaryDriver(score),
    summary: `Event ${formatPercentLabel(score.eventMatchScore)} | Emb ${formatPercentLabel(score.embeddingSimilarity)} | Tempo ${formatPercentLabel(score.tempoRatioScore)} | Harm ${formatPercentLabel(score.harmonicCompatibilityScore)} | Rhythm ${formatPercentLabel(score.rhythmAlignmentScore)} | Loud ${formatPercentLabel(score.loudnessContinuityScore)} | Smooth ${formatPercentLabel(score.smoothnessScore)} | Penalty ${formatPercentLabel(score.artifactPenalty)}`,
  };
}

function buildTransitionExplain(
  score: TransitionEdgeScore,
  runtimeBias = 0,
  gatePreview?: {
    wouldPassV3: boolean;
    reasons: TransitionGateReason[];
  }
): TransitionDecisionExplain {
  const topReasons: string[] = [];
  if (score.eventMatchScore >= 0.7) topReasons.push(`Event uyumu ${formatPercentLabel(score.eventMatchScore)}`);
  if (score.rhythmAlignmentScore >= 0.7) topReasons.push(`Ritim uyumu ${formatPercentLabel(score.rhythmAlignmentScore)}`);
  if (score.smoothnessScore >= 0.68) topReasons.push(`Smoothness ${formatPercentLabel(score.smoothnessScore)}`);
  if (score.embeddingSimilarity >= 0.72) topReasons.push(`Doku benzerligi ${formatPercentLabel(score.embeddingSimilarity)}`);
  if (score.loudnessContinuityScore >= 0.7) topReasons.push(`Loudness gecisi ${formatPercentLabel(score.loudnessContinuityScore)}`);
  if (runtimeBias >= 0.05) topReasons.push(`Runtime guven +${Math.round(runtimeBias * 100)}%`);
  if (runtimeBias <= -0.05) topReasons.push(`Runtime riski ${Math.round(Math.abs(runtimeBias) * 100)}%`);

  const gatedReason = gatePreview?.wouldPassV3 === false
    ? gatePreview.reasons[0]
    : undefined;
  if (topReasons.length === 0) {
    topReasons.push(`Final skor ${formatPercentLabel(score.finalScore)}`);
  }
  return {
    topReasons: topReasons.slice(0, 4),
    gateStatus: gatePreview?.wouldPassV3 === false ? 'fail' : 'pass',
    skipReason: gatedReason,
  };
}

function computeSeedScoreProfile(candidates: TransitionCandidate[]): Pick<
BaselineSeedReport,
  | 'averageEventMatchScore'
  | 'averageEmbeddingSimilarity'
  | 'averageTempoRatioScore'
  | 'averageHarmonicCompatibilityScore'
  | 'averageRhythmAlignmentScore'
  | 'averageLoudnessContinuityScore'
  | 'averageSmoothnessScore'
  | 'averageArtifactPenalty'
  | 'dominantDriver'
> {
  if (candidates.length === 0) {
    return {
      averageEventMatchScore: 0,
      averageEmbeddingSimilarity: 0,
      averageTempoRatioScore: 0,
      averageHarmonicCompatibilityScore: 0,
      averageRhythmAlignmentScore: 0,
      averageLoudnessContinuityScore: 0,
      averageSmoothnessScore: 0,
      averageArtifactPenalty: 0,
      dominantDriver: null,
    };
  }

  let eventTotal = 0;
  let embeddingTotal = 0;
  let tempoRatioTotal = 0;
  let harmonicCompatibilityTotal = 0;
  let rhythmTotal = 0;
  let loudnessTotal = 0;
  let smoothnessTotal = 0;
  let penaltyTotal = 0;
  const driverCount: Record<TransitionScoreDriver, number> = {
    event: 0,
    embedding: 0,
    rhythm: 0,
    loudness: 0,
    penalty: 0,
  };
  const driverOrder: TransitionScoreDriver[] = ['penalty', 'event', 'embedding', 'rhythm', 'loudness'];

  candidates.forEach((candidate) => {
    eventTotal += candidate.score.eventMatchScore;
    embeddingTotal += candidate.score.embeddingSimilarity;
    tempoRatioTotal += candidate.score.tempoRatioScore;
    harmonicCompatibilityTotal += candidate.score.harmonicCompatibilityScore;
    rhythmTotal += candidate.score.rhythmAlignmentScore;
    loudnessTotal += candidate.score.loudnessContinuityScore;
    smoothnessTotal += candidate.score.smoothnessScore;
    penaltyTotal += candidate.score.artifactPenalty;
    driverCount[candidate.diagnostic.primaryDriver] += 1;
  });

  const dominantDriver = driverOrder.reduce<TransitionScoreDriver | null>((best, current) => {
    if (best === null) return current;
    return driverCount[current] > driverCount[best] ? current : best;
  }, null);

  return {
    averageEventMatchScore: clamp(eventTotal / candidates.length, 0, 1),
    averageEmbeddingSimilarity: clamp(embeddingTotal / candidates.length, 0, 1),
    averageTempoRatioScore: clamp(tempoRatioTotal / candidates.length, 0, 1),
    averageHarmonicCompatibilityScore: clamp(harmonicCompatibilityTotal / candidates.length, 0, 1),
    averageRhythmAlignmentScore: clamp(rhythmTotal / candidates.length, 0, 1),
    averageLoudnessContinuityScore: clamp(loudnessTotal / candidates.length, 0, 1),
    averageSmoothnessScore: clamp(smoothnessTotal / candidates.length, 0, 1),
    averageArtifactPenalty: clamp(penaltyTotal / candidates.length, 0, 1),
    dominantDriver,
  };
}

function pickSeedIssue(seed: BaselineSeedReport): TransitionScoreDriver {
  const weakestPositive = [
    { key: 'event' as const, value: seed.averageEventMatchScore },
    { key: 'embedding' as const, value: seed.averageEmbeddingSimilarity },
    { key: 'rhythm' as const, value: seed.averageRhythmAlignmentScore },
    { key: 'loudness' as const, value: seed.averageLoudnessContinuityScore },
  ].reduce((best, current) => (current.value < best.value ? current : best));

  if (seed.averageArtifactPenalty >= 0.55 && seed.averageArtifactPenalty > weakestPositive.value) {
    return 'penalty';
  }
  return weakestPositive.key;
}

function buildTuningRecommendation(issue: TransitionScoreDriver, seed: BaselineSeedReport): string {
  if (issue === 'penalty') {
    return 'Artifact penalty yuksek; bpm/loudness toleranslarini yumusatip yeniden benchmark kos.';
  }
  if (issue === 'rhythm') {
    if (seed.averageTempoRatioScore + 0.08 < seed.averageHarmonicCompatibilityScore) {
      return 'Rhythm uyumu zayif; tempo-ratio sinyalini iyilestirmek icin half/double-time toleransini ve bpm normalize adimini tune et.';
    }
    if (seed.averageHarmonicCompatibilityScore + 0.08 < seed.averageTempoRatioScore) {
      return 'Rhythm uyumu zayif; harmonic uyumu iyilestirmek icin chroma/key uyum cezasini tune et.';
    }
    return 'Rhythm uyumu zayif; tempo-ratio + harmonic dengesi icin rhythm katsayilarini kontrollu guncelleyip benchmark tekrarla.';
  }
  if (issue === 'event') {
    return 'Event eslesmesi dusuk; event compatibility tablosunu bottom-seed event ciftlerine gore tune et.';
  }
  if (issue === 'embedding') {
    return 'Embedding benzerligi zayif; embedding agirligini kontrollu arttirip Hit@K etkisini olc.';
  }
  return 'Loudness surekliligi dusuk; loudness continuity agirligini ve transition volume envelope ayarlarini incele.';
}

function buildSeedTuningAction(
  seed: BaselineSeedReport,
  gateFailContext: {
    sampleCount: number;
    distribution: Array<{
      reason: TransitionGateReason;
      count: number;
      rate: number;
    }>;
  }
): BaselineTuningAction {
  const issue = pickSeedIssue(seed);
  const confidenceBase = issue === 'penalty'
    ? seed.averageArtifactPenalty
    : 1 - (
      issue === 'event'
        ? seed.averageEventMatchScore
        : issue === 'embedding'
          ? seed.averageEmbeddingSimilarity
          : issue === 'rhythm'
            ? seed.averageRhythmAlignmentScore
            : seed.averageLoudnessContinuityScore
    );
  const gateFailSummary = gateFailContext.distribution.length === 0
    ? 'Gate-fail dagilimi: veri yok.'
    : `Gate-fail dagilimi: ${gateFailContext.distribution
      .map((item) => `${item.reason} ${formatPercentLabel(item.rate)} (${item.count})`)
      .join(', ')}.`;

  return {
    trackId: seed.trackId,
    issue,
    recommendation: `${buildTuningRecommendation(issue, seed)} ${gateFailSummary}`,
    confidence: clamp(confidenceBase, 0, 1),
    priority: 'normal',
    escalationReason: null,
    gateFailSampleCount: gateFailContext.sampleCount,
    gateFailDistribution: gateFailContext.distribution,
  };
}

function validateTuningActions(
  previousRun: BaselineRunArtifact | undefined,
  nextTuningActions: BaselineTuningAction[],
  nextMetrics: {
    meanTopKScore: number;
    hitAt3: number | null;
    hitAt5: number | null;
    regressionDetected: boolean;
    runtimeGatePassed: boolean;
  }
): {
  summary: string | null;
  passed: boolean;
} {
  if (!previousRun || previousRun.tuningActions.length === 0 || nextTuningActions.length === 0) {
    return {
      summary: null,
      passed: true,
    };
  }

  const previousTopAction = previousRun.tuningActions[0];
  const nextTopAction = nextTuningActions[0];
  const qualityImproved =
    nextMetrics.meanTopKScore > previousRun.meanTopKScore + 0.005
    || (
      previousRun.hitAt3 !== null
      && nextMetrics.hitAt3 !== null
      && nextMetrics.hitAt3 > previousRun.hitAt3
    )
    || (
      previousRun.hitAt5 !== null
      && nextMetrics.hitAt5 !== null
      && nextMetrics.hitAt5 > previousRun.hitAt5
    );
  const gateDegraded = nextMetrics.regressionDetected || !nextMetrics.runtimeGatePassed;
  const qualityGatePassed = qualityImproved && !gateDegraded;
  const qualityGateSummary = qualityGatePassed
    ? 'quality improved without gate degradation: PASS'
    : `quality improved without gate degradation: FAIL (${[
      qualityImproved ? null : 'quality did not improve',
      nextMetrics.regressionDetected ? 'regression detected' : null,
      !nextMetrics.runtimeGatePassed ? 'runtime gate degraded' : null,
    ].filter((item): item is string => item !== null).join(', ')})`;

  if (
    previousTopAction.trackId !== nextTopAction.trackId
    || previousTopAction.issue !== nextTopAction.issue
  ) {
    return {
      summary: `Top issue degisti: ${previousTopAction.trackId}/${previousTopAction.issue} -> ${nextTopAction.trackId}/${nextTopAction.issue} | ${qualityGateSummary}`,
      passed: qualityGatePassed,
    };
  }

  const confidenceDelta = nextTopAction.confidence - previousTopAction.confidence;
  if (confidenceDelta <= -0.05) {
    return {
      summary: `Top issue iyilesti: ${nextTopAction.trackId}/${nextTopAction.issue} ${formatPercentLabel(previousTopAction.confidence)} -> ${formatPercentLabel(nextTopAction.confidence)} | ${qualityGateSummary}`,
      passed: qualityGatePassed,
    };
  }
  if (confidenceDelta > 0.02) {
    return {
      summary: `Top issue kotulesti: ${nextTopAction.trackId}/${nextTopAction.issue} ${formatPercentLabel(previousTopAction.confidence)} -> ${formatPercentLabel(nextTopAction.confidence)} | ${qualityGateSummary}`,
      passed: false,
    };
  }

  return {
    summary: `Top issue stabil: ${nextTopAction.trackId}/${nextTopAction.issue} (${formatPercentLabel(nextTopAction.confidence)}) | ${qualityGateSummary}`,
    passed: qualityGatePassed,
  };
}

function sanitizeNode(trackId: string, node: TransitionNode): TransitionNode {
  const eventType = (node as { eventType?: string }).eventType;
  const eventTypes: TransitionEventType[] = [
    'scream-hit',
    'drop',
    'vocal-hit',
    'build-up',
    'bass-hit',
    'silence-break',
    'percussive-hit',
    'other',
  ];
  const normalizedEventType: TransitionEventType =
    eventType && eventTypes.includes(eventType as TransitionEventType)
      ? (eventType as TransitionEventType)
      : 'other';

  return {
    ...node,
    trackId,
    id: (node as { id?: string }).id || `${trackId}:${toFiniteNumber(node.timeMs, 0)}`,
    timeMs: Math.max(0, Math.round(toFiniteNumber(node.timeMs, 0))),
    eventType: normalizedEventType,
    eventConfidence: clamp(toFiniteNumber(node.eventConfidence, 0.6), 0, 1),
    bpmLocal: toFiniteNumber(node.bpmLocal, 120),
    loudnessRms: toFiniteNumber(node.loudnessRms, -12),
    embedding: sanitizeNumericArray((node as { embedding?: unknown }).embedding, 16),
    chroma: sanitizeNumericArray((node as { chroma?: unknown }).chroma, 12),
  };
}

export function scoreTransitionPair(
  sourceNode: TransitionNode,
  targetNode: TransitionNode
): TransitionEdgeScore {
  const sourceTrackId = typeof sourceNode.trackId === 'string' && sourceNode.trackId.trim().length > 0
    ? sourceNode.trackId.trim()
    : '__source__';
  const targetTrackId = typeof targetNode.trackId === 'string' && targetNode.trackId.trim().length > 0
    ? targetNode.trackId.trim()
    : '__target__';

  const sanitizedSource = sanitizeNode(sourceTrackId, sourceNode);
  const sanitizedTarget = sanitizeNode(targetTrackId, targetNode);
  return scoreTransition(sanitizedSource, sanitizedTarget);
}

export function explainTransitionPair(
  sourceNode: TransitionNode,
  targetNode: TransitionNode
): TransitionScoreDiagnostic {
  return buildScoreDiagnostic(scoreTransitionPair(sourceNode, targetNode));
}

function removeTrackFromQueue(trackId: string): void {
  analysisQueue = analysisQueue.filter((item) => item !== trackId);
}

export async function enqueueTrackForAnalysis(trackId: string): Promise<AnalysisState> {
  hydrateFromStorage();
  const normalizedTrackId = normalizeTrackId(trackId);

  if (!analysisQueue.includes(normalizedTrackId)) {
    analysisQueue.push(normalizedTrackId);
  }

  const state = setAnalysisState(normalizedTrackId, 'pending');
  persistStorage();
  return state;
}

export function getAnalysisState(trackId: string): AnalysisState | null {
  hydrateFromStorage();
  const normalizedTrackId = normalizeTrackId(trackId);
  return analysisStates[normalizedTrackId] ?? null;
}

export function getAnalysisQueue(): string[] {
  hydrateFromStorage();
  return [...analysisQueue];
}

export async function claimNextTrackForAnalysis(): Promise<string | null> {
  hydrateFromStorage();
  const nextTrackId = analysisQueue.shift() ?? null;
  persistStorage();
  return nextTrackId;
}

export function upsertAnalyzedNodes(
  trackId: string,
  nodes: TransitionNode[],
  status: AnalysisStatus = 'ready'
): AnalysisState {
  hydrateFromStorage();
  const normalizedTrackId = normalizeTrackId(trackId);

  nodesByTrack[normalizedTrackId] = nodes.map((node) =>
    sanitizeNode(normalizedTrackId, node)
  );
  removeTrackFromQueue(normalizedTrackId);

  const state = setAnalysisState(normalizedTrackId, status);
  persistStorage();
  return state;
}

export function markAnalysisFailed(trackId: string, errorMessage: string): AnalysisState {
  hydrateFromStorage();
  const normalizedTrackId = normalizeTrackId(trackId);
  removeTrackFromQueue(normalizedTrackId);
  const state = setAnalysisState(normalizedTrackId, 'failed', errorMessage);
  persistStorage();
  return state;
}

export function getAnalyzedNodes(trackId: string): TransitionNode[] {
  hydrateFromStorage();
  const normalizedTrackId = normalizeTrackId(trackId);
  return [...(nodesByTrack[normalizedTrackId] ?? [])];
}

export async function analyzeTrackWithHeuristicV1(
  track: Pick<UnifiedTrack, 'id' | 'durationMs' | 'name' | 'artist'>
): Promise<AnalysisState> {
  const normalizedTrackId = normalizeTrackId(track.id);
  trackMetadataById[normalizedTrackId] = {
    name: track.name.trim() || normalizedTrackId,
    artist: track.artist.trim() || 'Unknown Artist',
  };
  await enqueueTrackForAnalysis(normalizedTrackId);

  try {
    const nodes = extractTransitionNodesV1(track);
    return upsertAnalyzedNodes(normalizedTrackId, nodes, 'ready');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Heuristic analysis failed';
    return markAnalysisFailed(normalizedTrackId, message);
  }
}

export async function findTransitionCandidates(
  input: FindTransitionCandidatesInput
): Promise<TransitionCandidate[]> {
  hydrateFromStorage();

  const sourceTrackId = normalizeTrackId(input.trackId);
  const excludedTargetTrackIds = new Set(
    normalizeTrackIds(input.excludeTargetTrackIds).filter((trackId) => trackId !== sourceTrackId)
  );
  const sourceNodes = nodesByTrack[sourceTrackId] ?? [];
  if (sourceNodes.length === 0) return [];

  const sourceNodeCandidates =
    input.sourceTimeMs === undefined
      ? sourceNodes
      : [getSourceNode(sourceNodes, input.sourceTimeMs)];
  const limit = clamp(input.limit ?? 5, 1, 50);
  const sourceTier = resolveSeedPerformanceTier(sourceTrackId, input.seedTrackPerformanceTier);
  const diversityBudgetTopN = resolveDiversityBudgetTopN(limit, sourceTier);
  const sourceArtistNormalized = (trackMetadataById[sourceTrackId]?.artist ?? '').trim().toLowerCase();
  const runtimeBiasByTarget = new Map<string, number>();

  const resolveRuntimeBias = (targetTrackId: string): number => {
    if (runtimeBiasByTarget.has(targetTrackId)) {
      return runtimeBiasByTarget.get(targetTrackId) ?? 0;
    }
    const bias = computeRuntimeReliabilityBias(sourceTrackId, targetTrackId);
    runtimeBiasByTarget.set(targetTrackId, bias);
    return bias;
  };

  interface TargetNodeReference {
    trackId: string;
    node: TransitionNode;
  }

  const targetNodeReferences: TargetNodeReference[] = [];
  Object.entries(nodesByTrack).forEach(([targetTrackId, targetNodes]) => {
    if (targetTrackId === sourceTrackId || excludedTargetTrackIds.has(targetTrackId)) return;
    targetNodes.forEach((node) => {
      targetNodeReferences.push({
        trackId: targetTrackId,
        node,
      });
    });
  });
  if (targetNodeReferences.length === 0) return [];

  const retrievalIndex = await createRetrievalIndex(
    targetNodeReferences.map((entry, index) => ({
      id: index,
      vector: entry.node.embedding,
    }))
  );

  const candidates: TransitionCandidate[] = [];
  const retrievalPoolLimit = Math.min(
    targetNodeReferences.length,
    Math.max(limit * 18, 40)
  );

  sourceNodeCandidates.forEach((sourceNode) => {
    const nearestIndices = retrievalIndex.query(sourceNode.embedding, retrievalPoolLimit);
    const retrievalPool = nearestIndices.length > 0
      ? nearestIndices
          .map((index) => targetNodeReferences[index])
          .filter((entry): entry is TargetNodeReference => Boolean(entry))
      : targetNodeReferences;

    retrievalPool.forEach((targetEntry) => {
      if (excludedTargetTrackIds.has(targetEntry.trackId)) return;
      if (isFeedbackPairBlacklisted(sourceTrackId, targetEntry.trackId)) return;
      const score = scoreTransition(sourceNode, targetEntry.node);
      const gatePreview = applyHardGate(sourceNode, targetEntry.node);
      const learningBias = computeLearningBias(sourceTrackId, targetEntry.trackId);
      const runtimeBias = resolveRuntimeBias(targetEntry.trackId);
      candidates.push({
        sourceTrackId,
        sourceTimeMs: sourceNode.timeMs,
        sourceLoudnessRms: sourceNode.loudnessRms,
        targetTrackId: targetEntry.trackId,
        targetTimeMs: targetEntry.node.timeMs,
        targetLoudnessRms: targetEntry.node.loudnessRms,
        confidenceScore: clamp(
          score.finalScore * 0.75
            + (1 - score.artifactPenalty) * 0.25
            + learningBias * 0.5
            + runtimeBias * 0.45,
          0,
          1
        ),
        diversityPenalty: 0,
        learningBias,
        runtimeBias,
        score,
        diagnostic: buildScoreDiagnostic(score),
        explain: buildTransitionExplain(score, runtimeBias, {
          wouldPassV3: gatePreview.passed,
          reasons: gatePreview.reasons,
        }),
        gatePreview: {
          wouldPassV3: gatePreview.passed,
          reasons: gatePreview.reasons,
        },
        sourceEventType: sourceNode.eventType,
        targetEventType: targetEntry.node.eventType,
      });
    });
  });

  const sorted = candidates.sort((a, b) => {
    const aGate = a.gatePreview?.wouldPassV3 !== false;
    const bGate = b.gatePreview?.wouldPassV3 !== false;
    if (aGate !== bGate) {
      return aGate ? -1 : 1;
    }
    return computeCandidateSelectionScore(b) - computeCandidateSelectionScore(a);
  });

  const reranked: TransitionCandidate[] = [];
  const includedKeys = new Set<string>();
  const uniqueTargetTrackIds = new Set<string>();
  const targetUseCount = new Map<string, number>();
  const targetArtistUseCount = new Map<string, number>();
  const targetSelectedTimesByTrack = new Map<string, number[]>();
  const eventPairUseCount = new Map<string, number>();
  const eventFamilyPairUseCount = new Map<string, number>();
  const driverUseCount = new Map<string, number>();

  const getCandidateKey = (candidate: TransitionCandidate): string =>
    `${candidate.targetTrackId}:${candidate.targetTimeMs}:${candidate.sourceTimeMs}`;
  const getTargetArtist = (candidate: TransitionCandidate): string =>
    (trackMetadataById[candidate.targetTrackId]?.artist ?? '').trim().toLowerCase();
  const getEventPairKey = (candidate: TransitionCandidate): string =>
    `${candidate.sourceEventType}->${candidate.targetEventType}`;
  const getEventFamilyPairKey = (candidate: TransitionCandidate): string =>
    `${getEventFamily(candidate.sourceEventType)}->${getEventFamily(candidate.targetEventType)}`;
  const incrementMap = (counter: Map<string, number>, key: string): void => {
    counter.set(key, (counter.get(key) ?? 0) + 1);
  };
  const countNearbyTargetMoments = (candidate: TransitionCandidate): number => {
    const selectedTimes = targetSelectedTimesByTrack.get(candidate.targetTrackId) ?? [];
    return selectedTimes.reduce((count, selectedTime) => (
      count + (Math.abs(selectedTime - candidate.targetTimeMs) <= NEAR_DUPLICATE_TARGET_WINDOW_MS ? 1 : 0)
    ), 0);
  };

  const includeCandidate = (candidate: TransitionCandidate): boolean => {
    const key = `${candidate.targetTrackId}:${candidate.targetTimeMs}:${candidate.sourceTimeMs}`;
    if (includedKeys.has(key)) return false;
    const existingCount = targetUseCount.get(candidate.targetTrackId) ?? 0;
    if (reranked.length < diversityBudgetTopN && existingCount >= 1) {
      return false;
    }
    const nearbyMomentCount = countNearbyTargetMoments(candidate);
    if (nearbyMomentCount > 0) {
      return false;
    }
    const targetArtist = getTargetArtist(candidate);
    const sameArtistPenalty = sourceArtistNormalized.length > 0 && targetArtist === sourceArtistNormalized
      ? 0.12
      : 0;
    const artistReusePenalty = targetArtist.length === 0
      ? 0
      : 0.05 * (targetArtistUseCount.get(targetArtist) ?? 0);
    const diversityPenalty = clamp(
      0.09 * existingCount
      + 0.04 * nearbyMomentCount
      + sameArtistPenalty
      + artistReusePenalty,
      0,
      1
    );
    const normalizedCandidate: TransitionCandidate = {
      ...candidate,
      diversityPenalty,
      confidenceScore: clamp(candidate.confidenceScore - diversityPenalty * 0.35, 0, 1),
    };
    reranked.push(normalizedCandidate);
    includedKeys.add(key);
    uniqueTargetTrackIds.add(candidate.targetTrackId);
    incrementMap(targetUseCount, candidate.targetTrackId);
    if (targetArtist.length > 0) {
      incrementMap(targetArtistUseCount, targetArtist);
    }
    incrementMap(eventPairUseCount, getEventPairKey(candidate));
    incrementMap(eventFamilyPairUseCount, getEventFamilyPairKey(candidate));
    incrementMap(driverUseCount, candidate.diagnostic.primaryDriver);
    targetSelectedTimesByTrack.set(candidate.targetTrackId, [
      ...(targetSelectedTimesByTrack.get(candidate.targetTrackId) ?? []),
      candidate.targetTimeMs,
    ]);
    return true;
  };

  // Pass 1: when source time is not pinned, diversify by source transition points first.
  if (input.sourceTimeMs === undefined) {
    const uniqueSourceTimes = new Set<number>();
    sorted.forEach((candidate) => {
      if (reranked.length >= limit) return;
      if (uniqueSourceTimes.has(candidate.sourceTimeMs)) return;
      if (includeCandidate(candidate)) {
        uniqueSourceTimes.add(candidate.sourceTimeMs);
      }
    });
  }

  // Pass 2: prefer different target tracks before duplicates.
  sorted.forEach((candidate) => {
    if (reranked.length >= limit) return;
    if (uniqueTargetTrackIds.has(candidate.targetTrackId)) return;
    includeCandidate(candidate);
  });

  // Pass 3: hard-negative rerank. Prefer candidates that add diversity in target/event/driver.
  const remaining = sorted.filter((candidate) => !includedKeys.has(getCandidateKey(candidate)));
  while (reranked.length < limit && remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    remaining.forEach((candidate, index) => {
      const targetCount = targetUseCount.get(candidate.targetTrackId) ?? 0;
      const targetArtist = getTargetArtist(candidate);
      const targetArtistCount = targetArtist.length > 0 ? (targetArtistUseCount.get(targetArtist) ?? 0) : 0;
      const eventPairCount = eventPairUseCount.get(getEventPairKey(candidate)) ?? 0;
      const eventFamilyCount = eventFamilyPairUseCount.get(getEventFamilyPairKey(candidate)) ?? 0;
      const driverCount = driverUseCount.get(candidate.diagnostic.primaryDriver) ?? 0;
      const nearbyMomentCount = countNearbyTargetMoments(candidate);
      const sameArtistPenalty = sourceArtistNormalized.length > 0 && targetArtist === sourceArtistNormalized ? 0.12 : 0;

      const targetPenalty = 0.09 * targetCount;
      const targetSaturationPenalty = reranked.length === 0
        ? 0
        : 0.05 * (targetCount / reranked.length);
      const targetArtistPenalty = 0.06 * targetArtistCount;
      const eventPairPenalty = 0.06 * eventPairCount;
      const eventFamilyPenalty = 0.045 * eventFamilyCount;
      const driverPenalty = 0.03 * driverCount;
      const temporalPenalty = 0.05 * nearbyMomentCount;
      const noveltyBonus =
        (targetCount === 0 ? 0.02 : 0)
        + (eventPairCount === 0 ? 0.03 : 0)
        + (eventFamilyCount === 0 ? 0.02 : 0);
      const adjustedScore =
        computeCandidateSelectionScore(candidate)
        + noveltyBonus
        - targetPenalty
        - targetSaturationPenalty
        - targetArtistPenalty
        - sameArtistPenalty
        - eventPairPenalty
        - eventFamilyPenalty
        - driverPenalty
        - temporalPenalty;
      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
      }
    });

    const [bestCandidate] = remaining.splice(bestIndex, 1);
    includeCandidate(bestCandidate);
  }

  return reranked;
}

export async function runBaselineEvaluation(
  input: BaselineEvaluationInput = {}
): Promise<BaselineEvaluationResult> {
  hydrateFromStorage();

  const limit = clamp(input.limit ?? 5, 1, 20);
  const goodThreshold = clamp(input.goodThreshold ?? 0.6, 0, 1);
  const scopeLabel: BaselineScopeLabel = input.scopeLabel ?? 'custom';
  const regressionGateEnforced = Boolean(input.enforceRegressionGate);
  const tuningValidationGateEnforced = Boolean(input.enforceTuningValidationGate);
  const runtimeGateEnforced = Boolean(input.enforceRuntimeGate);
  const benchmarkMergeGateEnforced = Boolean(input.enforceBenchmarkMergeGate);
  const runtimeGateThresholds = {
    minTransitionRuntimeSampleCount: Math.max(
      1,
      Math.floor(
        input.minTransitionRuntimeSampleCount
        ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.minTransitionRuntimeSampleCount
      )
    ),
    maxTransitionLatencyP95Ms: Math.max(
      1,
      Math.floor(
        input.maxTransitionLatencyP95Ms
        ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionLatencyP95Ms
      )
    ),
    maxTransitionStallRate: clamp(
      input.maxTransitionStallRate
      ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionStallRate,
      0,
      1
    ),
    maxTransitionDropRate: clamp(
      input.maxTransitionDropRate
      ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionDropRate,
      0,
      1
    ),
  };
  const requiredRelevantTargetsPerSeed = Math.max(
    1,
    Math.floor(input.requiredRelevantTargetsPerSeed ?? 2)
  );
  const relevanceTargetGateEnforced = Boolean(input.enforceRelevantTargetMinimum);
  const readyTrackIds = Object.values(analysisStates)
    .filter((state) => state.status === 'ready')
    .map((state) => state.trackId);

  const seedTrackIds = (input.seedTrackIds ?? readyTrackIds)
    .map((trackId) => trackId.trim())
    .filter((trackId) => trackId.length > 0 && readyTrackIds.includes(trackId));
  const scopeId = normalizeScopeId(scopeLabel, input.scopeId, seedTrackIds);
  const seedSetHash = computeSeedSetHash(seedTrackIds);
  const runMode = resolveRunMode(input.runMode);
  const relevantTargetsBySeed = Object.fromEntries(
    Object.entries(input.relevantTargetsBySeed ?? {}).map(([seedTrackId, targetTrackIds]) => [
      seedTrackId.trim(),
      Array.from(
        new Set(
          (Array.isArray(targetTrackIds) ? targetTrackIds : [])
            .map((targetTrackId) => targetTrackId.trim())
            .filter((targetTrackId) => targetTrackId.length > 0)
        )
      ),
    ])
  );
  const seedsBelowRelevantTargetMinimumDetails: SeedRelevantTargetGap[] = seedTrackIds
    .map((trackId) => {
      const relevantTargetCount = (relevantTargetsBySeed[trackId] ?? []).length;
      const missingTargetCount = Math.max(0, requiredRelevantTargetsPerSeed - relevantTargetCount);
      if (missingTargetCount === 0) return null;
      return {
        trackId,
        relevantTargetCount,
        missingTargetCount,
      } as SeedRelevantTargetGap;
    })
    .filter((item): item is SeedRelevantTargetGap => item !== null);
  const seedsBelowRelevantTargetMinimum = seedsBelowRelevantTargetMinimumDetails
    .map((item) => item.trackId);

  let seedWithCandidates = 0;
  let labeledSeedCount = 0;
  let top1Total = 0;
  let topKMeanTotal = 0;
  let goodSeedCount = 0;
  let hitAt3Total = 0;
  let hitAt5Total = 0;
  const seedReports: BaselineSeedReport[] = [];

  for (const trackId of seedTrackIds) {
    const candidates = await findTransitionCandidates({
      trackId,
      limit,
      seedTrackPerformanceTier: resolveSeedPerformanceTier(trackId),
    });
    const seedScoreProfile = computeSeedScoreProfile(candidates);
    const relevantTargetTrackIds = relevantTargetsBySeed[trackId] ?? [];
    let seedHitAt3: number | null = null;
    let seedHitAt5: number | null = null;
    if (relevantTargetTrackIds.length > 0) {
      seedHitAt3 = computeHitAtK(candidates, relevantTargetTrackIds, 3);
      seedHitAt5 = computeHitAtK(candidates, relevantTargetTrackIds, 5);
      labeledSeedCount += 1;
      hitAt3Total += seedHitAt3;
      hitAt5Total += seedHitAt5;
    }

    if (candidates.length === 0) {
      seedReports.push({
        trackId,
        candidateCount: 0,
        top1Score: 0,
        meanTopKScore: 0,
        hasGoodCandidate: false,
        hitAt3: seedHitAt3,
        hitAt5: seedHitAt5,
        averageEventMatchScore: seedScoreProfile.averageEventMatchScore,
        averageEmbeddingSimilarity: seedScoreProfile.averageEmbeddingSimilarity,
        averageTempoRatioScore: seedScoreProfile.averageTempoRatioScore,
        averageHarmonicCompatibilityScore: seedScoreProfile.averageHarmonicCompatibilityScore,
        averageRhythmAlignmentScore: seedScoreProfile.averageRhythmAlignmentScore,
        averageLoudnessContinuityScore: seedScoreProfile.averageLoudnessContinuityScore,
        averageSmoothnessScore: seedScoreProfile.averageSmoothnessScore,
        averageArtifactPenalty: seedScoreProfile.averageArtifactPenalty,
        dominantDriver: seedScoreProfile.dominantDriver,
      });
      continue;
    }

    seedWithCandidates += 1;
    top1Total += candidates[0].score.finalScore;
    const topKMean =
      candidates.reduce((sum, candidate) => sum + candidate.score.finalScore, 0) /
      candidates.length;
    topKMeanTotal += topKMean;

    const hasGoodCandidate = candidates.some((candidate) => candidate.score.finalScore >= goodThreshold);
    if (hasGoodCandidate) {
      goodSeedCount += 1;
    }

    seedReports.push({
      trackId,
      candidateCount: candidates.length,
      top1Score: candidates[0].score.finalScore,
      meanTopKScore: topKMean,
      hasGoodCandidate,
      hitAt3: seedHitAt3,
      hitAt5: seedHitAt5,
      averageEventMatchScore: seedScoreProfile.averageEventMatchScore,
      averageEmbeddingSimilarity: seedScoreProfile.averageEmbeddingSimilarity,
      averageTempoRatioScore: seedScoreProfile.averageTempoRatioScore,
      averageHarmonicCompatibilityScore: seedScoreProfile.averageHarmonicCompatibilityScore,
      averageRhythmAlignmentScore: seedScoreProfile.averageRhythmAlignmentScore,
      averageLoudnessContinuityScore: seedScoreProfile.averageLoudnessContinuityScore,
      averageSmoothnessScore: seedScoreProfile.averageSmoothnessScore,
      averageArtifactPenalty: seedScoreProfile.averageArtifactPenalty,
      dominantDriver: seedScoreProfile.dominantDriver,
    });
  }

  const safeDiv = (numerator: number, denominator: number): number =>
    denominator === 0 ? 0 : numerator / denominator;
  const scopedRuntimeEvents = getScopedRuntimeEvents(seedTrackIds);
  const buildSeedGateFailContext = (seedTrackId: string): {
    sampleCount: number;
    distribution: Array<{
      reason: TransitionGateReason;
      count: number;
      rate: number;
    }>;
  } => {
    const skipEvents = scopedRuntimeEvents.filter((event) =>
      event.sourceTrackId === seedTrackId && event.skippedAutoTransition
    );
    const sampleCount = skipEvents.length;
    const reasonCounts = skipEvents.reduce<Map<TransitionGateReason, number>>((counts, event) => {
      const reasons = event.skipReasons ?? [];
      reasons.forEach((reason) => {
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      });
      return counts;
    }, new Map());
    const distribution = [...reasonCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([reason, count]) => ({
        reason,
        count,
        rate: sampleCount === 0 ? 0 : count / sampleCount,
      }));
    return {
      sampleCount,
      distribution,
    };
  };
  const bottomSeeds = seedReports
    .filter((seed) => seed.candidateCount > 0)
    .sort((a, b) => a.meanTopKScore - b.meanTopKScore || a.top1Score - b.top1Score)
    .slice(0, 3);
  const tuningActions = bottomSeeds.map((seed) => {
    const gateFailContext = buildSeedGateFailContext(seed.trackId);
    return buildSeedTuningAction(seed, gateFailContext);
  });

  const runtimeStats = computeRuntimeStats(scopedRuntimeEvents);
  const runtimeConfidenceSamples = scopedRuntimeEvents
    .map((event) => event.confidenceScore)
    .filter((value): value is number => value !== undefined && value !== null && Number.isFinite(value));
  const averageDecisionConfidenceScore = runtimeConfidenceSamples.length === 0
    ? null
    : clamp(
      runtimeConfidenceSamples.reduce((sum, value) => sum + value, 0) / runtimeConfidenceSamples.length,
      0,
      1
    );
  const fallbackTriggeredCount = scopedRuntimeEvents.filter((event) => event.fallbackTriggered).length;
  const manualQueueSuggestedCount = scopedRuntimeEvents.filter((event) => event.manualQueueSuggested).length;
  const manualQueueAcceptedCount = scopedRuntimeEvents.filter((event) => event.manualAccepted).length;
  const autoTransitionDecisionSampleCount = scopedRuntimeEvents.length;
  const autoTransitionSkippedCount = scopedRuntimeEvents
    .filter((event) => event.skippedAutoTransition)
    .length;
  const autoTransitionSkipRate = autoTransitionDecisionSampleCount === 0
    ? null
    : autoTransitionSkippedCount / autoTransitionDecisionSampleCount;
  const skipReasonCounts = scopedRuntimeEvents.reduce<Map<TransitionGateReason, number>>((counts, event) => {
    if (!event.skippedAutoTransition) return counts;
    const reasons = event.skipReasons ?? [];
    reasons.forEach((reason) => {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    });
    return counts;
  }, new Map());
  const topAutoTransitionSkipReasons = [...skipReasonCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([reason]) => reason);
  const autoTransitionSkipBySeed = seedTrackIds
    .map((trackId) => {
      const seedEvents = scopedRuntimeEvents.filter((event) => event.sourceTrackId === trackId);
      const decisionSampleCount = seedEvents.length;
      const skippedEvents = seedEvents.filter((event) => event.skippedAutoTransition);
      const skippedCount = skippedEvents.length;
      const reasonCounts = skippedEvents.reduce<Map<TransitionGateReason, number>>((counts, event) => {
        (event.skipReasons ?? []).forEach((reason) => {
          counts.set(reason, (counts.get(reason) ?? 0) + 1);
        });
        return counts;
      }, new Map());
      const topSkipReasons = [...reasonCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 3)
        .map(([reason, count]) => ({
          reason,
          count,
          rate: skippedCount === 0 ? 0 : count / skippedCount,
        }));
      return {
        trackId,
        decisionSampleCount,
        skippedCount,
        skipRate: decisionSampleCount === 0 ? null : skippedCount / decisionSampleCount,
        topSkipReasons,
      } as AutoTransitionSeedSkipSummary;
    })
    .filter((item) => item.decisionSampleCount > 0)
    .sort((a, b) => {
      if (b.skippedCount !== a.skippedCount) return b.skippedCount - a.skippedCount;
      if ((b.skipRate ?? 0) !== (a.skipRate ?? 0)) return (b.skipRate ?? 0) - (a.skipRate ?? 0);
      return a.trackId.localeCompare(b.trackId);
    })
    .slice(0, 5);
  const transitionRuntimeSampleCount = runtimeStats.sampleCount;
  const transitionLatencyP95Ms = runtimeStats.latencyP95Ms;
  const transitionStallRate = runtimeStats.stallRate;
  const transitionDropRate = runtimeStats.dropRate;
  const runtimeGateReasons: string[] = [];
  if (transitionRuntimeSampleCount < runtimeGateThresholds.minTransitionRuntimeSampleCount) {
    runtimeGateReasons.push(
      `Ornek yetersiz ${transitionRuntimeSampleCount}/${runtimeGateThresholds.minTransitionRuntimeSampleCount}`
    );
  }
  if (transitionLatencyP95Ms === null) {
    runtimeGateReasons.push('Latency p95 yok');
  } else if (transitionLatencyP95Ms > runtimeGateThresholds.maxTransitionLatencyP95Ms) {
    runtimeGateReasons.push(
      `p95 ${transitionLatencyP95Ms}ms > ${runtimeGateThresholds.maxTransitionLatencyP95Ms}ms`
    );
  }
  if (transitionStallRate === null) {
    runtimeGateReasons.push('Stall metriği yok');
  } else if (transitionStallRate > runtimeGateThresholds.maxTransitionStallRate) {
    runtimeGateReasons.push(
      `Stall ${formatPercentLabel(transitionStallRate)} > ${formatPercentLabel(runtimeGateThresholds.maxTransitionStallRate)}`
    );
  }
  if (transitionDropRate === null) {
    runtimeGateReasons.push('Drop metriği yok');
  } else if (transitionDropRate > runtimeGateThresholds.maxTransitionDropRate) {
    runtimeGateReasons.push(
      `Drop ${formatPercentLabel(transitionDropRate)} > ${formatPercentLabel(runtimeGateThresholds.maxTransitionDropRate)}`
    );
  }
  const runtimeGatePassed = runtimeGateReasons.length === 0;
  const runtimeGateSummary = runtimeGatePassed
    ? null
    : `${runtimeGateReasons.join(' | ')} | Aksiyon: real run orneklerini arttirip runtime kalibrasyonunu tekrar uygula.`;
  const minimumCoverageRate = clamp(
    input.minimumCoverageRate ?? BENCHMARK_MINIMUM_COVERAGE_DEFAULT,
    0,
    1
  );
  const runtimeSampleCount = transitionRuntimeSampleCount;
  const benchmarkMeta: BenchmarkRunMeta = {
    seedSetHash,
    scoringVersion: TRANSITION_SCORING_VERSION,
    analysisVersion: `v${ANALYSIS_VERSION}`,
    runMode,
    runtimeSampleCount,
  };

  const nextHitAt3 = labeledSeedCount === 0 ? null : safeDiv(hitAt3Total, labeledSeedCount);
  const nextHitAt5 = labeledSeedCount === 0 ? null : safeDiv(hitAt5Total, labeledSeedCount);
  const coverageRate = safeDiv(seedWithCandidates, seedTrackIds.length);
  const coverageGatePassed = coverageRate >= minimumCoverageRate;
  const previousComparableRun = [...baselineRunHistory]
    .reverse()
    .find((run) => run.scopeLabel === scopeLabel && run.scopeId === scopeId);
  if (previousComparableRun) {
    const mismatchReasons: string[] = [];
    if (previousComparableRun.seedSetHash !== seedSetHash) {
      mismatchReasons.push(`seedSetHash mismatch (${previousComparableRun.seedSetHash} != ${seedSetHash})`);
    }
    if (previousComparableRun.runMode !== runMode) {
      mismatchReasons.push(`runMode mismatch (${previousComparableRun.runMode} != ${runMode})`);
    }
    if (mismatchReasons.length > 0) {
      throw new Error(`Scope comparison mismatch for ${scopeId}: ${mismatchReasons.join(' | ')}`);
    }
  }

  const regressionReasons: string[] = [];
  if (
    previousComparableRun
    && previousComparableRun.hitAt3 !== null
    && previousComparableRun.hitAt5 !== null
  ) {
    if (nextHitAt3 !== null && nextHitAt3 < previousComparableRun.hitAt3) {
      regressionReasons.push(`Hit@3 ${formatPercentLabel(previousComparableRun.hitAt3)} -> ${formatPercentLabel(nextHitAt3)}`);
    }
    if (nextHitAt5 !== null && nextHitAt5 < previousComparableRun.hitAt5) {
      regressionReasons.push(`Hit@5 ${formatPercentLabel(previousComparableRun.hitAt5)} -> ${formatPercentLabel(nextHitAt5)}`);
    }
  }
  const tuningValidation = validateTuningActions(previousComparableRun, tuningActions, {
    meanTopKScore: safeDiv(topKMeanTotal, seedWithCandidates),
    hitAt3: nextHitAt3,
    hitAt5: nextHitAt5,
    regressionDetected: regressionReasons.length > 0,
    runtimeGatePassed,
  });
  const previousComparableRuns = baselineRunHistory
    .filter((run) => run.scopeLabel === scopeLabel && run.scopeId === scopeId)
    .slice(-2);
  const escalatedTuningActions = tuningActions.map((action) => {
    const appearsInAllRecentBottom3 = previousComparableRuns.length >= 2
      && previousComparableRuns.every((run) => run.bottomSeeds.some((seed) => seed.trackId === action.trackId));
    if (!appearsInAllRecentBottom3) return action;
    return {
      ...action,
      priority: 'high' as const,
      escalationReason: 'Bottom-3 seed son 3 benchmark kosusunda tekrarlandi.',
      recommendation: `${action.recommendation} Escalation: bu seed son 3 kosuda tekrar Bottom-3.`
    };
  });
  const benchmarkMergeGatePassed = regressionReasons.length === 0 && runtimeGatePassed && coverageGatePassed;
  const benchmarkMergeGateSummary = benchmarkMergeGatePassed
    ? null
    : [
      regressionReasons.length > 0
        ? `Regression gate fail: ${regressionReasons.join(' | ')}`
        : null,
      !runtimeGatePassed
        ? `Runtime gate fail: ${runtimeGateSummary ?? 'Runtime SLO degraded'}`
        : null,
      !coverageGatePassed
        ? `Coverage gate fail: ${formatPercentLabel(coverageRate)} < ${formatPercentLabel(minimumCoverageRate)}`
        : null,
    ].filter((item): item is string => item !== null).join(' || ');
  const relevanceTargetGatePassed = seedsBelowRelevantTargetMinimum.length === 0;
  const relevanceTargetGateSummary = relevanceTargetGatePassed
    ? null
    : `Seed basina en az ${requiredRelevantTargetsPerSeed} relevant hedef gerekli. Eksik: ${seedsBelowRelevantTargetMinimumDetails
      .map((item) => `${item.trackId} (${item.relevantTargetCount}/${requiredRelevantTargetsPerSeed}, +${item.missingTargetCount})`)
      .join(', ')}`;

  const result: BaselineEvaluationResult = {
    schemaVersion: BASELINE_RUN_SCHEMA_VERSION,
    analysisVersion: ANALYSIS_VERSION,
    scoringVersion: TRANSITION_SCORING_VERSION,
    seedSetHash,
    runMode,
    runtimeSampleCount,
    benchmarkMeta,
    scoreWeights: TRANSITION_SCORE_WEIGHTS,
    runAt: nowIsoString(),
    scopeLabel,
    scopeId,
    seedCount: seedTrackIds.length,
    seedWithCandidates,
    labeledSeedCount,
    coverageRate,
    meanTop1Score: safeDiv(top1Total, seedWithCandidates),
    meanTopKScore: safeDiv(topKMeanTotal, seedWithCandidates),
    goodCandidateRate: safeDiv(goodSeedCount, seedWithCandidates),
    hitAt3: labeledSeedCount === 0 ? null : safeDiv(hitAt3Total, labeledSeedCount),
    hitAt5: labeledSeedCount === 0 ? null : safeDiv(hitAt5Total, labeledSeedCount),
    bottomSeeds,
    tuningActions: escalatedTuningActions,
    tuningValidationSummary: tuningValidation.summary,
    tuningValidationPassed: tuningValidation.passed,
    tuningValidationGateEnforced,
    regressionDetected: regressionReasons.length > 0,
    regressionSummary: regressionReasons.length > 0 ? regressionReasons.join(' | ') : null,
    regressionGateEnforced,
    regressionGatePassed: !regressionGateEnforced || regressionReasons.length === 0,
    requiredRelevantTargetsPerSeed,
    relevanceTargetGateEnforced,
    relevanceTargetGatePassed,
    seedsBelowRelevantTargetMinimum,
    seedsBelowRelevantTargetMinimumDetails,
    relevanceTargetGateSummary,
    transitionRuntimeSampleCount,
    transitionLatencyP95Ms,
    transitionStallRate,
    transitionDropRate,
    averageDecisionConfidenceScore,
    fallbackTriggeredCount,
    manualQueueSuggestedCount,
    manualQueueAcceptedCount,
    autoTransitionDecisionSampleCount,
    autoTransitionSkippedCount,
    autoTransitionSkipRate,
    topAutoTransitionSkipReasons,
    autoTransitionSkipBySeed,
    runtimeGateEnforced,
    runtimeGatePassed,
    runtimeGateSummary,
    benchmarkMergeGateEnforced,
    benchmarkMergeGatePassed,
    benchmarkMergeGateSummary,
    minimumCoverageRate,
    coverageGatePassed,
    runtimeGateThresholds,
    limit,
    goodThreshold,
  };

  baselineRunHistory = [
    ...baselineRunHistory,
    {
      ...result,
      seedTrackIds,
    },
  ].slice(-100);
  persistStorage();

  if (result.regressionGateEnforced && !result.regressionGatePassed) {
    throw new Error(`Regression gate failed: ${result.regressionSummary ?? 'Hit@K degraded'}`);
  }
  if (result.relevanceTargetGateEnforced && !result.relevanceTargetGatePassed) {
    throw new Error(`Label quality gate failed: ${result.relevanceTargetGateSummary ?? 'Not enough relevant targets'}`);
  }
  if (result.tuningValidationGateEnforced && !result.tuningValidationPassed) {
    throw new Error(`Tuning validation failed: ${result.tuningValidationSummary ?? 'Top issue degraded'}`);
  }
  if (result.runtimeGateEnforced && !result.runtimeGatePassed) {
    throw new Error(`Runtime gate failed: ${result.runtimeGateSummary ?? 'Runtime SLO degraded'}`);
  }
  if (result.benchmarkMergeGateEnforced && !result.benchmarkMergeGatePassed) {
    throw new Error(`Benchmark merge gate failed: ${result.benchmarkMergeGateSummary ?? 'Regression/runtime gate failed'}`);
  }

  return result;
}

export async function buildBottomSeedDiagnosticBundle(input: {
  baselineResult: BaselineEvaluationResult;
  candidateLimit?: number;
}): Promise<BottomSeedDiagnosticBundle> {
  hydrateFromStorage();
  const baselineResult = input.baselineResult;
  const candidateLimit = Math.max(1, Math.min(10, Math.floor(input.candidateLimit ?? 5)));
  const diagnostics: BottomSeedDiagnostic[] = [];

  for (const seed of baselineResult.bottomSeeds.slice(0, 3)) {
    const candidates = await findTransitionCandidates({
      trackId: seed.trackId,
      limit: candidateLimit,
    });
    const action = baselineResult.tuningActions.find((item) => item.trackId === seed.trackId);
    diagnostics.push({
      trackId: seed.trackId,
      candidateBreakdown: candidates.map((candidate) => ({
        targetTrackId: candidate.targetTrackId,
        targetTimeMs: candidate.targetTimeMs,
        finalScore: candidate.score.finalScore,
        smoothnessScore: candidate.score.smoothnessScore,
        dominantDriver: candidate.diagnostic.primaryDriver,
        explainTopReasons: candidate.explain.topReasons,
        gateStatus: candidate.explain.gateStatus,
        skipReason: candidate.explain.skipReason,
      })),
      gateFailDistribution: action?.gateFailDistribution ?? [],
      recommendedActions: action ? [{
        issue: action.issue,
        recommendation: action.recommendation,
        confidence: action.confidence,
      }] : [],
    });
  }

  return {
    generatedAt: nowIsoString(),
    scopeId: baselineResult.scopeId,
    runMode: baselineResult.runMode,
    runtimeSampleCount: baselineResult.runtimeSampleCount,
    bottomSeedCount: diagnostics.length,
    diagnostics,
  };
}

function getScopedRuntimeEvents(seedTrackIds: string[] = []): TransitionRuntimeEvent[] {
  const normalizedSeedTrackIds = normalizeTrackIds(seedTrackIds);
  if (normalizedSeedTrackIds.length === 0) {
    return transitionRuntimeEvents
      .filter((event) => event.mode === 'auto')
      .slice(-200);
  }

  const seedSet = new Set(normalizedSeedTrackIds);
  return transitionRuntimeEvents
    .filter((event) =>
      event.mode === 'auto'
      && seedSet.has(event.sourceTrackId)
    )
    .slice(-200);
}

function computeRuntimeStats(events: TransitionRuntimeEvent[]): {
  sampleCount: number;
  latencyP95Ms: number | null;
  stallRate: number | null;
  dropRate: number | null;
} {
  const executionEvents = events.filter((event) => !event.skippedAutoTransition);
  const latencies = executionEvents
    .map((event) => event.latencyMs)
    .filter((latency) => Number.isFinite(latency));
  const sampleCount = latencies.length;
  const latencyP95Raw = computePercentile(latencies, 0.95);
  const latencyP95Ms = latencyP95Raw === null ? null : Math.max(0, Math.round(latencyP95Raw));

  const stallRate = sampleCount === 0
    ? null
    : executionEvents.filter((event) => event.stalled).length / sampleCount;
  const dropRate = sampleCount === 0
    ? null
    : executionEvents.filter((event) => event.dropped).length / sampleCount;

  return {
    sampleCount,
    latencyP95Ms,
    stallRate,
    dropRate,
  };
}

export function getRuntimeGateCalibration(
  input: RuntimeGateCalibrationInput = {}
): RuntimeGateCalibration {
  hydrateFromStorage();

  const minCalibrationSampleCount = Math.max(
    DEFAULT_RUNTIME_GATE_THRESHOLDS.minTransitionRuntimeSampleCount,
    Math.floor(input.minCalibrationSampleCount ?? 12)
  );
  const scopedRuntimeEvents = getScopedRuntimeEvents(input.seedTrackIds);
  const runtimeStats = computeRuntimeStats(scopedRuntimeEvents);
  const hasObservedStats = runtimeStats.latencyP95Ms !== null
    && runtimeStats.stallRate !== null
    && runtimeStats.dropRate !== null;
  const usedFallbackThresholds = runtimeStats.sampleCount < minCalibrationSampleCount || !hasObservedStats;

  const thresholds = usedFallbackThresholds
    ? { ...DEFAULT_RUNTIME_GATE_THRESHOLDS }
    : {
        minTransitionRuntimeSampleCount: clampInteger(
          Math.max(
            DEFAULT_RUNTIME_GATE_THRESHOLDS.minTransitionRuntimeSampleCount,
            runtimeStats.sampleCount * 0.4
          ),
          DEFAULT_RUNTIME_GATE_THRESHOLDS.minTransitionRuntimeSampleCount,
          30
        ),
        maxTransitionLatencyP95Ms: clampInteger(
          Math.max(
            DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionLatencyP95Ms * 0.8,
            (runtimeStats.latencyP95Ms ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionLatencyP95Ms) * 1.12
          ),
          1200,
          5000
        ),
        maxTransitionStallRate: clamp(
          Math.max(
            DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionStallRate * 0.75,
            (runtimeStats.stallRate ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionStallRate) + 0.05
          ),
          0.05,
          0.45
        ),
        maxTransitionDropRate: clamp(
          Math.max(
            DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionDropRate * 0.75,
            (runtimeStats.dropRate ?? DEFAULT_RUNTIME_GATE_THRESHOLDS.maxTransitionDropRate) + 0.04
          ),
          0.03,
          0.4
        ),
      };

  const summary = usedFallbackThresholds
    ? `Fallback esikler kullanildi (${runtimeStats.sampleCount}/${minCalibrationSampleCount} runtime ornek).`
    : `Kalibre edildi (${runtimeStats.sampleCount} ornek): p95<=${thresholds.maxTransitionLatencyP95Ms}ms stall<=${formatPercentLabel(thresholds.maxTransitionStallRate)} drop<=${formatPercentLabel(thresholds.maxTransitionDropRate)}.`;

  return {
    sampleCount: runtimeStats.sampleCount,
    observedLatencyP95Ms: runtimeStats.latencyP95Ms,
    observedStallRate: runtimeStats.stallRate,
    observedDropRate: runtimeStats.dropRate,
    usedFallbackThresholds,
    thresholds,
    summary,
  };
}

function computeDriftMetric(params: {
  key: RuntimeThresholdDriftMetric['key'];
  latestObserved: number | null;
  baselineObserved: number | null;
  threshold: number | null;
  stableToleranceRatio: number;
  degradingToleranceRatio: number;
}): RuntimeThresholdDriftMetric {
  const { key, latestObserved, baselineObserved, threshold, stableToleranceRatio, degradingToleranceRatio } = params;

  if (latestObserved === null || baselineObserved === null) {
    return {
      key,
      latestObserved,
      baselineObserved,
      driftRatio: null,
      threshold,
      thresholdHeadroom: threshold === null || latestObserved === null ? null : threshold - latestObserved,
      thresholdDeltaRatio:
        threshold === null || latestObserved === null || threshold === 0
          ? null
          : latestObserved / threshold - 1,
      status: 'unknown',
    };
  }

  const baselineDenominator = Math.max(Math.abs(baselineObserved), 0.0001);
  const driftRatio = (latestObserved - baselineObserved) / baselineDenominator;
  const thresholdHeadroom = threshold === null ? null : threshold - latestObserved;
  const thresholdDeltaRatio = threshold === null || threshold === 0
    ? null
    : latestObserved / threshold - 1;

  let status: RuntimeDriftStatus = 'stable';
  if (driftRatio <= -stableToleranceRatio) {
    status = 'improving';
  } else if (driftRatio >= degradingToleranceRatio) {
    status = 'degrading';
  }
  if (thresholdHeadroom !== null && thresholdHeadroom < 0) {
    status = 'degrading';
  }

  return {
    key,
    latestObserved,
    baselineObserved,
    driftRatio,
    threshold,
    thresholdHeadroom,
    thresholdDeltaRatio,
    status,
  };
}

function formatDriftMetric(metric: RuntimeThresholdDriftMetric): string {
  if (
    metric.latestObserved === null
    || metric.baselineObserved === null
    || metric.driftRatio === null
  ) {
    return `${metric.key}: NA`;
  }
  const trend = metric.driftRatio > 0 ? '+' : '';
  const driftLabel = `${trend}${Math.round(metric.driftRatio * 100)}%`;
  if (metric.key === 'latencyP95Ms') {
    return `p95 ${Math.round(metric.latestObserved)}ms (${driftLabel})`;
  }
  if (metric.key === 'stallRate') {
    return `stall ${formatPercentLabel(metric.latestObserved)} (${driftLabel})`;
  }
  return `drop ${formatPercentLabel(metric.latestObserved)} (${driftLabel})`;
}

export function buildRuntimeThresholdDriftReport(
  input: RuntimeThresholdDriftInput = {}
): RuntimeThresholdDriftReport | null {
  hydrateFromStorage();

  const scopeId = (input.scopeId ?? '').trim();
  const windowSize = Math.max(3, Math.min(30, Math.floor(input.windowSize ?? 8)));
  const stableToleranceRatio = clamp(input.stableToleranceRatio ?? 0.05, 0.01, 0.4);
  const degradingToleranceRatio = clamp(input.degradingToleranceRatio ?? 0.12, 0.02, 0.8);

  const scopedRuns = baselineRunHistory
    .filter((run) =>
      (scopeId.length === 0 || run.scopeId === scopeId)
      && run.transitionRuntimeSampleCount > 0
    )
    .slice(-windowSize);

  if (scopedRuns.length < 2) return null;

  const latestRun = scopedRuns[scopedRuns.length - 1];
  const previousRuns = scopedRuns.slice(0, -1);

  const computeAverageOf = (values: Array<number | null>): number | null => {
    const finiteValues = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (finiteValues.length === 0) return null;
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
  };

  const baselineLatency = computeAverageOf(previousRuns.map((run) => run.transitionLatencyP95Ms));
  const baselineStall = computeAverageOf(previousRuns.map((run) => run.transitionStallRate));
  const baselineDrop = computeAverageOf(previousRuns.map((run) => run.transitionDropRate));
  const latestThresholds = latestRun.runtimeGateThresholds;

  const metrics: RuntimeThresholdDriftMetric[] = [
    computeDriftMetric({
      key: 'latencyP95Ms',
      latestObserved: latestRun.transitionLatencyP95Ms,
      baselineObserved: baselineLatency,
      threshold: latestThresholds.maxTransitionLatencyP95Ms,
      stableToleranceRatio,
      degradingToleranceRatio,
    }),
    computeDriftMetric({
      key: 'stallRate',
      latestObserved: latestRun.transitionStallRate,
      baselineObserved: baselineStall,
      threshold: latestThresholds.maxTransitionStallRate,
      stableToleranceRatio,
      degradingToleranceRatio,
    }),
    computeDriftMetric({
      key: 'dropRate',
      latestObserved: latestRun.transitionDropRate,
      baselineObserved: baselineDrop,
      threshold: latestThresholds.maxTransitionDropRate,
      stableToleranceRatio,
      degradingToleranceRatio,
    }),
  ];

  const hasDegrading = metrics.some((metric) => metric.status === 'degrading');
  const hasImproving = metrics.some((metric) => metric.status === 'improving');
  const hasKnownMetrics = metrics.some((metric) => metric.status !== 'unknown');
  const overallStatus: RuntimeDriftStatus =
    !hasKnownMetrics
      ? 'unknown'
      : hasDegrading
        ? 'degrading'
        : hasImproving
          ? 'improving'
          : 'stable';

  const summary = `Runtime drift (${overallStatus}): ${metrics.map((metric) => formatDriftMetric(metric)).join(' | ')}`;

  return {
    generatedAt: nowIsoString(),
    scopeId: latestRun.scopeId,
    runCount: scopedRuns.length,
    windowSize,
    overallStatus,
    summary,
    metrics,
  };
}

export function computeBenchmarkSeedSetHash(seedTrackIds: string[]): string {
  return computeSeedSetHash(seedTrackIds);
}

export function getBaselineRunHistory(limit = 10): BaselineRunArtifact[] {
  hydrateFromStorage();
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  return baselineRunHistory.slice(-boundedLimit).reverse();
}

export function getTransitionFeedbackModel(): TransitionFeedbackModel {
  hydrateFromStorage();
  return JSON.parse(JSON.stringify(transitionFeedbackModel)) as TransitionFeedbackModel;
}

export function recordTransitionFeedback(
  input: Omit<TransitionFeedbackEntry, 'recordedAt'> & { recordedAt?: string }
): TransitionFeedbackPairStats {
  hydrateFromStorage();
  const sourceTrackId = normalizeTrackId(input.sourceTrackId);
  const targetTrackId = normalizeTrackId(input.targetTrackId);
  const rating = input.rating === 'good' || input.rating === 'ok' || input.rating === 'bad'
    ? input.rating
    : 'ok';
  const score = rating === 'good' ? 1 : rating === 'ok' ? 0.6 : 0.2;
  const pairKey = buildFeedbackPairKey(sourceTrackId, targetTrackId);
  const previous = transitionFeedbackModel.byPair[pairKey];
  const totalCount = (previous?.totalCount ?? 0) + 1;
  const goodCount = (previous?.goodCount ?? 0) + (rating === 'good' ? 1 : 0);
  const okCount = (previous?.okCount ?? 0) + (rating === 'ok' ? 1 : 0);
  const badCount = (previous?.badCount ?? 0) + (rating === 'bad' ? 1 : 0);
  const previousWeightedTotal = (previous?.meanScore ?? 0.5) * (previous?.totalCount ?? 0);
  const meanScore = clamp((previousWeightedTotal + score) / totalCount, 0, 1);
  const badStreak = rating === 'bad' ? (previous?.badStreak ?? 0) + 1 : 0;
  const now = input.recordedAt ?? nowIsoString();
  const nextPair: TransitionFeedbackPairStats = {
    pairKey,
    sourceTrackId,
    targetTrackId,
    totalCount,
    goodCount,
    okCount,
    badCount,
    meanScore,
    badStreak,
    updatedAt: now,
    ...(badStreak >= FEEDBACK_BAD_STREAK_BLACKLIST_THRESHOLD
      ? { blacklistUntil: new Date(Date.now() + FEEDBACK_BLACKLIST_TTL_MS).toISOString() }
      : previous?.blacklistUntil
        ? { blacklistUntil: previous.blacklistUntil }
        : {}),
  };
  if (nextPair.blacklistUntil) {
    const blacklistUntilMs = toUnixMs(nextPair.blacklistUntil);
    if (blacklistUntilMs !== null && Date.now() >= blacklistUntilMs) {
      delete nextPair.blacklistUntil;
    }
  }
  transitionFeedbackModel = {
    updatedAt: now,
    byPair: {
      ...transitionFeedbackModel.byPair,
      [pairKey]: nextPair,
    },
  };
  persistStorage();
  return nextPair;
}

export function recordTransitionRuntimeEvent(
  input: RecordTransitionRuntimeEventInput
): TransitionRuntimeEvent {
  hydrateFromStorage();
  const sourceTrackId = normalizeTrackId(input.sourceTrackId);
  const targetTrackId = normalizeTrackId(input.targetTrackId);
  const recordedAt = typeof input.recordedAt === 'string' && toUnixMs(input.recordedAt) !== null
    ? new Date(input.recordedAt).toISOString()
    : nowIsoString();
  const event: TransitionRuntimeEvent = {
    recordedAt,
    sourceTrackId,
    targetTrackId,
    latencyMs: Math.max(0, Math.round(toFiniteNumber(input.latencyMs, 0))),
    audibleReadyWaitMs:
      typeof input.audibleReadyWaitMs === 'number' && Number.isFinite(input.audibleReadyWaitMs)
        ? Math.max(0, Math.round(input.audibleReadyWaitMs))
        : undefined,
    recoverPlaybackWaitMs:
      typeof input.recoverPlaybackWaitMs === 'number' && Number.isFinite(input.recoverPlaybackWaitMs)
        ? Math.max(0, Math.round(input.recoverPlaybackWaitMs))
        : undefined,
    overlapAppliedMs:
      typeof input.overlapAppliedMs === 'number' && Number.isFinite(input.overlapAppliedMs)
        ? Math.max(0, Math.round(input.overlapAppliedMs))
        : undefined,
    sourceFadeOutMs:
      typeof input.sourceFadeOutMs === 'number' && Number.isFinite(input.sourceFadeOutMs)
        ? Math.max(0, Math.round(input.sourceFadeOutMs))
        : undefined,
    stalled: Boolean(input.stalled),
    dropped: Boolean(input.dropped),
    mode: input.mode === 'manual' ? 'manual' : 'auto',
    skippedAutoTransition: Boolean(input.skippedAutoTransition),
    skipReasons: parseTransitionGateReasons(input.skipReasons),
    confidenceScore: toOptionalFiniteRate(input.confidenceScore) ?? undefined,
    decisionReasonPrimary: parseTransitionGateReasons([input.decisionReasonPrimary])[0],
    fallbackTriggered: Boolean(input.fallbackTriggered),
    manualQueueSuggested: Boolean(input.manualQueueSuggested),
    manualAccepted: Boolean(input.manualAccepted),
  };
  transitionRuntimeEvents = [...transitionRuntimeEvents, event].slice(-500);
  persistStorage();
  return event;
}

export function getTransitionRuntimeEvents(limit = 50): TransitionRuntimeEvent[] {
  hydrateFromStorage();
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  return transitionRuntimeEvents.slice(-boundedLimit).reverse();
}

export function clearTransitionRuntimeEvents(): void {
  transitionRuntimeEvents = [];
  removeStorage(STORAGE_KEYS.runtimeEvents);
}

export function clearTransitionData(): void {
  analysisQueue = [];
  analysisStates = {};
  nodesByTrack = {};
  trackMetadataById = {};
  baselineRunHistory = [];
  transitionRuntimeEvents = [];
  transitionFeedbackModel = {
    updatedAt: nowIsoString(),
    byPair: {},
  };
  isStorageWriteDisabled = false;
  warnedStorageKeys.clear();
  isHydrated = false;

  removeStorage(STORAGE_KEYS.queue);
  removeStorage(STORAGE_KEYS.states);
  removeStorage(STORAGE_KEYS.nodes);
  removeStorage(STORAGE_KEYS.trackMetadata);
  removeStorage(STORAGE_KEYS.baselineRuns);
  removeStorage(STORAGE_KEYS.runtimeEvents);
  removeStorage(STORAGE_KEYS.feedbackModel);
}
