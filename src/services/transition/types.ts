export type TransitionEventType =
  | 'scream-hit'
  | 'drop'
  | 'vocal-hit'
  | 'build-up'
  | 'bass-hit'
  | 'silence-break'
  | 'percussive-hit'
  | 'other';

export interface TransitionNode {
  id: string;
  trackId: string;
  timeMs: number;
  eventType: TransitionEventType;
  eventConfidence: number;
  embedding: number[];
  bpmLocal: number;
  chroma: number[];
  loudnessRms: number;
}

export interface TransitionEdgeScore {
  eventMatchScore: number;
  embeddingSimilarity: number;
  tempoRatioScore: number;
  harmonicCompatibilityScore: number;
  rhythmAlignmentScore: number;
  loudnessContinuityScore: number;
  smoothnessScore: number;
  artifactPenalty: number;
  finalScore: number;
}

export type TransitionMatchPolicyVersion = 'v2' | 'v3';

export type TransitionGateReason =
  | 'NO_CANDIDATE'
  | 'DUPLICATE_CLUSTER'
  | 'LOW_CONFIDENCE_FALLBACK'
  | 'HIGH_ARTIFACT_RISK'
  | 'MANUAL_QUEUE_SUGGESTED'
  | 'EVENT_MISMATCH'
  | 'LOW_EVENT_CONFIDENCE'
  | 'TEMPO_OUT_OF_RANGE'
  | 'KEY_DISTANCE_HIGH'
  | 'LOUDNESS_JUMP_HIGH'
  | 'LOW_SCORE'
  | 'LOW_MARGIN';

export interface TransitionGateResult {
  passed: boolean;
  reasons: TransitionGateReason[];
}

export interface AutoTransitionDecisionConfig {
  minTop1Score: number;
  minTop1Top2Margin: number;
  maxArtifactPenalty: number;
  confidenceThreshold: number;
  fallbackOnLowConfidence: boolean;
  manualQueueOnLowConfidence: boolean;
}

export interface HardGateConfig {
  minEventConfidence: number;
  maxTempoRatioDistance: number;
  maxKeyDistanceClass: number;
  maxLoudnessJumpDb: number;
}

export interface TransitionDecision {
  selectedCandidate: TransitionCandidate | null;
  manualQueueCandidate: TransitionCandidate | null;
  decision: 'selected' | 'skipped';
  gate: TransitionGateResult;
  top1Score: number | null;
  top1Top2Margin: number | null;
  confidenceScore: number | null;
}

export type BenchmarkRunMode = 'synthetic' | 'real';

export interface BenchmarkRunMeta {
  seedSetHash: string;
  scoringVersion: string;
  analysisVersion: string;
  runMode: BenchmarkRunMode;
  runtimeSampleCount: number;
}

export interface TransitionDecisionExplain {
  topReasons: string[];
  gateStatus: 'pass' | 'fail';
  skipReason?: string;
}

export type AnalysisStatus = 'pending' | 'ready' | 'failed';

export interface AnalysisState {
  trackId: string;
  status: AnalysisStatus;
  updatedAt: string;
  version: number;
  errorMessage?: string;
}

export interface FindTransitionCandidatesInput {
  trackId: string;
  sourceTimeMs?: number;
  limit?: number;
  excludeTargetTrackIds?: string[];
  seedTrackPerformanceTier?: TransitionPerformanceTier;
}

export type TransitionPerformanceTier = 'high' | 'mid' | 'low';

export type TransitionScoreDriver =
  | 'event'
  | 'embedding'
  | 'rhythm'
  | 'loudness'
  | 'penalty';

export interface TransitionScoreDiagnostic {
  primaryDriver: TransitionScoreDriver;
  summary: string;
}

export interface TransitionCandidate {
  sourceTrackId: string;
  sourceTimeMs: number;
  sourceLoudnessRms: number;
  sourceEventType: TransitionEventType;
  targetTrackId: string;
  targetTimeMs: number;
  targetLoudnessRms: number;
  targetEventType: TransitionEventType;
  confidenceScore: number;
  diversityPenalty: number;
  learningBias: number;
  score: TransitionEdgeScore;
  diagnostic: TransitionScoreDiagnostic;
  explain: TransitionDecisionExplain;
  gatePreview?: {
    wouldPassV3: boolean;
    reasons: TransitionGateReason[];
  };
}

export type TransitionRuntimeMode = 'auto' | 'manual';

