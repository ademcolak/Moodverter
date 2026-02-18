import test from 'node:test';
import assert from 'node:assert/strict';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';
import {
  addBenchmarkSeedTrackId,
  clearBenchmarkSeedTrackIds,
  getBenchmarkSeedTrackIds,
  removeBenchmarkSeedTrackId,
  setBenchmarkSeedTrackIds,
} from '../src/services/transition';

installBrowserMocks();

test.beforeEach(() => {
  resetBrowserMocks();
});

test('benchmark seed helpers persist unique normalized ids', () => {
  const first = setBenchmarkSeedTrackIds([' seed-1 ', 'seed-2', 'seed-1', '']);
  assert.deepEqual(first, ['seed-1', 'seed-2']);
  assert.deepEqual(getBenchmarkSeedTrackIds(), ['seed-1', 'seed-2']);

  const second = addBenchmarkSeedTrackId(' seed-3 ');
  assert.deepEqual(second, ['seed-1', 'seed-2', 'seed-3']);

  const third = removeBenchmarkSeedTrackId('seed-2');
  assert.deepEqual(third, ['seed-1', 'seed-3']);
});

test('benchmark seed helpers can clear storage', () => {
  setBenchmarkSeedTrackIds(['seed-a']);
  clearBenchmarkSeedTrackIds();
  assert.deepEqual(getBenchmarkSeedTrackIds(), []);
});
