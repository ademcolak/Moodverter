const BENCHMARK_SEED_STORAGE_KEY = 'moodverter_transition_benchmark_seed_ids';

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
  window.localStorage.setItem(
    BENCHMARK_SEED_STORAGE_KEY,
    JSON.stringify(normalizeSeedTrackIds(seedTrackIds))
  );
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
  window.localStorage.removeItem(BENCHMARK_SEED_STORAGE_KEY);
}