export interface TransitionRuntimeEvent {
  recordedAt: string;
  sourceTrackId: string;
  targetTrackId: string;
  latencyMs: number;
  stalled: boolean;
  dropped: boolean;
  mode: TransitionRuntimeMode;
  skippedAutoTransition?: boolean;
  skipReasons?: TransitionGateReason[];
  confidenceScore?: number;
  decisionReasonPrimary?: TransitionGateReason;
  fallbackTriggered?: boolean;
  manualQueueSuggested?: boolean;
  manualAccepted?: boolean;
}

export interface RecordTransitionRuntimeEventInput {
  sourceTrackId: string;
  targetTrackId: string;
  latencyMs: number;
  stalled?: boolean;
  dropped?: boolean;
  mode?: TransitionRuntimeMode;
  skippedAutoTransition?: boolean;
  skipReasons?: TransitionGateReason[];
  confidenceScore?: number;
  decisionReasonPrimary?: TransitionGateReason;
  fallbackTriggered?: boolean;
  manualQueueSuggested?: boolean;
  manualAccepted?: boolean;
}

export interface TransitionFeedbackEntry {
  recordedAt: string;
  sourceTrackId: string;
  targetTrackId: string;
  rating: 'good' | 'ok' | 'bad';
}

export interface TransitionFeedbackPairStats {
  pairKey: string;
  sourceTrackId: string;
  targetTrackId: string;
  totalCount: number;
  goodCount: number;
  okCount: number;
  badCount: number;
  meanScore: number;
  badStreak: number;
  updatedAt: string;
  blacklistUntil?: string;
}

export interface TransitionFeedbackModel {
  updatedAt: string;
  byPair: Record<string, TransitionFeedbackPairStats>;
}

export interface RuntimeGateThresholds {
  minTransitionRuntimeSampleCount: number;
  maxTransitionLatencyP95Ms: number;
  maxTransitionStallRate: number;
  maxTransitionDropRate: number;
}

export interface RuntimeGateCalibrationInput {
  seedTrackIds?: string[];
  minCalibrationSampleCount?: number;
}

export interface RuntimeGateCalibration {
  sampleCount: number;
  observedLatencyP95Ms: number | null;
  observedStallRate: number | null;
  observedDropRate: number | null;
  usedFallbackThresholds: boolean;
  thresholds: RuntimeGateThresholds;
  summary: string;
}

export interface RuntimeThresholdDriftInput {
  scopeId?: string;
  windowSize?: number;
  stableToleranceRatio?: number;
  degradingToleranceRatio?: number;
}

export type RuntimeDriftStatus = 'improving' | 'stable' | 'degrading' | 'unknown';

export interface RuntimeThresholdDriftMetric {
  key: 'latencyP95Ms' | 'stallRate' | 'dropRate';
  latestObserved: number | null;
  baselineObserved: number | null;
  driftRatio: number | null;
  threshold: number | null;
  thresholdHeadroom: number | null;
  thresholdDeltaRatio: number | null;
  status: RuntimeDriftStatus;
}

export interface RuntimeThresholdDriftReport {
  generatedAt: string;
  scopeId: string;
  runCount: number;
  windowSize: number;
  overallStatus: RuntimeDriftStatus;
  summary: string;
  metrics: RuntimeThresholdDriftMetric[];
}

export interface TransitionScoreWeights {
  eventMatch: number;
  embedding: number;
  rhythm: number;
  loudness: number;
  artifactPenalty: number;
}

export interface BaselineEvaluationInput {
  seedTrackIds?: string[];
  limit?: number;
  goodThreshold?: number;
  relevantTargetsBySeed?: Record<string, string[]>;
  scopeLabel?: BaselineScopeLabel;
  scopeId?: string;
  enforceRegressionGate?: boolean;
  requiredRelevantTargetsPerSeed?: number;
  enforceRelevantTargetMinimum?: boolean;
  enforceTuningValidationGate?: boolean;
  enforceRuntimeGate?: boolean;
  enforceBenchmarkMergeGate?: boolean;
  minimumCoverageRate?: number;
  runMode?: BenchmarkRunMode;
  minTransitionRuntimeSampleCount?: number;
  maxTransitionLatencyP95Ms?: number;
  maxTransitionStallRate?: number;
  maxTransitionDropRate?: number;
}

export type BaselineScopeLabel = 'selected' | 'all' | 'custom';

export interface BaselineSeedReport {
  trackId: string;
  candidateCount: number;
  top1Score: number;
  meanTopKScore: number;
  hasGoodCandidate: boolean;
  hitAt3: number | null;
  hitAt5: number | null;
  averageEventMatchScore: number;
  averageEmbeddingSimilarity: number;
  averageTempoRatioScore: number;
  averageHarmonicCompatibilityScore: number;
  averageRhythmAlignmentScore: number;
  averageLoudnessContinuityScore: number;
  averageSmoothnessScore: number;
  averageArtifactPenalty: number;
  dominantDriver: TransitionScoreDriver | null;
}

