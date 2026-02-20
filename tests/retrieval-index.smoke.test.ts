import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRetrievalQuality, type RetrievalEntry } from '../src/services/transition';

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
});
