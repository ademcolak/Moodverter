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
    artifactPenalty: patch.artifactPenalty ?? 0.2,
    finalScore: patch.finalScore ?? 0.75,
  };
}

function makeCandidate(id: string, finalScore: number): TransitionCandidate {
  return {
    sourceTrackId: 'seed',
    sourceTimeMs: 120_000,
    sourceLoudnessRms: -12,
    targetTrackId: id,
    targetTimeMs: 65_000,
    targetLoudnessRms: -11,
    score: makeScore({ finalScore }),
    diagnostic: {
      primaryDriver: 'event',
      summary: 'fixture',
    },
    gatePreview: {
      wouldPassV3: true,
      reasons: [],
    },
  };
}

test('decideAutoTransition skips when top score is too low', () => {
  const decision = decideAutoTransition([makeCandidate('t1', 0.52)], {
    minTop1Score: 0.62,
  });
  assert.equal(decision.decision, 'skipped');
  assert.equal(decision.selectedCandidate, null);
  assert.ok(decision.gate.reasons.includes('LOW_SCORE'));
});

test('decideAutoTransition skips when top margin is too small', () => {
  const decision = decideAutoTransition(
    [makeCandidate('t1', 0.81), makeCandidate('t2', 0.78)],
    { minTop1Top2Margin: 0.05 }
  );
  assert.equal(decision.decision, 'skipped');
  assert.equal(decision.selectedCandidate, null);
  assert.ok(decision.gate.reasons.includes('LOW_MARGIN'));
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
