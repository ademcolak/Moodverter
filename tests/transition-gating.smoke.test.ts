import assert from 'node:assert/strict';
import test from 'node:test';
import type { TransitionNode } from '../src/services/transition';
import { applyHardGate } from '../src/services/transition';

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

test('applyHardGate fails on event mismatch', () => {
  const source = makeNode({ eventType: 'scream-hit', eventConfidence: 0.9 });
  const target = makeNode({ eventType: 'silence-break', eventConfidence: 0.9 });
  const gate = applyHardGate(source, target);
  assert.equal(gate.passed, false);
  assert.ok(gate.reasons.includes('EVENT_MISMATCH'));
});

test('applyHardGate fails on tempo/key/loudness mismatch', () => {
  const source = makeNode({
    eventType: 'drop',
    eventConfidence: 0.95,
    bpmLocal: 90,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -8,
  });
  const target = makeNode({
    eventType: 'drop',
    eventConfidence: 0.95,
    bpmLocal: 250,
    chroma: [0, 0, 0, 0, 0, 0, 1, ...Array.from({ length: 5 }, () => 0)],
    loudnessRms: -24,
  });

  const gate = applyHardGate(source, target, {
    maxTempoRatioDistance: 0.2,
    maxKeyDistanceClass: 2,
    maxLoudnessJumpDb: 8,
  });
  assert.equal(gate.passed, false);
  assert.ok(gate.reasons.includes('TEMPO_OUT_OF_RANGE'));
  assert.ok(gate.reasons.includes('KEY_DISTANCE_HIGH'));
  assert.ok(gate.reasons.includes('LOUDNESS_JUMP_HIGH'));
});

test('applyHardGate passes on compatible transition', () => {
  const source = makeNode({
    eventType: 'vocal-hit',
    eventConfidence: 0.8,
    bpmLocal: 124,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -11,
  });
  const target = makeNode({
    eventType: 'vocal-hit',
    eventConfidence: 0.82,
    bpmLocal: 126,
    chroma: [1, ...Array.from({ length: 11 }, () => 0)],
    loudnessRms: -10,
  });
  const gate = applyHardGate(source, target);
  assert.equal(gate.passed, true);
  assert.deepEqual(gate.reasons, []);
});
