"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTransitionNodesV1 = extractTransitionNodesV1;
const DEFAULT_DURATION_MS = 180000;
const EMBEDDING_DIM = 16;
const CHROMA_DIM = 12;
function hashString(input) {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function normalizeDuration(durationMs) {
    if (!durationMs || durationMs < 30000)
        return DEFAULT_DURATION_MS;
    return durationMs;
}
function seededUnit(seed, offset) {
    const value = Math.sin(seed * 0.0001 + offset * 12.9898) * 43758.5453;
    return value - Math.floor(value);
}
function seededVector(seed, size) {
    const vector = Array.from({ length: size }, (_, index) => seededUnit(seed, index) * 2 - 1);
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
    return vector.map((value) => value / norm);
}
function pickEventType(seed, index) {
    const eventTypes = [
        'vocal-hit',
        'drop',
        'percussive-hit',
        'silence-break',
        'scream-hit',
        'other',
    ];
    return eventTypes[(seed + index) % eventTypes.length];
}
function buildNode(track, durationMs, ratio, index, rootSeed) {
    const timeMs = Math.round(durationMs * ratio);
    const seed = hashString(`${rootSeed}:${timeMs}:${index}`);
    const bpmLocal = 90 + Math.round(seededUnit(seed, 100) * 80);
    const loudnessRms = -18 + seededUnit(seed, 200) * 12;
    return {
        id: `${track.id}:${timeMs}:${index}`,
        trackId: track.id,
        timeMs,
        eventType: pickEventType(rootSeed, index),
        eventConfidence: 0.55 + seededUnit(seed, 300) * 0.45,
        embedding: seededVector(seed, EMBEDDING_DIM),
        bpmLocal,
        chroma: seededVector(seed ^ 0x9e3779b9, CHROMA_DIM),
        loudnessRms,
    };
}
function extractTransitionNodesV1(track) {
    const durationMs = normalizeDuration(track.durationMs);
    const rootSeed = hashString(`${track.id}|${track.name}|${track.artist}`);
    // Fixed anchor ratios to approximate intro/build/hook/outro moments.
    const anchorRatios = [0.14, 0.32, 0.52, 0.72, 0.9];
    return anchorRatios.map((ratio, index) => buildNode(track, durationMs, ratio, index, rootSeed));
}
