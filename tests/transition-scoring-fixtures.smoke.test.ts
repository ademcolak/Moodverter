import assert from 'node:assert/strict';
import test from 'node:test';
import type { TransitionNode } from '../src/services/transition';
import {
  TRANSITION_SCORING_VERSION,
  TRANSITION_SCORE_WEIGHTS,
  explainTransitionPair,
  scoreTransitionPair,
} from '../src/services/transition';

function nearlyEqual(actual: number, expected: number, epsilon = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `Expected ${actual} to be within ${epsilon} of ${expected}`
  );
}

function makeNode(patch: Partial<TransitionNode>): TransitionNode {
  return {
    id: patch.id ?? 'node',
    trackId: patch.trackId ?? 'track',
    timeMs: patch.timeMs ?? 0,
    eventType: patch.eventType ?? 'other',
    eventConfidence: patch.eventConfidence ?? 1,
    embedding: patch.embedding ?? Array.from({ length: 16 }, () => 0),
    bpmLocal: patch.bpmLocal ?? 120,
    chroma: patch.chroma ?? Array.from({ length: 12 }, () => 0),
    loudnessRms: patch.loudnessRms ?? -12,
  };
}

test('scoring fixture A: perfect alignment produces max score and event driver', () => {
  const source = makeNode({
    id: 'a-source',
    trackId: 'a',
    eventType: 'vocal-hit',
    eventConfidence: 1,
    embedding: [1, ...Array.from({ length: 15 }, () => 0)],
    bpmLocal: 128,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -9,
  });
  const target = makeNode({
    id: 'a-target',
    trackId: 'b',
    eventType: 'vocal-hit',
    eventConfidence: 1,
    embedding: [1, ...Array.from({ length: 15 }, () => 0)],
    bpmLocal: 128,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -9,
  });

  const score = scoreTransitionPair(source, target);
  const diagnostic = explainTransitionPair(source, target);

  nearlyEqual(score.eventMatchScore, 1);
  nearlyEqual(score.embeddingSimilarity, 1);
  nearlyEqual(score.rhythmAlignmentScore, 1);
  nearlyEqual(score.loudnessContinuityScore, 1);
  nearlyEqual(score.artifactPenalty, 0);
  nearlyEqual(score.finalScore, 1);
  assert.equal(diagnostic.primaryDriver, 'event');
});

test('scoring fixture B: harsh mismatch clamps final score to zero and penalty dominates', () => {
  const source = makeNode({
    id: 'b-source',
    trackId: 'b1',
    eventType: 'scream-hit',
    eventConfidence: 0.2,
    embedding: [1, ...Array.from({ length: 15 }, () => 0)],
    bpmLocal: 100,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -8,
  });
  const target = makeNode({
    id: 'b-target',
    trackId: 'b2',
    eventType: 'silence-break',
    eventConfidence: 0.4,
    embedding: [-1, ...Array.from({ length: 15 }, () => 0)],
    bpmLocal: 180,
    chroma: [-1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -48,
  });

  const score = scoreTransitionPair(source, target);
  const diagnostic = explainTransitionPair(source, target);

  nearlyEqual(score.eventMatchScore, 0.05);
  nearlyEqual(score.embeddingSimilarity, 0);
  nearlyEqual(score.rhythmAlignmentScore, 0);
  nearlyEqual(score.loudnessContinuityScore, 0);
  nearlyEqual(score.artifactPenalty, 1);
  nearlyEqual(score.finalScore, 0);
  assert.equal(diagnostic.primaryDriver, 'penalty');
});

test('scoring fixture C: sanitization clamps confidence and unknown event falls back to other', () => {
  const source = makeNode({
    id: 'c-source',
    trackId: '',
    eventType: 'unknown-event' as TransitionNode['eventType'],
    eventConfidence: 1.2,
    embedding: Array.from({ length: 16 }, () => 0),
    bpmLocal: 120,
    chroma: Array.from({ length: 12 }, () => 0),
    loudnessRms: -12,
  });
  const target = makeNode({
    id: 'c-target',
    trackId: '',
    eventType: 'drop',
    eventConfidence: 0.8,
    embedding: Array.from({ length: 16 }, () => 0),
    bpmLocal: 140,
    chroma: Array.from({ length: 12 }, () => 0),
    loudnessRms: -24,
  });

  const score = scoreTransitionPair(source, target);
  const diagnostic = explainTransitionPair(source, target);

  nearlyEqual(score.eventMatchScore, 0.2);
  nearlyEqual(score.embeddingSimilarity, 0);
  nearlyEqual(score.rhythmAlignmentScore, 0.3);
  nearlyEqual(score.loudnessContinuityScore, 0.5);
  nearlyEqual(score.artifactPenalty, 7 / 24);
  nearlyEqual(score.finalScore, 317 / 2400);
  assert.equal(diagnostic.primaryDriver, 'loudness');
});

test('scoring version and weights are fixed for v1 minispec fixtures', () => {
  assert.equal(TRANSITION_SCORING_VERSION, 'v1');
  assert.deepEqual(TRANSITION_SCORE_WEIGHTS, {
    eventMatch: 0.35,
    embedding: 0.3,
    rhythm: 0.2,
    loudness: 0.15,
    artifactPenalty: 0.25,
  });
});
