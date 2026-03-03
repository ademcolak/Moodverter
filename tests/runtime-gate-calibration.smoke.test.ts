import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  clearTransitionData,
  getRuntimeGateCalibration,
  recordTransitionRuntimeEvent,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
});

test('getRuntimeGateCalibration returns fallback thresholds when samples are insufficient', () => {
  recordTransitionRuntimeEvent({
    sourceTrackId: 'seed-1',
    targetTrackId: 'target-1',
    latencyMs: 1400,
    stalled: false,
    dropped: false,
    mode: 'auto',
  });

  const calibration = getRuntimeGateCalibration({
    seedTrackIds: ['seed-1'],
    minCalibrationSampleCount: 6,
  });

  assert.equal(calibration.usedFallbackThresholds, true);
  assert.equal(calibration.thresholds.minTransitionRuntimeSampleCount, 10);
  assert.equal(calibration.thresholds.maxTransitionLatencyP95Ms, 2200);
  assert.match(calibration.summary, /Fallback esikler kullanildi/);
});

test('getRuntimeGateCalibration calibrates thresholds from scoped runtime samples', () => {
  for (let index = 0; index < 16; index += 1) {
    recordTransitionRuntimeEvent({
      sourceTrackId: 'seed-a',
      targetTrackId: `target-${index}`,
      latencyMs: 1000 + index * 30,
      stalled: index % 8 === 0,
      dropped: index % 10 === 0,
      mode: 'auto',
    });
  }

  for (let index = 0; index < 6; index += 1) {
    recordTransitionRuntimeEvent({
      sourceTrackId: 'seed-b',
      targetTrackId: `other-${index}`,
      latencyMs: 2600,
      stalled: true,
      dropped: true,
      mode: 'auto',
    });
  }

  const calibration = getRuntimeGateCalibration({
    seedTrackIds: ['seed-a'],
    minCalibrationSampleCount: 12,
  });

  assert.equal(calibration.usedFallbackThresholds, false);
  assert.equal(calibration.sampleCount, 16);
  assert.ok(calibration.observedLatencyP95Ms !== null && calibration.observedLatencyP95Ms >= 1300);
  assert.ok(calibration.thresholds.maxTransitionLatencyP95Ms >= 1200);
  assert.ok(calibration.thresholds.maxTransitionLatencyP95Ms <= 5000);
  assert.ok(calibration.thresholds.maxTransitionStallRate >= 0.05);
  assert.ok(calibration.thresholds.maxTransitionDropRate >= 0.03);
  assert.match(calibration.summary, /Kalibre edildi/);
});
