"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransitionRelevanceMap = getTransitionRelevanceMap;
exports.setTransitionRelevanceMap = setTransitionRelevanceMap;
exports.addRelevantTarget = addRelevantTarget;
exports.removeRelevantTarget = removeRelevantTarget;
exports.clearTransitionRelevanceMap = clearTransitionRelevanceMap;
const RELEVANCE_STORAGE_KEY = 'moodverter_transition_relevance_labels';
function normalizeId(id) {
    return id.trim();
}
function readMapFromStorage() {
    if (typeof window === 'undefined')
        return {};
    try {
        const raw = window.localStorage.getItem(RELEVANCE_STORAGE_KEY);
        if (!raw)
            return {};
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object')
            return {};
        return Object.fromEntries(Object.entries(parsed).map(([seedTrackId, targetTrackIds]) => {
            const normalizedSeedTrackId = normalizeId(seedTrackId);
            const normalizedTargetTrackIds = Array.from(new Set((Array.isArray(targetTrackIds) ? targetTrackIds : [])
                .map((targetTrackId) => (typeof targetTrackId === 'string' ? normalizeId(targetTrackId) : ''))
                .filter((targetTrackId) => targetTrackId.length > 0)));
            return [normalizedSeedTrackId, normalizedTargetTrackIds];
        })
            .filter(([seedTrackId, targetTrackIds]) => seedTrackId.length > 0 && targetTrackIds.length > 0));
    }
    catch {
        return {};
    }
}
function writeMapToStorage(map) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(RELEVANCE_STORAGE_KEY, JSON.stringify(map));
}
function getTransitionRelevanceMap() {
    return readMapFromStorage();
}
function setTransitionRelevanceMap(map) {
    const normalized = Object.fromEntries(Object.entries(map)
        .map(([seedTrackId, targetTrackIds]) => {
        const normalizedSeedTrackId = normalizeId(seedTrackId);
        const normalizedTargetTrackIds = Array.from(new Set((Array.isArray(targetTrackIds) ? targetTrackIds : [])
            .map((targetTrackId) => (typeof targetTrackId === 'string' ? normalizeId(targetTrackId) : ''))
            .filter((targetTrackId) => targetTrackId.length > 0)));
        return [normalizedSeedTrackId, normalizedTargetTrackIds];
    })
        .filter(([seedTrackId, targetTrackIds]) => seedTrackId.length > 0 && targetTrackIds.length > 0));
    writeMapToStorage(normalized);
    return normalized;
}
function addRelevantTarget(seedTrackId, targetTrackId) {
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
function removeRelevantTarget(seedTrackId, targetTrackId) {
    const normalizedSeedTrackId = normalizeId(seedTrackId);
    const normalizedTargetTrackId = normalizeId(targetTrackId);
    if (!normalizedSeedTrackId || !normalizedTargetTrackId) {
        return readMapFromStorage();
    }
    const map = readMapFromStorage();
    const nextTargets = (map[normalizedSeedTrackId] ?? []).filter((candidateTargetId) => candidateTargetId !== normalizedTargetTrackId);
    if (nextTargets.length === 0) {
        delete map[normalizedSeedTrackId];
    }
    else {
        map[normalizedSeedTrackId] = nextTargets;
    }
    writeMapToStorage(map);
    return map;
}
function clearTransitionRelevanceMap() {
    if (typeof window === 'undefined')
        return;
    window.localStorage.removeItem(RELEVANCE_STORAGE_KEY);
}
