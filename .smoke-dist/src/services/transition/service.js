"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TRANSITION_SCORE_WEIGHTS = exports.TRANSITION_SCORING_VERSION = void 0;
exports.scoreTransitionPair = scoreTransitionPair;
exports.explainTransitionPair = explainTransitionPair;
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
const BASELINE_RUN_SCHEMA_VERSION = 1;
exports.TRANSITION_SCORING_VERSION = 'v1';
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
exports.TRANSITION_SCORE_WEIGHTS = {
    ...SCORE_WEIGHTS,
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
function normalizeScopeId(scopeLabel, scopeId, seedTrackIds) {
    const normalizedScopeId = (scopeId ?? '').trim();
    if (normalizedScopeId.length > 0)
        return normalizedScopeId;
    if (scopeLabel !== 'custom')
        return scopeLabel;
    const sortedSeedIds = [...seedTrackIds].sort((a, b) => a.localeCompare(b));
    return `custom:${sortedSeedIds.join(',')}`;
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
function toOptionalFiniteRate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return clamp(value, 0, 1);
    }
    return null;
}
function parseTransitionScoreDriver(value) {
    if (value === 'event'
        || value === 'embedding'
        || value === 'rhythm'
        || value === 'loudness'
        || value === 'penalty') {
        return value;
    }
    return null;
}
function sanitizeBaselineSeedReport(value) {
    if (!value || typeof value !== 'object')
        return null;
    const entry = value;
    const trackId = typeof entry.trackId === 'string' ? entry.trackId.trim() : '';
    if (trackId.length === 0)
        return null;
    return {
        trackId,
        candidateCount: Math.max(0, Math.floor(toFiniteNumber(entry.candidateCount, 0))),
        top1Score: clamp(toFiniteNumber(entry.top1Score, 0), 0, 1),
        meanTopKScore: clamp(toFiniteNumber(entry.meanTopKScore, 0), 0, 1),
        hasGoodCandidate: Boolean(entry.hasGoodCandidate),
        hitAt3: toOptionalFiniteRate(entry.hitAt3),
        hitAt5: toOptionalFiniteRate(entry.hitAt5),
        averageEventMatchScore: clamp(toFiniteNumber(entry.averageEventMatchScore, 0), 0, 1),
        averageEmbeddingSimilarity: clamp(toFiniteNumber(entry.averageEmbeddingSimilarity, 0), 0, 1),
        averageRhythmAlignmentScore: clamp(toFiniteNumber(entry.averageRhythmAlignmentScore, 0), 0, 1),
        averageLoudnessContinuityScore: clamp(toFiniteNumber(entry.averageLoudnessContinuityScore, 0), 0, 1),
        averageArtifactPenalty: clamp(toFiniteNumber(entry.averageArtifactPenalty, 0), 0, 1),
        dominantDriver: parseTransitionScoreDriver(entry.dominantDriver),
    };
}
function sanitizeBaselineTuningAction(value) {
    if (!value || typeof value !== 'object')
        return null;
    const entry = value;
    const trackId = typeof entry.trackId === 'string' ? entry.trackId.trim() : '';
    const issue = parseTransitionScoreDriver(entry.issue);
    if (trackId.length === 0 || issue === null)
        return null;
    const recommendation = typeof entry.recommendation === 'string'
        ? entry.recommendation.trim()
        : '';
    if (recommendation.length === 0)
        return null;
    return {
        trackId,
        issue,
        recommendation,
        confidence: clamp(toFiniteNumber(entry.confidence, 0.5), 0, 1),
    };
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
        .map((run) => {
        const regressionDetected = Boolean(run.regressionDetected);
        const seedTrackIds = run.seedTrackIds
            .map((trackId) => trackId.trim())
            .filter((trackId) => trackId.length > 0);
        const scopeLabel = (run.scopeLabel ?? 'custom');
        const bottomSeeds = Array.isArray(run.bottomSeeds)
            ? run.bottomSeeds
                .map((seed) => sanitizeBaselineSeedReport(seed))
                .filter((seed) => seed !== null)
            : [];
        const tuningActions = Array.isArray(run.tuningActions)
            ? run.tuningActions
                .map((action) => sanitizeBaselineTuningAction(action))
                .filter((action) => action !== null)
            : [];
        return {
            ...run,
            schemaVersion: Math.max(1, Math.floor(Number(run.schemaVersion ?? BASELINE_RUN_SCHEMA_VERSION))),
            analysisVersion: Math.max(1, Math.floor(Number(run.analysisVersion ?? ANALYSIS_VERSION))),
            scopeLabel,
            scopeId: normalizeScopeId(scopeLabel, typeof run.scopeId === 'string' ? run.scopeId : undefined, seedTrackIds),
            bottomSeeds,
            tuningActions,
            regressionDetected,
            regressionSummary: typeof run.regressionSummary === 'string' ? run.regressionSummary : null,
            regressionGateEnforced: Boolean(run.regressionGateEnforced),
            regressionGatePassed: typeof run.regressionGatePassed === 'boolean'
                ? run.regressionGatePassed
                : !regressionDetected,
            requiredRelevantTargetsPerSeed: Math.max(1, Math.floor(Number(run.requiredRelevantTargetsPerSeed ?? 2))),
            relevanceTargetGateEnforced: Boolean(run.relevanceTargetGateEnforced),
            relevanceTargetGatePassed: typeof run.relevanceTargetGatePassed === 'boolean'
                ? run.relevanceTargetGatePassed
                : true,
            seedsBelowRelevantTargetMinimum: Array.isArray(run.seedsBelowRelevantTargetMinimum)
                ? run.seedsBelowRelevantTargetMinimum
                    .map((trackId) => (typeof trackId === 'string' ? trackId.trim() : ''))
                    .filter((trackId) => trackId.length > 0)
                : [],
            relevanceTargetGateSummary: typeof run.relevanceTargetGateSummary === 'string'
                ? run.relevanceTargetGateSummary
                : null,
            seedTrackIds,
        };
    })
        .slice(-100);
    nodesByTrack = Object.fromEntries(Object.entries(rawNodesByTrack).map(([trackId, nodes]) => [
        trackId,
        (Array.isArray(nodes) ? nodes : []).map((node) => sanitizeNode(trackId, node)),
    ]));
    // Requeue stale analyses when analysis version changes.
    const staleTrackIds = new Set();
    const nextAnalysisStates = {};
    Object.entries(analysisStates).forEach(([trackId, state]) => {
        const normalizedTrackId = trackId.trim();
        if (!normalizedTrackId)
            return;
        const normalizedStatus = state.status === 'ready' || state.status === 'failed' || state.status === 'pending'
            ? state.status
            : 'pending';
        const storedVersion = Number.isFinite(state.version) ? Number(state.version) : 0;
        if (storedVersion < ANALYSIS_VERSION) {
            staleTrackIds.add(normalizedTrackId);
            delete nodesByTrack[normalizedTrackId];
            nextAnalysisStates[normalizedTrackId] = {
                trackId: normalizedTrackId,
                status: 'pending',
                updatedAt: nowIsoString(),
                version: ANALYSIS_VERSION,
            };
            return;
        }
        nextAnalysisStates[normalizedTrackId] = {
            trackId: normalizedTrackId,
            status: normalizedStatus,
            updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : nowIsoString(),
            version: ANALYSIS_VERSION,
            ...(typeof state.errorMessage === 'string' ? { errorMessage: state.errorMessage } : {}),
        };
    });
    analysisStates = nextAnalysisStates;
    const queueSet = new Set(analysisQueue
        .map((trackId) => trackId.trim())
        .filter((trackId) => trackId.length > 0 && (trackId in nodesByTrack || trackId in analysisStates)));
    staleTrackIds.forEach((trackId) => queueSet.add(trackId));
    analysisQueue = [...queueSet];
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
function computeSeedScoreProfile(candidates) {
    if (candidates.length === 0) {
        return {
            averageEventMatchScore: 0,
            averageEmbeddingSimilarity: 0,
            averageRhythmAlignmentScore: 0,
            averageLoudnessContinuityScore: 0,
            averageArtifactPenalty: 0,
            dominantDriver: null,
        };
    }
    let eventTotal = 0;
    let embeddingTotal = 0;
    let rhythmTotal = 0;
    let loudnessTotal = 0;
    let penaltyTotal = 0;
    const driverCount = {
        event: 0,
        embedding: 0,
        rhythm: 0,
        loudness: 0,
        penalty: 0,
    };
    const driverOrder = ['penalty', 'event', 'embedding', 'rhythm', 'loudness'];
    candidates.forEach((candidate) => {
        eventTotal += candidate.score.eventMatchScore;
        embeddingTotal += candidate.score.embeddingSimilarity;
        rhythmTotal += candidate.score.rhythmAlignmentScore;
        loudnessTotal += candidate.score.loudnessContinuityScore;
        penaltyTotal += candidate.score.artifactPenalty;
        driverCount[candidate.diagnostic.primaryDriver] += 1;
    });
    const dominantDriver = driverOrder.reduce((best, current) => {
        if (best === null)
            return current;
        return driverCount[current] > driverCount[best] ? current : best;
    }, null);
    return {
        averageEventMatchScore: clamp(eventTotal / candidates.length, 0, 1),
        averageEmbeddingSimilarity: clamp(embeddingTotal / candidates.length, 0, 1),
        averageRhythmAlignmentScore: clamp(rhythmTotal / candidates.length, 0, 1),
        averageLoudnessContinuityScore: clamp(loudnessTotal / candidates.length, 0, 1),
        averageArtifactPenalty: clamp(penaltyTotal / candidates.length, 0, 1),
        dominantDriver,
    };
}
function pickSeedIssue(seed) {
    const weakestPositive = [
        { key: 'event', value: seed.averageEventMatchScore },
        { key: 'embedding', value: seed.averageEmbeddingSimilarity },
        { key: 'rhythm', value: seed.averageRhythmAlignmentScore },
        { key: 'loudness', value: seed.averageLoudnessContinuityScore },
    ].reduce((best, current) => (current.value < best.value ? current : best));
    if (seed.averageArtifactPenalty >= 0.55 && seed.averageArtifactPenalty > weakestPositive.value) {
        return 'penalty';
    }
    return weakestPositive.key;
}
function buildTuningRecommendation(issue) {
    if (issue === 'penalty') {
        return 'Artifact penalty yuksek; bpm/loudness toleranslarini yumusatip yeniden benchmark kos.';
    }
    if (issue === 'rhythm') {
        return 'Rhythm uyumu zayif; bpm hizalama katsayisini ve chroma etkisini arttirarak tekrar dene.';
    }
    if (issue === 'event') {
        return 'Event eslesmesi dusuk; event compatibility tablosunu bottom-seed event ciftlerine gore tune et.';
    }
    if (issue === 'embedding') {
        return 'Embedding benzerligi zayif; embedding agirligini kontrollu arttirip Hit@K etkisini olc.';
    }
    return 'Loudness surekliligi dusuk; loudness continuity agirligini ve transition volume envelope ayarlarini incele.';
}
function buildSeedTuningAction(seed) {
    const issue = pickSeedIssue(seed);
    const confidenceBase = issue === 'penalty'
        ? seed.averageArtifactPenalty
        : 1 - (issue === 'event'
            ? seed.averageEventMatchScore
            : issue === 'embedding'
                ? seed.averageEmbeddingSimilarity
                : issue === 'rhythm'
                    ? seed.averageRhythmAlignmentScore
                    : seed.averageLoudnessContinuityScore);
    return {
        trackId: seed.trackId,
        issue,
        recommendation: buildTuningRecommendation(issue),
        confidence: clamp(confidenceBase, 0, 1),
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
function scoreTransitionPair(sourceNode, targetNode) {
    const sourceTrackId = typeof sourceNode.trackId === 'string' && sourceNode.trackId.trim().length > 0
        ? sourceNode.trackId.trim()
        : '__source__';
    const targetTrackId = typeof targetNode.trackId === 'string' && targetNode.trackId.trim().length > 0
        ? targetNode.trackId.trim()
        : '__target__';
    const sanitizedSource = sanitizeNode(sourceTrackId, sourceNode);
    const sanitizedTarget = sanitizeNode(targetTrackId, targetNode);
    return scoreTransition(sanitizedSource, sanitizedTarget);
}
function explainTransitionPair(sourceNode, targetNode) {
    return buildScoreDiagnostic(scoreTransitionPair(sourceNode, targetNode));
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
                    sourceLoudnessRms: sourceNode.loudnessRms,
                    targetTrackId,
                    targetTimeMs: targetNode.timeMs,
                    targetLoudnessRms: targetNode.loudnessRms,
                    score,
                    diagnostic: buildScoreDiagnostic(score),
                    sourceEventType: sourceNode.eventType,
                    targetEventType: targetNode.eventType,
                });
            });
        });
    });
    const sorted = candidates.sort((a, b) => b.score.finalScore - a.score.finalScore);
    const reranked = [];
    const includedKeys = new Set();
    const uniqueTargetTrackIds = new Set();
    const targetUseCount = new Map();
    const eventPairUseCount = new Map();
    const driverUseCount = new Map();
    const getCandidateKey = (candidate) => `${candidate.targetTrackId}:${candidate.targetTimeMs}:${candidate.sourceTimeMs}`;
    const getEventPairKey = (candidate) => `${candidate.sourceEventType}->${candidate.targetEventType}`;
    const incrementMap = (counter, key) => {
        counter.set(key, (counter.get(key) ?? 0) + 1);
    };
    const includeCandidate = (candidate) => {
        const key = `${candidate.targetTrackId}:${candidate.targetTimeMs}:${candidate.sourceTimeMs}`;
        if (includedKeys.has(key))
            return false;
        reranked.push(candidate);
        includedKeys.add(key);
        uniqueTargetTrackIds.add(candidate.targetTrackId);
        incrementMap(targetUseCount, candidate.targetTrackId);
        incrementMap(eventPairUseCount, getEventPairKey(candidate));
        incrementMap(driverUseCount, candidate.diagnostic.primaryDriver);
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
    // Pass 3: hard-negative rerank. Prefer candidates that add diversity in target/event/driver.
    const remaining = sorted.filter((candidate) => !includedKeys.has(getCandidateKey(candidate)));
    while (reranked.length < limit && remaining.length > 0) {
        let bestIndex = 0;
        let bestAdjustedScore = Number.NEGATIVE_INFINITY;
        remaining.forEach((candidate, index) => {
            const targetPenalty = 0.08 * (targetUseCount.get(candidate.targetTrackId) ?? 0);
            const eventPairPenalty = 0.06 * (eventPairUseCount.get(getEventPairKey(candidate)) ?? 0);
            const driverPenalty = 0.04 * (driverUseCount.get(candidate.diagnostic.primaryDriver) ?? 0);
            const adjustedScore = candidate.score.finalScore - targetPenalty - eventPairPenalty - driverPenalty;
            if (adjustedScore > bestAdjustedScore) {
                bestAdjustedScore = adjustedScore;
                bestIndex = index;
            }
        });
        const [bestCandidate] = remaining.splice(bestIndex, 1);
        includeCandidate(bestCandidate);
    }
    return reranked.map(({ sourceEventType: _source, targetEventType: _target, ...candidate }) => candidate);
}
async function runBaselineEvaluation(input = {}) {
    hydrateFromStorage();
    const limit = clamp(input.limit ?? 5, 1, 20);
    const goodThreshold = clamp(input.goodThreshold ?? 0.6, 0, 1);
    const scopeLabel = input.scopeLabel ?? 'custom';
    const regressionGateEnforced = Boolean(input.enforceRegressionGate);
    const requiredRelevantTargetsPerSeed = Math.max(1, Math.floor(input.requiredRelevantTargetsPerSeed ?? 2));
    const relevanceTargetGateEnforced = Boolean(input.enforceRelevantTargetMinimum);
    const readyTrackIds = Object.values(analysisStates)
        .filter((state) => state.status === 'ready')
        .map((state) => state.trackId);
    const seedTrackIds = (input.seedTrackIds ?? readyTrackIds)
        .map((trackId) => trackId.trim())
        .filter((trackId) => trackId.length > 0 && readyTrackIds.includes(trackId));
    const scopeId = normalizeScopeId(scopeLabel, input.scopeId, seedTrackIds);
    const relevantTargetsBySeed = Object.fromEntries(Object.entries(input.relevantTargetsBySeed ?? {}).map(([seedTrackId, targetTrackIds]) => [
        seedTrackId.trim(),
        Array.from(new Set((Array.isArray(targetTrackIds) ? targetTrackIds : [])
            .map((targetTrackId) => targetTrackId.trim())
            .filter((targetTrackId) => targetTrackId.length > 0))),
    ]));
    const seedsBelowRelevantTargetMinimum = seedTrackIds.filter((trackId) => (relevantTargetsBySeed[trackId] ?? []).length < requiredRelevantTargetsPerSeed);
    let seedWithCandidates = 0;
    let labeledSeedCount = 0;
    let top1Total = 0;
    let topKMeanTotal = 0;
    let goodSeedCount = 0;
    let hitAt3Total = 0;
    let hitAt5Total = 0;
    const seedReports = [];
    for (const trackId of seedTrackIds) {
        const candidates = await findTransitionCandidates({ trackId, limit });
        const seedScoreProfile = computeSeedScoreProfile(candidates);
        const relevantTargetTrackIds = relevantTargetsBySeed[trackId] ?? [];
        let seedHitAt3 = null;
        let seedHitAt5 = null;
        if (relevantTargetTrackIds.length > 0) {
            seedHitAt3 = (0, metrics_1.computeHitAtK)(candidates, relevantTargetTrackIds, 3);
            seedHitAt5 = (0, metrics_1.computeHitAtK)(candidates, relevantTargetTrackIds, 5);
            labeledSeedCount += 1;
            hitAt3Total += seedHitAt3;
            hitAt5Total += seedHitAt5;
        }
        if (candidates.length === 0) {
            seedReports.push({
                trackId,
                candidateCount: 0,
                top1Score: 0,
                meanTopKScore: 0,
                hasGoodCandidate: false,
                hitAt3: seedHitAt3,
                hitAt5: seedHitAt5,
                averageEventMatchScore: seedScoreProfile.averageEventMatchScore,
                averageEmbeddingSimilarity: seedScoreProfile.averageEmbeddingSimilarity,
                averageRhythmAlignmentScore: seedScoreProfile.averageRhythmAlignmentScore,
                averageLoudnessContinuityScore: seedScoreProfile.averageLoudnessContinuityScore,
                averageArtifactPenalty: seedScoreProfile.averageArtifactPenalty,
                dominantDriver: seedScoreProfile.dominantDriver,
            });
            continue;
        }
        seedWithCandidates += 1;
        top1Total += candidates[0].score.finalScore;
        const topKMean = candidates.reduce((sum, candidate) => sum + candidate.score.finalScore, 0) /
            candidates.length;
        topKMeanTotal += topKMean;
        const hasGoodCandidate = candidates.some((candidate) => candidate.score.finalScore >= goodThreshold);
        if (hasGoodCandidate) {
            goodSeedCount += 1;
        }
        seedReports.push({
            trackId,
            candidateCount: candidates.length,
            top1Score: candidates[0].score.finalScore,
            meanTopKScore: topKMean,
            hasGoodCandidate,
            hitAt3: seedHitAt3,
            hitAt5: seedHitAt5,
            averageEventMatchScore: seedScoreProfile.averageEventMatchScore,
            averageEmbeddingSimilarity: seedScoreProfile.averageEmbeddingSimilarity,
            averageRhythmAlignmentScore: seedScoreProfile.averageRhythmAlignmentScore,
            averageLoudnessContinuityScore: seedScoreProfile.averageLoudnessContinuityScore,
            averageArtifactPenalty: seedScoreProfile.averageArtifactPenalty,
            dominantDriver: seedScoreProfile.dominantDriver,
        });
    }
    const safeDiv = (numerator, denominator) => denominator === 0 ? 0 : numerator / denominator;
    const bottomSeeds = seedReports
        .filter((seed) => seed.candidateCount > 0)
        .sort((a, b) => a.meanTopKScore - b.meanTopKScore || a.top1Score - b.top1Score)
        .slice(0, 3);
    const tuningActions = bottomSeeds.map((seed) => buildSeedTuningAction(seed));
    const previousComparableRun = [...baselineRunHistory]
        .reverse()
        .find((run) => run.scopeLabel === scopeLabel && run.scopeId === scopeId);
    const regressionReasons = [];
    if (previousComparableRun
        && previousComparableRun.hitAt3 !== null
        && previousComparableRun.hitAt5 !== null) {
        const nextHitAt3 = labeledSeedCount === 0 ? null : safeDiv(hitAt3Total, labeledSeedCount);
        const nextHitAt5 = labeledSeedCount === 0 ? null : safeDiv(hitAt5Total, labeledSeedCount);
        if (nextHitAt3 !== null && nextHitAt3 < previousComparableRun.hitAt3) {
            regressionReasons.push(`Hit@3 ${formatPercentLabel(previousComparableRun.hitAt3)} -> ${formatPercentLabel(nextHitAt3)}`);
        }
        if (nextHitAt5 !== null && nextHitAt5 < previousComparableRun.hitAt5) {
            regressionReasons.push(`Hit@5 ${formatPercentLabel(previousComparableRun.hitAt5)} -> ${formatPercentLabel(nextHitAt5)}`);
        }
    }
    const relevanceTargetGatePassed = seedsBelowRelevantTargetMinimum.length === 0;
    const relevanceTargetGateSummary = relevanceTargetGatePassed
        ? null
        : `Seed basina en az ${requiredRelevantTargetsPerSeed} relevant hedef gerekli. Eksik seed: ${seedsBelowRelevantTargetMinimum.join(', ')}`;
    const result = {
        schemaVersion: BASELINE_RUN_SCHEMA_VERSION,
        analysisVersion: ANALYSIS_VERSION,
        runAt: nowIsoString(),
        scopeLabel,
        scopeId,
        seedCount: seedTrackIds.length,
        seedWithCandidates,
        labeledSeedCount,
        coverageRate: safeDiv(seedWithCandidates, seedTrackIds.length),
        meanTop1Score: safeDiv(top1Total, seedWithCandidates),
        meanTopKScore: safeDiv(topKMeanTotal, seedWithCandidates),
        goodCandidateRate: safeDiv(goodSeedCount, seedWithCandidates),
        hitAt3: labeledSeedCount === 0 ? null : safeDiv(hitAt3Total, labeledSeedCount),
        hitAt5: labeledSeedCount === 0 ? null : safeDiv(hitAt5Total, labeledSeedCount),
        bottomSeeds,
        tuningActions,
        regressionDetected: regressionReasons.length > 0,
        regressionSummary: regressionReasons.length > 0 ? regressionReasons.join(' | ') : null,
        regressionGateEnforced,
        regressionGatePassed: !regressionGateEnforced || regressionReasons.length === 0,
        requiredRelevantTargetsPerSeed,
        relevanceTargetGateEnforced,
        relevanceTargetGatePassed,
        seedsBelowRelevantTargetMinimum,
        relevanceTargetGateSummary,
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
    if (result.regressionGateEnforced && !result.regressionGatePassed) {
        throw new Error(`Regression gate failed: ${result.regressionSummary ?? 'Hit@K degraded'}`);
    }
    if (result.relevanceTargetGateEnforced && !result.relevanceTargetGatePassed) {
        throw new Error(`Label quality gate failed: ${result.relevanceTargetGateSummary ?? 'Not enough relevant targets'}`);
    }
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
    isHydrated = false;
    removeStorage(STORAGE_KEYS.queue);
    removeStorage(STORAGE_KEYS.states);
    removeStorage(STORAGE_KEYS.nodes);
    removeStorage(STORAGE_KEYS.baselineRuns);
}
