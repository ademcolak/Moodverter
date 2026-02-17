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
  targetTrackId: string;
  targetTimeMs: number;
  score: TransitionEdgeScore;
  diagnostic: TransitionScoreDiagnostic;
}

export interface BaselineEvaluationInput {
  seedTrackIds?: string[];
  limit?: number;
  goodThreshold?: number;
  relevantTargetsBySeed?: Record<string, string[]>;
  scopeLabel?: BaselineScopeLabel;
  enforceRegressionGate?: boolean;
  requiredRelevantTargetsPerSeed?: number;
  enforceRelevantTargetMinimum?: boolean;
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
}

export interface BaselineEvaluationResult {
  runAt: string;
  scopeLabel: BaselineScopeLabel;
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
  regressionDetected: boolean;
  regressionSummary: string | null;
  regressionGateEnforced: boolean;
  regressionGatePassed: boolean;
  requiredRelevantTargetsPerSeed: number;
  relevanceTargetGateEnforced: boolean;
  relevanceTargetGatePassed: boolean;
  seedsBelowRelevantTargetMinimum: string[];
  relevanceTargetGateSummary: string | null;
  limit: number;
  goodThreshold: number;
}

export interface BaselineRunArtifact extends BaselineEvaluationResult {
  seedTrackIds: string[];
}