export interface BaselineTuningAction {
  trackId: string;
  issue: TransitionScoreDriver;
  recommendation: string;
  confidence: number;
  priority: 'normal' | 'high';
  escalationReason: string | null;
  gateFailSampleCount: number;
  gateFailDistribution: Array<{
    reason: TransitionGateReason;
    count: number;
    rate: number;
  }>;
}

export interface SeedRelevantTargetGap {
  trackId: string;
  relevantTargetCount: number;
  missingTargetCount: number;
}

export interface TransitionSkipReasonBreakdown {
  reason: TransitionGateReason;
  count: number;
  rate: number;
}

export interface AutoTransitionSeedSkipSummary {
  trackId: string;
  decisionSampleCount: number;
  skippedCount: number;
  skipRate: number | null;
  topSkipReasons: TransitionSkipReasonBreakdown[];
}

export interface BottomSeedDiagnostic {
  trackId: string;
  candidateBreakdown: Array<{
    targetTrackId: string;
    targetTimeMs: number;
    finalScore: number;
    smoothnessScore: number;
    dominantDriver: TransitionScoreDriver;
    explainTopReasons: string[];
    gateStatus: 'pass' | 'fail';
    skipReason?: string;
  }>;
  gateFailDistribution: Array<{
    reason: TransitionGateReason;
    count: number;
    rate: number;
  }>;
  recommendedActions: Array<{
    issue: TransitionScoreDriver;
    recommendation: string;
    confidence: number;
  }>;
}

export interface BottomSeedDiagnosticBundle {
  generatedAt: string;
  scopeId: string;
  runMode: BenchmarkRunMode;
  runtimeSampleCount: number;
  bottomSeedCount: number;
  diagnostics: BottomSeedDiagnostic[];
}

export interface BaselineEvaluationResult {
  schemaVersion: number;
  analysisVersion: number;
  scoringVersion: string;
  seedSetHash: string;
  runMode: BenchmarkRunMode;
  runtimeSampleCount: number;
  benchmarkMeta: BenchmarkRunMeta;
  scoreWeights: TransitionScoreWeights;
  runAt: string;
  scopeLabel: BaselineScopeLabel;
  scopeId: string;
  seedCount: number;
  seedWithCandidates: number;
  labeledSeedCount: number;
  coverageRate: number;
  meanTop1Score: number;
  meanTopKScore: number;
  goodCandidateRate: number;
  hitAt3: number | null;
  hitAt5: number | null;
  bottomSeeds: BaselineSeedReport[];
  tuningActions: BaselineTuningAction[];
  tuningValidationSummary: string | null;
  tuningValidationPassed: boolean;
  tuningValidationGateEnforced: boolean;
  regressionDetected: boolean;
  regressionSummary: string | null;
  regressionGateEnforced: boolean;
  regressionGatePassed: boolean;
  requiredRelevantTargetsPerSeed: number;
  relevanceTargetGateEnforced: boolean;
  relevanceTargetGatePassed: boolean;
  seedsBelowRelevantTargetMinimum: string[];
  seedsBelowRelevantTargetMinimumDetails: SeedRelevantTargetGap[];
  relevanceTargetGateSummary: string | null;
  transitionRuntimeSampleCount: number;
  transitionLatencyP95Ms: number | null;
  transitionStallRate: number | null;
  transitionDropRate: number | null;
  averageDecisionConfidenceScore: number | null;
  fallbackTriggeredCount: number;
  manualQueueSuggestedCount: number;
  manualQueueAcceptedCount: number;
  autoTransitionDecisionSampleCount: number;
  autoTransitionSkippedCount: number;
  autoTransitionSkipRate: number | null;
  topAutoTransitionSkipReasons: TransitionGateReason[];
  autoTransitionSkipBySeed: AutoTransitionSeedSkipSummary[];
  runtimeGateEnforced: boolean;
  runtimeGatePassed: boolean;
  runtimeGateSummary: string | null;
  benchmarkMergeGateEnforced: boolean;
  benchmarkMergeGatePassed: boolean;
  benchmarkMergeGateSummary: string | null;
  minimumCoverageRate: number;
  coverageGatePassed: boolean;
  runtimeGateThresholds: RuntimeGateThresholds;
  limit: number;
  goodThreshold: number;
}

export interface BaselineRunArtifact extends BaselineEvaluationResult {
  seedTrackIds: string[];
}
