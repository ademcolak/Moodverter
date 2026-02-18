"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBenchmarkSeedTrackIds = getBenchmarkSeedTrackIds;
exports.setBenchmarkSeedTrackIds = setBenchmarkSeedTrackIds;
exports.addBenchmarkSeedTrackId = addBenchmarkSeedTrackId;
exports.removeBenchmarkSeedTrackId = removeBenchmarkSeedTrackId;
exports.clearBenchmarkSeedTrackIds = clearBenchmarkSeedTrackIds;
const BENCHMARK_SEED_STORAGE_KEY = 'moodverter_transition_benchmark_seed_ids';
function normalizeSeedTrackIds(seedTrackIds) {
    const unique = new Set();
    seedTrackIds.forEach((trackId) => {
        const normalized = trackId.trim();
        if (normalized.length > 0)
            unique.add(normalized);
    });
    return [...unique];
}
function readSeedTrackIds() {
    if (typeof window === 'undefined')
        return [];
    try {
        const raw = window.localStorage.getItem(BENCHMARK_SEED_STORAGE_KEY);
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        const ids = parsed.filter((item) => typeof item === 'string');
        return normalizeSeedTrackIds(ids);
    }
    catch {
        return [];
    }
}
function writeSeedTrackIds(seedTrackIds) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(BENCHMARK_SEED_STORAGE_KEY, JSON.stringify(normalizeSeedTrackIds(seedTrackIds)));
}
function getBenchmarkSeedTrackIds() {
    return readSeedTrackIds();
}
function setBenchmarkSeedTrackIds(seedTrackIds) {
    const normalized = normalizeSeedTrackIds(seedTrackIds);
    writeSeedTrackIds(normalized);
    return normalized;
}
function addBenchmarkSeedTrackId(seedTrackId) {
    const normalizedSeedTrackId = seedTrackId.trim();
    if (normalizedSeedTrackId.length === 0)
        return readSeedTrackIds();
    const next = normalizeSeedTrackIds([...readSeedTrackIds(), normalizedSeedTrackId]);
    writeSeedTrackIds(next);
    return next;
}
function removeBenchmarkSeedTrackId(seedTrackId) {
    const normalizedSeedTrackId = seedTrackId.trim();
    if (normalizedSeedTrackId.length === 0)
        return readSeedTrackIds();
    const next = readSeedTrackIds().filter((trackId) => trackId !== normalizedSeedTrackId);
    writeSeedTrackIds(next);
    return next;
}
function clearBenchmarkSeedTrackIds() {
    if (typeof window === 'undefined')
        return;
    window.localStorage.removeItem(BENCHMARK_SEED_STORAGE_KEY);
}
