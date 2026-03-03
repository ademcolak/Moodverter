export interface RetrievalEntry {
  id: number;
  vector: number[];
}

export interface RetrievalIndex {
  engine: 'hnsw' | 'bruteforce';
  query(vector: number[], limit: number): number[];
}

export interface RetrievalQualityQuery {
  vector: number[];
}

export interface RetrievalQualityReport {
  engine: RetrievalIndex['engine'];
  limit: number;
  queryCount: number;
  evaluatedQueryCount: number;
  skippedQueryCount: number;
  recallAtK: number;
  exactTop1Rate: number;
  uniqueTargetRatio: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;

  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return clamp((dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm)) + 1) / 2, 0, 1);
}

class BruteForceRetrievalIndex implements RetrievalIndex {
  public readonly engine = 'bruteforce' as const;

  constructor(private readonly entries: RetrievalEntry[]) {}

  query(vector: number[], limit: number): number[] {
    const boundedLimit = clamp(limit, 1, this.entries.length);
    if (boundedLimit <= 0) return [];
    return this.entries
      .map((entry, index) => ({
        index,
        score: cosineSimilarity(vector, entry.vector),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, boundedLimit)
      .map((item) => item.index);
  }
}

function queryBruteForceNearestIndices(
  entries: RetrievalEntry[],
  vector: number[],
  limit: number
): number[] {
  const boundedLimit = clamp(limit, 1, entries.length);
  if (boundedLimit <= 0) return [];
  return entries
    .map((entry, index) => ({
      index,
      score: cosineSimilarity(vector, entry.vector),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, boundedLimit)
    .map((item) => item.index);
}

interface HnswSearchResult {
  neighbors?: number[];
  distances?: number[];
}

interface HnswIndexInstance {
  initIndex(maxElements: number): void;
  addPoint(point: number[], label: number): void;
  setEf(ef: number): void;
  searchKnn(point: number[], k: number): HnswSearchResult;
}

interface HnswModule {
  HierarchicalNSW: new (spaceName: string, numDimensions: number) => HnswIndexInstance;
}

class HnswRetrievalIndex implements RetrievalIndex {
  public readonly engine = 'hnsw' as const;

  constructor(private readonly index: HnswIndexInstance, private readonly size: number) {}

  query(vector: number[], limit: number): number[] {
    const boundedLimit = clamp(limit, 1, this.size);
    if (boundedLimit <= 0) return [];
    const result = this.index.searchKnn(vector, boundedLimit);
    const neighbors = Array.isArray(result.neighbors) ? result.neighbors : [];
    return neighbors
      .map((value) => Math.floor(value))
      .filter((value) => Number.isFinite(value) && value >= 0 && value < this.size);
  }
}

async function loadOptionalHnswModule(): Promise<HnswModule | null> {
  // Browser builds use brute-force fallback; hnswlib-node is Node-only.
  if (typeof window !== 'undefined') return null;

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const preferredEngine = processEnv?.MOODVERTER_TRANSITION_RETRIEVAL_ENGINE?.trim().toLowerCase() ?? 'auto';
  if (preferredEngine === 'bruteforce') return null;

  try {
    const moduleName = 'hnswlib-node';
    const loaded = await import(/* @vite-ignore */ moduleName);
    return loaded as unknown as HnswModule;
  } catch {
    return null;
  }
}

function normalizeEntries(entries: RetrievalEntry[]): RetrievalEntry[] {
  return entries
    .map((entry) => ({
      id: Math.floor(entry.id),
      vector: Array.isArray(entry.vector)
        ? entry.vector.map((value) => (Number.isFinite(value) ? value : 0))
        : [],
    }))
    .filter((entry) => entry.vector.length > 0)
    .sort((a, b) => a.id - b.id);
}

export async function createRetrievalIndex(entries: RetrievalEntry[]): Promise<RetrievalIndex> {
  const normalized = normalizeEntries(entries);
  if (normalized.length === 0) {
    return new BruteForceRetrievalIndex([]);
  }

  const dims = normalized[0].vector.length;
  const aligned = normalized.filter((entry) => entry.vector.length === dims);
  if (aligned.length === 0) {
    return new BruteForceRetrievalIndex([]);
  }

  const hnswModule = await loadOptionalHnswModule();
  if (!hnswModule || aligned.length < 64) {
    return new BruteForceRetrievalIndex(aligned);
  }

  try {
    const index = new hnswModule.HierarchicalNSW('cosine', dims);
    index.initIndex(aligned.length);
    aligned.forEach((entry, indexId) => {
      index.addPoint(entry.vector, indexId);
    });
    index.setEf(Math.max(64, Math.min(256, aligned.length)));
    return new HnswRetrievalIndex(index, aligned.length);
  } catch {
    return new BruteForceRetrievalIndex(aligned);
  }
}

export async function evaluateRetrievalQuality(input: {
  entries: RetrievalEntry[];
  queries: RetrievalQualityQuery[];
  limit: number;
}): Promise<RetrievalQualityReport> {
  const normalized = normalizeEntries(input.entries);
  const boundedLimit = clamp(input.limit, 1, Math.max(1, normalized.length));

  if (normalized.length === 0) {
    return {
      engine: 'bruteforce',
      limit: boundedLimit,
      queryCount: input.queries.length,
      evaluatedQueryCount: 0,
      skippedQueryCount: input.queries.length,
      recallAtK: 0,
      exactTop1Rate: 0,
      uniqueTargetRatio: 0,
    };
  }

  const dims = normalized[0].vector.length;
  const aligned = normalized.filter((entry) => entry.vector.length === dims);
  const retrievalIndex = await createRetrievalIndex(aligned);

  let evaluatedQueryCount = 0;
  let skippedQueryCount = 0;
  let recallTotal = 0;
  let exactTop1HitCount = 0;
  const uniqueRetrievedIndices = new Set<number>();

  input.queries.forEach((query) => {
    if (!Array.isArray(query.vector) || query.vector.length !== dims) {
      skippedQueryCount += 1;
      return;
    }
    const normalizedQuery = query.vector.map((value) => (Number.isFinite(value) ? value : 0));
    const expected = queryBruteForceNearestIndices(aligned, normalizedQuery, boundedLimit);
    if (expected.length === 0) {
      skippedQueryCount += 1;
      return;
    }
    const actual = retrievalIndex.query(normalizedQuery, boundedLimit);
    actual.forEach((index) => {
      uniqueRetrievedIndices.add(index);
    });
    const actualSet = new Set(actual);
    const hitCount = expected.filter((index) => actualSet.has(index)).length;

    evaluatedQueryCount += 1;
    recallTotal += hitCount / expected.length;
    if ((actual[0] ?? -1) === expected[0]) {
      exactTop1HitCount += 1;
    }
  });

  return {
    engine: retrievalIndex.engine,
    limit: boundedLimit,
    queryCount: input.queries.length,
    evaluatedQueryCount,
    skippedQueryCount,
    recallAtK: evaluatedQueryCount === 0 ? 0 : recallTotal / evaluatedQueryCount,
    exactTop1Rate: evaluatedQueryCount === 0 ? 0 : exactTop1HitCount / evaluatedQueryCount,
    uniqueTargetRatio: evaluatedQueryCount === 0
      ? 0
      : clamp(uniqueRetrievedIndices.size / (evaluatedQueryCount * boundedLimit), 0, 1),
  };
}
