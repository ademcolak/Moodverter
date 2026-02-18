"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MANUAL_LISTENING_CHECKLIST_ITEM_COUNT = void 0;
exports.createEmptyManualListeningChecklist = createEmptyManualListeningChecklist;
exports.getManualListeningChecklistMap = getManualListeningChecklistMap;
exports.getManualListeningChecklist = getManualListeningChecklist;
exports.updateManualListeningChecklist = updateManualListeningChecklist;
exports.clearManualListeningChecklistMap = clearManualListeningChecklistMap;
exports.countCompletedManualListeningChecklistItems = countCompletedManualListeningChecklistItems;
const MANUAL_CHECKLIST_STORAGE_KEY = 'moodverter_transition_manual_listening_checklist';
const MANUAL_LISTENING_KEYS = [
    'transitionSmooth',
    'timingAligned',
    'loudnessAcceptable',
    'eventContinuity',
    'replayWorth',
];
exports.MANUAL_LISTENING_CHECKLIST_ITEM_COUNT = MANUAL_LISTENING_KEYS.length;
function nowIsoString() {
    return new Date().toISOString();
}
function createEmptyManualListeningChecklist() {
    return {
        transitionSmooth: false,
        timingAligned: false,
        loudnessAcceptable: false,
        eventContinuity: false,
        replayWorth: false,
        updatedAt: nowIsoString(),
    };
}
function parseStorage(raw) {
    if (!raw)
        return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return {};
        const entries = Object.entries(parsed)
            .map(([seedTrackId, value]) => {
            const normalizedSeed = seedTrackId.trim();
            if (!normalizedSeed || !value || typeof value !== 'object')
                return null;
            const entry = value;
            return [normalizedSeed, {
                    transitionSmooth: Boolean(entry.transitionSmooth),
                    timingAligned: Boolean(entry.timingAligned),
                    loudnessAcceptable: Boolean(entry.loudnessAcceptable),
                    eventContinuity: Boolean(entry.eventContinuity),
                    replayWorth: Boolean(entry.replayWorth),
                    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : nowIsoString(),
                }];
        })
            .filter((item) => item !== null);
        return Object.fromEntries(entries);
    }
    catch {
        return {};
    }
}
function readChecklistMap() {
    if (typeof window === 'undefined')
        return {};
    return parseStorage(window.localStorage.getItem(MANUAL_CHECKLIST_STORAGE_KEY));
}
function writeChecklistMap(map) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(MANUAL_CHECKLIST_STORAGE_KEY, JSON.stringify(map));
}
function normalizeSeedTrackId(seedTrackId) {
    const normalized = seedTrackId.trim();
    if (!normalized)
        throw new Error('seedTrackId is required');
    return normalized;
}
function getManualListeningChecklistMap() {
    return readChecklistMap();
}
function getManualListeningChecklist(seedTrackId) {
    const normalizedSeedTrackId = normalizeSeedTrackId(seedTrackId);
    const map = readChecklistMap();
    return map[normalizedSeedTrackId] ?? createEmptyManualListeningChecklist();
}
function updateManualListeningChecklist(seedTrackId, patch) {
    const normalizedSeedTrackId = normalizeSeedTrackId(seedTrackId);
    const map = readChecklistMap();
    const previous = map[normalizedSeedTrackId] ?? createEmptyManualListeningChecklist();
    const next = {
        ...previous,
        updatedAt: nowIsoString(),
    };
    MANUAL_LISTENING_KEYS.forEach((key) => {
        if (key in patch) {
            next[key] = Boolean(patch[key]);
        }
    });
    const nextMap = {
        ...map,
        [normalizedSeedTrackId]: next,
    };
    writeChecklistMap(nextMap);
    return nextMap;
}
function clearManualListeningChecklistMap() {
    if (typeof window === 'undefined')
        return;
    window.localStorage.removeItem(MANUAL_CHECKLIST_STORAGE_KEY);
}
function countCompletedManualListeningChecklistItems(entry) {
    return MANUAL_LISTENING_KEYS.reduce((count, key) => count + (entry[key] ? 1 : 0), 0);
}
