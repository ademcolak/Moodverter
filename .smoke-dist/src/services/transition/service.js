"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueTrackForAnalysis = enqueueTrackForAnalysis;
exports.getAnalysisState = getAnalysisState;
exports.getAnalysisQueue = getAnalysisQueue;
exports.claimNextTrackForAnalysis = claimNextTrackForAnalysis;
exports.upsertAnalyzedNodes = upsertAnalyzedNodes;
exports.markAnalysisFailed = markAnalysisFailed;
exports.getAnalyzedNodes = getAnalyzedNodes;
exports.analyzeTrackWithHeuristicV1 = analyzeTrackWithHeuristicV1;
exports.findTransitionCandidates = findTransitionCandidates;
exports.runBaselineEvaluation = runBaselineEvaluation;
exports.getBaselineRunHistory = getBaselineRunHistory;
exports.clearTransitionData = clearTransitionData;
const analyzer_1 = require("./analyzer");
const metrics_1 = require("./metrics");
const ANALYSIS_VERSION = 2;
const STORAGE_KEYS = {
    queue: 'moodverter_transition_analysis_queue',
    states: 'moodverter_transition_analysis_states',
    nodes: 'moodverter_transition_nodes',
    baselineRuns: 'moodverter_transition_baseline_runs',
};
const SCORE_WEIGHTS = {
    eventMatch: 0.35,
    embedding: 0.3,
    rhythm: 0.2,
    loudness: 0.15,
    artifactPenalty: 0.25,
};
const EVENT_COMPATIBILITY = {
    'scream-hit': {
        'scream-hit': 1,
        'vocal-hit': 0.75,
        drop: 0.5,
        'percussive-hit': 0.35,
        'silence-break': 0.25,
        other: 0.2,
    },
    'vocal-hit': {
        'vocal-hit': 1,
        'scream-hit': 0.75,
        drop: 0.45,
        'percussive-hit': 0.3,
        'silence-break': 0.2,
        other: 0.2,
    },
    drop: {
        drop: 1,
        'percussive-hit': 0.65,
        'vocal-hit': 0.45,
        'scream-hit': 0.5,
        'silence-break': 0.2,
        other: 0.25,
    },
    'percussive-hit': {
        'percussive-hit': 1,
        drop: 0.65,
        'vocal-hit': 0.3,
        'scream-hit': 0.35,
        'silence-break': 0.2,
        other: 0.2,
    },
    'silence-break': {
        'silence-break': 1,
        drop: 0.3,
        'vocal-hit': 0.2,
        'scream-hit': 0.2,
        'percussive-hit': 0.2,
        other: 0.2,
    },
    other: {
        other: 1,
        'vocal-hit': 0.25,
        'scream-hit': 0.25,
        drop: 0.25,
        'percussive-hit': 0.25,
        'silence-break': 0.25,
    },
};
let isHydrated = false;
let analysisQueue = [];
let analysisStates = {};
let nodesByTrack = {};
let baselineRunHistory = [];
function normalizeTrackId(trackId) {
    const normalized = trackId.trim();
    if (!normalized) {
        throw new Error('trackId is required');
    }
    return normalized;
}
function nowIsoString() {
    return new Date().toISOString();
}
function clamp(value, min, max) {
    if (!Number.isFinite(value))
        return min;
    return Math.min(max, Math.max(min, value));
}
function toFiniteNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    return fallback;
}
function sanitizeNumericArray(value, fallbackSize) {
    if (!Array.isArray(value)) {
        return Array.from({ length: fallbackSize }, () => 0);
    }
    const next = value
        .map((item) => (typeof item === 'number' && Number.isFinite(item) ? item : 0))
        .slice(0, fallbackSize);
    if (next.length < fallbackSize) {
        return [...next, ...Array.from({ length: fallbackSize - next.length }, () => 0)];
    }
    return next;
}
function safeParseJson(raw, fallback) {
    if (!raw)
        return fallback;
    try {
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function readStorage(key, fallback) {
    if (typeof window === 'undefined')
        return fallback;
    return safeParseJson(window.localStorage.getItem(key), fallback);
}
function writeStorage(key, value) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.setItem(key, JSON.stringify(value));
}
function removeStorage(key) {
    if (typeof window === 'undefined')
        return;
    window.localStorage.removeItem(key);
}
function hydrateFromStorage() {
    if (isHydrated)
        return;
    analysisQueue = readStorage(STORAGE_KEYS.queue, []);
    analysisStates = readStorage(STORAGE_KEYS.states, {});
    const rawNodesByTrack = readStorage(STORAGE_KEYS.nodes, {});
    baselineRunHistory = readStorage(STORAGE_KEYS.baselineRuns, [])
        .filter((run) => typeof run?.runAt === 'string' && Array.isArray(run?.seedTrackIds))
        .map((run) => ({
        ...run,
        seedTrackIds: run.seedTrackIds
            .map((trackId) => trackId.trim())
            .filter((trackId) => trackId.length > 0),
    }))
        .slice(-100);
    nodesByTrack = Object.fromEntries(Object.entries(rawNodesByTrack).map(([trackId, nodes]) => [
        trackId,
        (Array.isArray(nodes) ? nodes : []).map((node) => sanitizeNode(trackId, node)),
    ]));
    // Migrate any stale analysis status versions.
    analysisStates = Object.fromEntries(Object.entries(analysisStates).map(([trackId, state]) => [
        trackId,
        {
            ...state,
            version: ANALYSIS_VERSION,
        },
    ]));
    analysisQueue = analysisQueue.filter((trackId) => trackId in nodesByTrack || trackId in analysisStates);
    persistStorage();
    isHydrated = true;
}
function persistStorage() {
    writeStorage(STORAGE_KEYS.queue, analysisQueue);
    writeStorage(STORAGE_KEYS.states, analysisStates);
    writeStorage(STORAGE_KEYS.nodes, nodesByTrack);
    writeStorage(STORAGE_KEYS.baselineRuns, baselineRunHistory);
}
function setAnalysisState(trackId, status, errorMessage) {
    const state = {
        trackId,
        status,
        updatedAt: nowIsoString(),
        version: ANALYSIS_VERSION,
        ...(errorMessage ? { errorMessage } : {}),
    };
    analysisStates[trackId] = state;
    return state;
}
function getSourceNode(nodes, sourceTimeMs) {
    if (nodes.length === 0) {
        throw new Error('source nodes are required');
    }
    if (sourceTimeMs === undefined) {
        return nodes[nodes.length - 1];
    }
    return nodes.reduce((nearest, current) => {
        const currentDiff = Math.abs(current.timeMs - sourceTimeMs);
        const nearestDiff = Math.abs(nearest.timeMs - sourceTimeMs);
        return currentDiff < nearestDiff ? current : nearest;
    });
}
function cosineSimilarity(a, b) {
    if (a.length === 0 || b.length === 0 || a.length !== b.length)
        return 0;
    let dot = 0;
    let aNorm = 0;
    let bNorm = 0;
    for (let i = 0; i < a.length; i += 1) {
        dot += a[i] * b[i];
        aNorm += a[i] * a[i];
        bNorm += b[i] * b[i];
    }
    if (aNorm === 0 || bNorm === 0)
        return 0;
    const similarity = dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
    return clamp((similarity + 1) / 2, 0, 1);
}
function computeRhythmAlignment(source, target) {
    const bpmDiff = Math.abs(source.bpmLocal - target.bpmLocal);
    const bpmScore = 1 - clamp(bpmDiff / 40, 0, 1);
    const keyScore = cosineSimilarity(source.chroma, target.chroma);
    return clamp(0.6 * bpmScore + 0.4 * keyScore, 0, 1);
}
function computeLoudnessContinuity(source, target) {
    const loudnessDiff = Math.abs(source.loudnessRms - target.loudnessRms);
    return 1 - clamp(loudnessDiff / 24, 0, 1);
}
function computeArtifactPenalty(source, target) {
    const bpmDiffPenalty = clamp(Math.abs(source.bpmLocal - target.bpmLocal) / 80, 0, 1);
    const loudnessPenalty = clamp(Math.abs(source.loudnessRms - target.loudnessRms) / 36, 0, 1);
    return clamp(0.5 * bpmDiffPenalty + 0.5 * loudnessPenalty, 0, 1);
}
function scoreTransition(source, target) {
    const eventCompatibility = EVENT_COMPATIBILITY[source.eventType]?.[target.eventType] ?? 0.2;
    const eventConfidence = clamp(Math.min(toFiniteNumber(source.eventConfidence, 0.6), toFiniteNumber(target.eventConfidence, 0.6)), 0, 1);
    const eventMatchScore = clamp(eventCompatibility * eventConfidence, 0, 1);
    const embeddingSimilarity = cosineSimilarity(source.embedding, target.embedding);
    const rhythmAlignmentScore = computeRhythmAlignment(source, target);
    const loudnessContinuityScore = computeLoudnessContinuity(source, target);
    const artifactPenalty = computeArtifactPenalty(source, target);
    const finalScore = clamp(SCORE_WEIGHTS.eventMatch * eventMatchScore
        + SCORE_WEIGHTS.embedding * embeddingSimilarity
        + SCORE_WEIGHTS.rhythm * rhythmAlignmentScore
        + SCORE_WEIGHTS.loudness * loudnessContinuityScore
        - SCORE_WEIGHTS.artifactPenalty * artifactPenalty, 0, 1);
    return {
        eventMatchScore,
        embeddingSimilarity,
        rhythmAlignmentScore,
        loudnessContinuityScore,
        artifactPenalty,
        finalScore,
    };
}
function formatPercentLabel(value) {
    return `${Math.round(clamp(value, 0, 1) * 100)}%`;
}
function pickPrimaryDriver(score) {
    const positiveDrivers = [
        { key: 'event', value: SCORE_WEIGHTS.eventMatch * score.eventMatchScore },
        { key: 'embedding', value: SCORE_WEIGHTS.embedding * score.embeddingSimilarity },
        { key: 'rhythm', value: SCORE_WEIGHTS.rhythm * score.rhythmAlignmentScore },
        { key: 'loudness', value: SCORE_WEIGHTS.loudness * score.loudnessContinuityScore },
    ];
    const topPositive = positiveDrivers.reduce((best, current) => current.value > best.value ? current : best);
    const weightedPenalty = SCORE_WEIGHTS.artifactPenalty * score.artifactPenalty;
    if (weightedPenalty > topPositive.value)
        return 'penalty';
    return topPositive.key;
}
function buildScoreDiagnostic(score) {
    return {
        primaryDriver: pickPrimaryDriver(score),
        summary: `Event ${formatPercentLabel(score.eventMatchScore)} | Emb ${formatPercentLabel(score.embeddingSimilarity)} | Rhythm ${formatPercentLabel(score.rhythmAlignmentScore)} | Loud ${formatPercentLabel(score.loudnessContinuityScore)} | Penalty ${formatPercentLabel(score.artifactPenalty)}`,
    };
}
function sanitizeNode(trackId, node) {
    const eventType = node.eventType;
    const eventTypes = [
        'scream-hit',
        'drop',
        'vocal-hit',
        'silence-break',
        'percussive-hit',
        'other',
    ];
    const normalizedEventType = eventType && eventTypes.includes(eventType)
        ? eventType
        : 'other';
    return {
        ...node,
        trackId,
        id: node.id || `${trackId}:${toFiniteNumber(node.timeMs, 0)}`,
        timeMs: Math.max(0, Math.round(toFiniteNumber(node.timeMs, 0))),
        eventType: normalizedEventType,
        eventConfidence: clamp(toFiniteNumber(node.eventConfidence, 0.6), 0, 1),
        bpmLocal: toFiniteNumber(node.bpmLocal, 120),
        loudnessRms: toFiniteNumber(node.loudnessRms, -12),
        embedding: sanitizeNumericArray(node.embedding, 16),
        chroma: sanitizeNumericArray(node.chroma, 12),
    };
}
function removeTrackFromQueue(trackId) {
    analysisQueue = analysisQueue.filter((item) => item !== trackId);
}
async function enqueueTrackForAnalysis(trackId) {
    hydrateFromStorage();
    const normalizedTrackId = normalizeTrackId(trackId);
    if (!analysisQueue.includes(normalizedTrackId)) {
        analysisQueue.push(normalizedTrackId);
    }
    const state = setAnalysisState(normalizedTrackId, 'pending');
    persistStorage();
    return state;
}
function getAnalysisState(trackId) {
    hydrateFromStorage();
    const normalizedTrackId = normalizeTrackId(trackId);
    return analysisStates[normalizedTrackId] ?? null;
}
function getAnalysisQueue() {
    hydrateFromStorage();
    return [...analysisQueue];
}
async function claimNextTrackForAnalysis() {
    hydrateFromStorage();
    const nextTrackId = analysisQueue.shift() ?? null;
    persistStorage();
    return nextTrackId;
}
function upsertAnalyzedNodes(trackId, nodes, status = 'ready') {
    hydrateFromStorage();
    const normalizedTrackId = normalizeTrackId(trackId);
    nodesByTrack[normalizedTrackId] = nodes.map((node) => sanitizeNode(normalizedTrackId, node));
    removeTrackFromQueue(normalizedTrackId);
    const state = setAnalysisState(normalizedTrackId, status);
    persistStorage();
    return state;
}
function markAnalysisFailed(trackId, errorMessage) {
    hydrateFromStorage();
    const normalizedTrackId = normalizeTrackId(trackId);
    removeTrackFromQueue(normalizedTrackId);
    const state = setAnalysisState(normalizedTrackId, 'failed', errorMessage);
    persistStorage();
    return state;
}
function getAnalyzedNodes(trackId) {
    hydrateFromStorage();
    const normalizedTrackId = normalizeTrackId(trackId);
    return [...(nodesByTrack[normalizedTrackId] ?? [])];
}
async function analyzeTrackWithHeuristicV1(track) {
    const normalizedTrackId = normalizeTrackId(track.id);
    await enqueueTrackForAnalysis(normalizedTrackId);
    try {
        const nodes = (0, analyzer_1.extractTransitionNodesV1)(track);
        return upsertAnalyzedNodes(normalizedTrackId, nodes, 'ready');
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Heuristic analysis failed';
        return markAnalysisFailed(normalizedTrackId, message);
    }
}
async function findTransitionCandidates(input) {
    hydrateFromStorage();
    const sourceTrackId = normalizeTrackId(input.trackId);
    const sourceNodes = nodesByTrack[sourceTrackId] ?? [];
    if (sourceNodes.length === 0)
        return [];
    const sourceNodeCandidates = input.sourceTimeMs === undefined
        ? sourceNodes
        : [getSourceNode(sourceNodes, input.sourceTimeMs)];
    const limit = clamp(input.limit ?? 5, 1, 50);
    const candidates = [];
    Object.entries(nodesByTrack).forEach(([targetTrackId, targetNodes]) => {
        if (targetTrackId === sourceTrackId)
            return;
        sourceNodeCandidates.forEach((sourceNode) => {
            targetNodes.forEach((targetNode) => {
                const score = scoreTransition(sourceNode, targetNode);
                candidates.push({
                    sourceTrackId,
                    sourceTimeMs: sourceNode.timeMs,
                    targetTrackId,
                    targetTimeMs: targetNode.timeMs,
                    score,
                    diagnostic: buildScoreDiagnostic(score),
                });
            });
        });
    });
    const sorted = candidates.sort((a, b) => b.score.finalScore - a.score.finalScore);
    const reranked = [];
    const includedKeys = new Set();
    const uniqueTargetTrackIds = new Set();
    const includeCandidate = (candidate) => {
        const key = `${candidate.targetTrackId}:${candidate.targetTimeMs}:${candidate.sourceTimeMs}`;
        if (includedKeys.has(key))
            return false;
        reranked.push(candidate);
        includedKeys.add(key);
        uniqueTargetTrackIds.add(candidate.targetTrackId);
        return true;
    };
    // Pass 1: when source time is not pinned, diversify by source transition points first.
    if (input.sourceTimeMs === undefined) {
        const uniqueSourceTimes = new Set();
        sorted.forEach((candidate) => {
            if (reranked.length >= limit)
                return;
            if (uniqueSourceTimes.has(candidate.sourceTimeMs))
                return;
            if (includeCandidate(candidate)) {
                uniqueSourceTimes.add(candidate.sourceTimeMs);
            }
        });
    }
    // Pass 2: prefer different target tracks before duplicates.
    sorted.forEach((candidate) => {
        if (reranked.length >= limit)
            return;
        if (uniqueTargetTrackIds.has(candidate.targetTrackId))
            return;
        includeCandidate(candidate);
    });
    // Pass 3: fill remaining slots with next best unique candidates.
    sorted.forEach((candidate) => {
        if (reranked.length >= limit)
            return;
        includeCandidate(candidate);
    });
    return reranked;
}
async function runBaselineEvaluation(input = {}) {
    hydrateFromStorage();
    const limit = clamp(input.limit ?? 5, 1, 20);
    const goodThreshold = clamp(input.goodThreshold ?? 0.6, 0, 1);
    const readyTrackIds = Object.values(analysisStates)
        .filter((state) => state.status === 'ready')
        .map((state) => state.trackId);
    const seedTrackIds = (input.seedTrackIds ?? readyTrackIds)
        .map((trackId) => trackId.trim())
        .filter((trackId) => trackId.length > 0 && readyTrackIds.includes(trackId));
    const relevantTargetsBySeed = Object.fromEntries(Object.entries(input.relevantTargetsBySeed ?? {}).map(([seedTrackId, targetTrackIds]) => [
        seedTrackId.trim(),
        Array.from(new Set((Array.isArray(targetTrackIds) ? targetTrackIds : [])
            .map((targetTrackId) => targetTrackId.trim())
            .filter((targetTrackId) => targetTrackId.length > 0))),
    ]));
    let seedWithCandidates = 0;
    let labeledSeedCount = 0;
    let top1Total = 0;
    let topKMeanTotal = 0;
    let goodSeedCount = 0;
    let hitAt3Total = 0;
    let hitAt5Total = 0;
    for (const trackId of seedTrackIds) {
        const candidates = await findTransitionCandidates({ trackId, limit });
        const relevantTargetTrackIds = relevantTargetsBySeed[trackId] ?? [];
        if (relevantTargetTrackIds.length > 0) {
            labeledSeedCount += 1;
            hitAt3Total += (0, metrics_1.computeHitAtK)(candidates, relevantTargetTrackIds, 3);
            hitAt5Total += (0, metrics_1.computeHitAtK)(candidates, relevantTargetTrackIds, 5);
        }
        if (candidates.length === 0)
            continue;
        seedWithCandidates += 1;
        top1Total += candidates[0].score.finalScore;
        const topKMean = candidates.reduce((sum, candidate) => sum + candidate.score.finalScore, 0) /
            candidates.length;
        topKMeanTotal += topKMean;
        if (candidates.some((candidate) => candidate.score.finalScore >= goodThreshold)) {
            goodSeedCount += 1;
        }
    }
    const safeDiv = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;
    const result = {
        runAt: nowIsoString(),
        seedCount: seedTrackIds.length,
        seedWithCandidates,
        labeledSeedCount,
        coverageRate: safeDiv(seedWithCandidates, seedTrackIds.length),
        meanTop1Score: safeDiv(top1Total, seedWithCandidates),
        meanTopKScore: safeDiv(topKMeanTotal, seedWithCandidates),
        goodCandidateRate: safeDiv(goodSeedCount, seedWithCandidates),
        hitAt3: labeledSeedCount === 0 ? null : safeDiv(hitAt3Total, labeledSeedCount),
        hitAt5: labeledSeedCount === 0 ? null : safeDiv(hitAt5Total, labeledSeedCount),
        limit,
        goodThreshold,
    };
    baselineRunHistory = [
        ...baselineRunHistory,
        {
            ...result,
            seedTrackIds,
        },
    ].slice(-100);
    persistStorage();
    return result;
}
function getBaselineRunHistory(limit = 10) {
    hydrateFromStorage();
    const boundedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    return baselineRunHistory.slice(-boundedLimit).reverse();
}
function clearTransitionData() {
    analysisQueue = [];
    analysisStates = {};
    nodesByTrack = {};
    baselineRunHistory = [];
    isHydrated = true;
    removeStorage(STORAGE_KEYS.queue);
    removeStorage(STORAGE_KEYS.states);
    removeStorage(STORAGE_KEYS.nodes);
    removeStorage(STORAGE_KEYS.baselineRuns);
}
