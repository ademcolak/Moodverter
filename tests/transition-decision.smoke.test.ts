import assert from 'node:assert/strict';
import test from 'node:test';
import type { TransitionCandidate, TransitionEdgeScore } from '../src/services/transition';
import { decideAutoTransition } from '../src/services/transition';

function makeScore(patch: Partial<TransitionEdgeScore>): TransitionEdgeScore {
  return {
    eventMatchScore: patch.eventMatchScore ?? 0.8,
    embeddingSimilarity: patch.embeddingSimilarity ?? 0.8,
    tempoRatioScore: patch.tempoRatioScore ?? 0.8,
    harmonicCompatibilityScore: patch.harmonicCompatibilityScore ?? 0.8,
    rhythmAlignmentScore: patch.rhythmAlignmentScore ?? 0.8,
    loudnessContinuityScore: patch.loudnessContinuityScore ?? 0.8,
    smoothnessScore: patch.smoothnessScore ?? 0.8,
    artifactPenalty: patch.artifactPenalty ?? 0.2,
    finalScore: patch.finalScore ?? 0.75,
  };
}

function makeCandidate(
  id: string,
  finalScore: number,
  patch: Partial<TransitionCandidate> = {}
): TransitionCandidate {
  return {
    sourceTrackId: 'seed',
    sourceTimeMs: 120_000,
    sourceLoudnessRms: -12,
    sourceEventType: 'vocal-hit',
    targetTrackId: id,
    targetTimeMs: 65_000,
    targetLoudnessRms: -11,
    targetEventType: 'vocal-hit',
    confidenceScore: 0.8,
    diversityPenalty: 0,
    learningBias: 0,
    score: makeScore({ finalScore, ...(patch.score ?? {}) }),
    diagnostic: {
      primaryDriver: 'event',
      summary: 'fixture',
    },
    explain: {
      topReasons: ['fixture'],
      gateStatus: 'pass',
    },
    gatePreview: {
      wouldPassV3: true,
      reasons: [],
    },
    ...patch,
  };
}

test('decideAutoTransition skips when top score is too low', () => {
  const decision = decideAutoTransition([makeCandidate('t1', 0.52)], {
    minTop1Score: 0.62,
  });
  assert.equal(decision.decision, 'skipped');
  assert.equal(decision.selectedCandidate, null);
  assert.ok(decision.gate.reasons.includes('LOW_SCORE'));
  assert.ok(decision.gate.reasons.includes('LOW_CONFIDENCE_FALLBACK'));
});

test('decideAutoTransition skips when top margin is too small', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.81), makeCandidate('t2', 0.78)],
    { minTop1Top2Margin: 0.05 }
  );
  assert.equal(decision.decision, 'skipped');
  assert.equal(decision.selectedCandidate, null);
  assert.ok(decision.gate.reasons.includes('LOW_MARGIN'));
  assert.ok(decision.gate.reasons.includes('LOW_CONFIDENCE_FALLBACK'));
});

test('decideAutoTransition standardizes no-candidate reason taxonomy', () => {
  const decision = decideAutoTransition([]);
  assert.equal(decision.decision, 'skipped');
  assert.deepEqual(decision.gate.reasons, ['NO_CANDIDATE']);
});

test('decideAutoTransition selects candidate when score and margin are healthy', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.86), makeCandidate('t2', 0.72)],
    {
      minTop1Score: 0.62,
      minTop1Top2Margin: 0.06,
      maxArtifactPenalty: 0.58,
    }
  );
  assert.equal(decision.decision, 'selected');
  assert.equal(decision.selectedCandidate?.targetTrackId, 't1');
  assert.equal(decision.gate.passed, true);
});

test('decision matrix: low confidence fallback suggests manual queue by default', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.76)],
    {
      minTop1Score: 0.6,
      minTop1Top2Margin: 0.05,
      confidenceThreshold: 0.99,
      fallbackOnLowConfidence: true,
      manualQueueOnLowConfidence: true,
    }
  );
  assert.equal(decision.decision, 'skipped');
  assert.ok(decision.gate.reasons.includes('LOW_CONFIDENCE_FALLBACK'));
  assert.ok(decision.gate.reasons.includes('MANUAL_QUEUE_SUGGESTED'));
  assert.equal(decision.manualQueueCandidate?.targetTrackId, 't1');
});

test('decision matrix: low confidence fallback can disable manual queue', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.76)],
    {
      minTop1Score: 0.6,
      minTop1Top2Margin: 0.05,
      confidenceThreshold: 0.99,
      fallbackOnLowConfidence: true,
      manualQueueOnLowConfidence: false,
    }
  );
  assert.equal(decision.decision, 'skipped');
  assert.ok(decision.gate.reasons.includes('LOW_CONFIDENCE_FALLBACK'));
  assert.ok(!decision.gate.reasons.includes('MANUAL_QUEUE_SUGGESTED'));
  assert.equal(decision.manualQueueCandidate, null);
});

test('decision matrix: duplicate cluster reason is emitted for high diversity penalty', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.82, { diversityPenalty: 0.71 })],
    {
      minTop1Score: 0.6,
      minTop1Top2Margin: 0.05,
      confidenceThreshold: 0.58,
      fallbackOnLowConfidence: true,
    }
  );
  assert.equal(decision.decision, 'skipped');
  assert.ok(decision.gate.reasons.includes('DUPLICATE_CLUSTER'));
});
