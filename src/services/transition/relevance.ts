const RELEVANCE_STORAGE_KEY = 'moodverter_transition_relevance_labels';

export type TransitionRelevanceMap = Record<string, string[]>;

function normalizeId(id: string): string {
  return id.trim();
}

function readMapFromStorage(): TransitionRelevanceMap {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.localStorage.getItem(RELEVANCE_STORAGE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([seedTrackId, targetTrackIds]) => {
        const normalizedSeedTrackId = normalizeId(seedTrackId);
        const normalizedTargetTrackIds = Array.from(
          new Set(
            (Array.isArray(targetTrackIds) ? targetTrackIds : [])
              .map((targetTrackId) => (typeof targetTrackId === 'string' ? normalizeId(targetTrackId) : ''))
              .filter((targetTrackId) => targetTrackId.length > 0)
          )
        );
        return [normalizedSeedTrackId, normalizedTargetTrackIds];
      })
      .filter(([seedTrackId, targetTrackIds]) => seedTrackId.length > 0 && targetTrackIds.length > 0)
    );
  } catch {
    return {};
  }
}

function writeMapToStorage(map: TransitionRelevanceMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(RELEVANCE_STORAGE_KEY, JSON.stringify(map));
}

export function getTransitionRelevanceMap(): TransitionRelevanceMap {
  return readMapFromStorage();
}

export function addRelevantTarget(seedTrackId: string, targetTrackId: string): TransitionRelevanceMap {
  const normalizedSeedTrackId = normalizeId(seedTrackId);
  const normalizedTargetTrackId = normalizeId(targetTrackId);
  if (!normalizedSeedTrackId || !normalizedTargetTrackId) {
    return readMapFromStorage();
  }

  const map = readMapFromStorage();
  const currentTargets = map[normalizedSeedTrackId] ?? [];
  map[normalizedSeedTrackId] = Array.from(new Set([...currentTargets, normalizedTargetTrackId]));
  writeMapToStorage(map);
  return map;
}

export function removeRelevantTarget(seedTrackId: string, targetTrackId: string): TransitionRelevanceMap {
  const normalizedSeedTrackId = normalizeId(seedTrackId);
  const normalizedTargetTrackId = normalizeId(targetTrackId);
  if (!normalizedSeedTrackId || !normalizedTargetTrackId) {
    return readMapFromStorage();
  }

  const map = readMapFromStorage();
  const nextTargets = (map[normalizedSeedTrackId] ?? []).filter(
    (candidateTargetId) => candidateTargetId !== normalizedTargetTrackId
  );

  if (nextTargets.length === 0) {
    delete map[normalizedSeedTrackId];
  } else {
    map[normalizedSeedTrackId] = nextTargets;
  }

  writeMapToStorage(map);
  return map;
}

export function clearTransitionRelevanceMap(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(RELEVANCE_STORAGE_KEY);
}
