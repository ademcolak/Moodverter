export type TransitionEventType =
  | 'scream-hit'
  | 'drop'
  | 'vocal-hit'
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
  artifactPenalty: number;
  finalScore: number;
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
}

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
  targetTrackId: string;
  targetTimeMs: number;
  targetLoudnessRms: number;
  score: TransitionEdgeScore;
  diagnostic: TransitionScoreDiagnostic;
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
}

export interface RecordTransitionRuntimeEventInput {
  sourceTrackId: string;
  targetTrackId: string;
  latencyMs: number;
  stalled?: boolean;
  dropped?: boolean;
  mode?: TransitionRuntimeMode;
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
  averageArtifactPenalty: number;
  dominantDriver: TransitionScoreDriver | null;
}

export interface BaselineTuningAction {
  trackId: string;
  issue: TransitionScoreDriver;
  recommendation: string;
  confidence: number;
}

export interface BaselineEvaluationResult {
  schemaVersion: number;
  analysisVersion: number;
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
  relevanceTargetGateSummary: string | null;
  transitionRuntimeSampleCount: number;
  transitionLatencyP95Ms: number | null;
  transitionStallRate: number | null;
  transitionDropRate: number | null;
  limit: number;
  goodThreshold: number;
}

export interface BaselineRunArtifact extends BaselineEvaluationResult {
  seedTrackIds: string[];
}
