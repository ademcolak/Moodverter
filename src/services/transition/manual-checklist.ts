export type ManualListeningChecklistKey =
  | 'transitionSmooth'
  | 'timingAligned'
  | 'loudnessAcceptable'
  | 'eventContinuity'
  | 'replayWorth';

export interface ManualListeningChecklist {
  transitionSmooth: boolean;
  timingAligned: boolean;
  loudnessAcceptable: boolean;
  eventContinuity: boolean;
  replayWorth: boolean;
  updatedAt: string;
}

export type ManualListeningChecklistMap = Record<string, ManualListeningChecklist>;

const MANUAL_CHECKLIST_STORAGE_KEY = 'moodverter_transition_manual_listening_checklist';
const MANUAL_LISTENING_KEYS: ManualListeningChecklistKey[] = [
  'transitionSmooth',
  'timingAligned',
  'loudnessAcceptable',
  'eventContinuity',
  'replayWorth',
];
export const MANUAL_LISTENING_CHECKLIST_ITEM_COUNT = MANUAL_LISTENING_KEYS.length;

function nowIsoString(): string {
  return new Date().toISOString();
}

export function createEmptyManualListeningChecklist(): ManualListeningChecklist {
  return {
    transitionSmooth: false,
    timingAligned: false,
    loudnessAcceptable: false,
    eventContinuity: false,
    replayWorth: false,
    updatedAt: nowIsoString(),
  };
}

function parseStorage(raw: string | null): ManualListeningChecklistMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .map(([seedTrackId, value]) => {
        const normalizedSeed = seedTrackId.trim();
        if (!normalizedSeed || !value || typeof value !== 'object') return null;
        const entry = value as Partial<ManualListeningChecklist>;
        return [normalizedSeed, {
          transitionSmooth: Boolean(entry.transitionSmooth),
          timingAligned: Boolean(entry.timingAligned),
          loudnessAcceptable: Boolean(entry.loudnessAcceptable),
          eventContinuity: Boolean(entry.eventContinuity),
          replayWorth: Boolean(entry.replayWorth),
          updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIsoString(),
        }] as const;
      })
      .filter((item): item is readonly [string, ManualListeningChecklist] => item !== null);
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function readChecklistMap(): ManualListeningChecklistMap {
  if (typeof window === 'undefined') return {};
  return parseStorage(window.localStorage.getItem(MANUAL_CHECKLIST_STORAGE_KEY));
}

function writeChecklistMap(map: ManualListeningChecklistMap): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MANUAL_CHECKLIST_STORAGE_KEY, JSON.stringify(map));
}

function normalizeSeedTrackId(seedTrackId: string): string {
  const normalized = seedTrackId.trim();
  if (!normalized) throw new Error('seedTrackId is required');
  return normalized;
}

export function getManualListeningChecklistMap(): ManualListeningChecklistMap {
  return readChecklistMap();
}

export function getManualListeningChecklist(seedTrackId: string): ManualListeningChecklist {
  const normalizedSeedTrackId = normalizeSeedTrackId(seedTrackId);
  const map = readChecklistMap();
  return map[normalizedSeedTrackId] ?? createEmptyManualListeningChecklist();
}

export function updateManualListeningChecklist(
  seedTrackId: string,
  patch: Partial<Record<ManualListeningChecklistKey, boolean>>
): ManualListeningChecklistMap {
  const normalizedSeedTrackId = normalizeSeedTrackId(seedTrackId);
  const map = readChecklistMap();
  const previous = map[normalizedSeedTrackId] ?? createEmptyManualListeningChecklist();
  const next: ManualListeningChecklist = {
    ...previous,
    updatedAt: nowIsoString(),
  };

  MANUAL_LISTENING_KEYS.forEach((key) => {
    if (key in patch) {
      next[key] = Boolean(patch[key]);
    }
  });

  const nextMap: ManualListeningChecklistMap = {
    ...map,
    [normalizedSeedTrackId]: next,
  };
  writeChecklistMap(nextMap);
  return nextMap;
}

export function clearManualListeningChecklistMap(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(MANUAL_CHECKLIST_STORAGE_KEY);
}

export function countCompletedManualListeningChecklistItems(entry: ManualListeningChecklist): number {
  return MANUAL_LISTENING_KEYS.reduce((count, key) => count + (entry[key] ? 1 : 0), 0);
}
