const BENCHMARK_SEED_STORAGE_KEY = 'moodverter_transition_benchmark_seed_ids';
let isBenchmarkSeedStorageWriteDisabled = false;
let hasWarnedBenchmarkSeedQuota = false;

function normalizeSeedTrackIds(seedTrackIds: string[]): string[] {
  const unique = new Set<string>();
  seedTrackIds.forEach((trackId) => {
    const normalized = trackId.trim();
    if (normalized.length > 0) unique.add(normalized);
  });
  return [...unique];
}

function readSeedTrackIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(BENCHMARK_SEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const ids = parsed.filter((item): item is string => typeof item === 'string');
    return normalizeSeedTrackIds(ids);
  } catch {
    return [];
  }
}

function writeSeedTrackIds(seedTrackIds: string[]): void {
  if (typeof window === 'undefined') return;
  if (isBenchmarkSeedStorageWriteDisabled) return;
  try {
    window.localStorage.setItem(
      BENCHMARK_SEED_STORAGE_KEY,
      JSON.stringify(normalizeSeedTrackIds(seedTrackIds))
    );
  } catch {
    isBenchmarkSeedStorageWriteDisabled = true;
    if (!hasWarnedBenchmarkSeedQuota) {
      hasWarnedBenchmarkSeedQuota = true;
      console.warn('Benchmark seed storage write disabled due to quota.');
    }
  }
}

export function getBenchmarkSeedTrackIds(): string[] {
  return readSeedTrackIds();
}

export function setBenchmarkSeedTrackIds(seedTrackIds: string[]): string[] {
  const normalized = normalizeSeedTrackIds(seedTrackIds);
  writeSeedTrackIds(normalized);
  return normalized;
}

export function addBenchmarkSeedTrackId(seedTrackId: string): string[] {
  const normalizedSeedTrackId = seedTrackId.trim();
  if (normalizedSeedTrackId.length === 0) return readSeedTrackIds();
  const next = normalizeSeedTrackIds([...readSeedTrackIds(), normalizedSeedTrackId]);
  writeSeedTrackIds(next);
  return next;
}

export function removeBenchmarkSeedTrackId(seedTrackId: string): string[] {
  const normalizedSeedTrackId = seedTrackId.trim();
  if (normalizedSeedTrackId.length === 0) return readSeedTrackIds();
  const next = readSeedTrackIds().filter((trackId) => trackId !== normalizedSeedTrackId);
  writeSeedTrackIds(next);
  return next;
}

export function clearBenchmarkSeedTrackIds(): void {
  if (typeof window === 'undefined') return;
  isBenchmarkSeedStorageWriteDisabled = false;
  hasWarnedBenchmarkSeedQuota = false;
  window.localStorage.removeItem(BENCHMARK_SEED_STORAGE_KEY);
}
