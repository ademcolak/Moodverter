import assert from 'node:assert/strict';
import test, { before, beforeEach } from 'node:test';
import {
  analyzeTrackWithHeuristicV1,
  clearTransitionData,
  evaluateRetrievalQuality,
  getAnalyzedNodes,
  type RetrievalEntry,
} from '../src/services/transition';
import { installBrowserMocks, resetBrowserMocks } from './helpers/browser-mocks';

function buildDeterministicEntries(size: number, dims: number): RetrievalEntry[] {
  let state = 1337;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  const entries: RetrievalEntry[] = [];
  for (let id = 0; id < size; id += 1) {
    const vector = Array.from({ length: dims }, () => next() * 2 - 1);
    entries.push({ id, vector });
  }
  return entries;
}

before(() => {
  installBrowserMocks();
});

beforeEach(() => {
  resetBrowserMocks();
  clearTransitionData();
});

test('evaluateRetrievalQuality reports high recall/top1 on deterministic vectors', async () => {
  const entries = buildDeterministicEntries(128, 24);
  const queries = entries.slice(0, 32).map((entry) => ({
    vector: [...entry.vector],
  }));

  const report = await evaluateRetrievalQuality({
    entries,
    queries,
    limit: 10,
  });

  assert.equal(report.queryCount, 32);
  assert.equal(report.evaluatedQueryCount, 32);
  assert.equal(report.skippedQueryCount, 0);
  assert.ok(report.recallAtK >= 0.95);
  assert.ok(report.exactTop1Rate >= 0.9);
  assert.ok(report.uniqueTargetRatio > 0);
});

test('evaluateRetrievalQuality skips invalid query vectors', async () => {
  const entries = buildDeterministicEntries(64, 16);
  const report = await evaluateRetrievalQuality({
    entries,
    queries: [
      { vector: [...entries[0].vector] },
      { vector: entries[1].vector.slice(0, 8) },
      { vector: [] },
    ],
    limit: 5,
  });

  assert.equal(report.queryCount, 3);
  assert.equal(report.evaluatedQueryCount, 1);
  assert.equal(report.skippedQueryCount, 2);
  assert.ok(report.recallAtK >= 0.95);
  assert.ok(report.exactTop1Rate >= 0.9);
  assert.ok(report.uniqueTargetRatio > 0);
});

test('evaluateRetrievalQuality stays high on analyzed node pool', async () => {
  const tracks = Array.from({ length: 12 }, (_, index) => ({
    id: `retrieval-seed-${index + 1}`,
    name: `Retrieval Seed ${index + 1}`,
    artist: `Artist ${index + 1}`,
    durationMs: 160_000 + index * 7_000,
  }));

  for (const track of tracks) {
    await analyzeTrackWithHeuristicV1(track);
  }

  const entries: RetrievalEntry[] = [];
  let nextId = 0;
  tracks.forEach((track) => {
    const nodes = getAnalyzedNodes(track.id);
    nodes.forEach((node) => {
      entries.push({
        id: nextId,
        vector: [...node.embedding],
      });
      nextId += 1;
    });
  });

  assert.ok(entries.length >= 12);

  const queries = entries.slice(0, Math.min(32, entries.length)).map((entry) => ({
    vector: [...entry.vector],
  }));
  const report = await evaluateRetrievalQuality({
    entries,
    queries,
    limit: Math.min(12, entries.length),
  });

  assert.equal(report.evaluatedQueryCount, queries.length);
  assert.ok(report.recallAtK >= 0.95);
  assert.ok(report.exactTop1Rate >= 0.9);
  assert.ok(report.uniqueTargetRatio > 0);
});
