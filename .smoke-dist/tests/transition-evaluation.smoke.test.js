"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importStar(require("node:test"));
const transition_1 = require("../src/services/transition");
const browser_mocks_1 = require("./helpers/browser-mocks");
(0, node_test_1.before)(() => {
    (0, browser_mocks_1.installBrowserMocks)();
});
(0, node_test_1.beforeEach)(() => {
    (0, browser_mocks_1.resetBrowserMocks)();
    (0, transition_1.clearTransitionData)();
    (0, transition_1.clearTransitionRelevanceMap)();
});
(0, node_test_1.default)('runBaselineEvaluation computes Hit@3/5 when labeled relevance exists', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-1',
        name: 'Seed Track',
        artist: 'Seed Artist',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-a',
        name: 'Target A',
        artist: 'Target Artist A',
        durationMs: 185000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-b',
        name: 'Target B',
        artist: 'Target Artist B',
        durationMs: 190000,
    });
    const candidates = await (0, transition_1.findTransitionCandidates)({ trackId: 'seed-track-1', limit: 5 });
    const expectedHitAt3 = (0, transition_1.computeHitAtK)(candidates, ['target-track-a'], 3);
    const expectedHitAt5 = (0, transition_1.computeHitAtK)(candidates, ['target-track-a'], 5);
    const result = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-1'],
        limit: 5,
        relevantTargetsBySeed: {
            'seed-track-1': ['target-track-a'],
        },
    });
    strict_1.default.equal(result.seedCount, 1);
    strict_1.default.equal(result.labeledSeedCount, 1);
    strict_1.default.equal(result.hitAt3, expectedHitAt3);
    strict_1.default.equal(result.hitAt5, expectedHitAt5);
});
(0, node_test_1.default)('runBaselineEvaluation returns null Hit@K when no labels are provided', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-2',
        name: 'Seed Track 2',
        artist: 'Seed Artist 2',
        durationMs: 175000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-c',
        name: 'Target C',
        artist: 'Target Artist C',
        durationMs: 170000,
    });
    const result = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-2'],
        limit: 5,
    });
    strict_1.default.equal(result.labeledSeedCount, 0);
    strict_1.default.equal(result.hitAt3, null);
    strict_1.default.equal(result.hitAt5, null);
});
(0, node_test_1.default)('findTransitionCandidates respects pinned source moment', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-pin',
        name: 'Seed Track Pin',
        artist: 'Seed Artist Pin',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-pin-a',
        name: 'Target Track Pin A',
        artist: 'Target Artist Pin A',
        durationMs: 176000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-pin-b',
        name: 'Target Track Pin B',
        artist: 'Target Artist Pin B',
        durationMs: 188000,
    });
    const seedNodes = (0, transition_1.getAnalyzedNodes)('seed-track-pin');
    strict_1.default.ok(seedNodes.length > 0);
    const requestedSourceTimeMs = 95000;
    const expectedSourceNode = seedNodes.reduce((nearest, current) => {
        const currentDiff = Math.abs(current.timeMs - requestedSourceTimeMs);
        const nearestDiff = Math.abs(nearest.timeMs - requestedSourceTimeMs);
        return currentDiff < nearestDiff ? current : nearest;
    });
    const pinnedCandidates = await (0, transition_1.findTransitionCandidates)({
        trackId: 'seed-track-pin',
        sourceTimeMs: requestedSourceTimeMs,
        limit: 5,
    });
    strict_1.default.ok(pinnedCandidates.length > 0);
    const uniqueSourceTimes = new Set(pinnedCandidates.map((candidate) => candidate.sourceTimeMs));
    strict_1.default.equal(uniqueSourceTimes.size, 1);
    strict_1.default.equal(pinnedCandidates[0].sourceTimeMs, expectedSourceNode.timeMs);
});
(0, node_test_1.default)('hydrateFromStorage requeues stale analysis version for automatic reanalysis', () => {
    const trackId = 'seed-track-stale';
    localStorage.setItem('moodverter_transition_analysis_queue', JSON.stringify([]));
    localStorage.setItem('moodverter_transition_analysis_states', JSON.stringify({
        [trackId]: {
            trackId,
            status: 'ready',
            updatedAt: '2026-02-09T00:00:00.000Z',
            version: 1,
        },
    }));
    localStorage.setItem('moodverter_transition_nodes', JSON.stringify({
        [trackId]: [{
                id: `${trackId}:1000`,
                trackId,
                timeMs: 1000,
                eventType: 'drop',
                eventConfidence: 0.95,
                embedding: Array.from({ length: 16 }, () => 0.4),
                bpmLocal: 124,
                chroma: Array.from({ length: 12 }, () => 0.3),
                loudnessRms: -10,
            }],
    }));
    const state = (0, transition_1.getAnalysisState)(trackId);
    const queue = (0, transition_1.getAnalysisQueue)();
    const nodes = (0, transition_1.getAnalyzedNodes)(trackId);
    strict_1.default.ok(state);
    strict_1.default.equal(state.status, 'pending');
    strict_1.default.equal(state.version, 2);
    strict_1.default.deepEqual(queue, [trackId]);
    strict_1.default.equal(nodes.length, 0);
});
(0, node_test_1.default)('relevance map helpers add and remove targets without duplicates', () => {
    let map = (0, transition_1.addRelevantTarget)('seed-track-3', 'target-track-d');
    map = (0, transition_1.addRelevantTarget)('seed-track-3', 'target-track-d');
    strict_1.default.deepEqual(map['seed-track-3'], ['target-track-d']);
    strict_1.default.deepEqual((0, transition_1.getTransitionRelevanceMap)()['seed-track-3'], ['target-track-d']);
    map = (0, transition_1.removeRelevantTarget)('seed-track-3', 'target-track-d');
    strict_1.default.equal(map['seed-track-3'], undefined);
});
(0, node_test_1.default)('baseline run history persists latest runs', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-history',
        name: 'Seed Track History',
        artist: 'Seed Artist History',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-history',
        name: 'Target Track History',
        artist: 'Target Artist History',
        durationMs: 182000,
    });
    const first = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-history'],
        limit: 5,
        scopeLabel: 'selected',
    });
    const second = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-history'],
        limit: 3,
        scopeLabel: 'selected',
    });
    const history = (0, transition_1.getBaselineRunHistory)(5);
    strict_1.default.equal(history.length, 2);
    strict_1.default.equal(history[0].runAt, second.runAt);
    strict_1.default.equal(history[1].runAt, first.runAt);
    strict_1.default.deepEqual(history[0].seedTrackIds, ['seed-track-history']);
    strict_1.default.equal(history[0].scopeLabel, 'selected');
});
(0, node_test_1.default)('baseline evaluation reports bottom seeds and detects Hit@K regression per scope', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-regression',
        name: 'Seed Track Regression',
        artist: 'Seed Artist Regression',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-regression-a',
        name: 'Target Track Regression A',
        artist: 'Target Artist Regression A',
        durationMs: 182000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-regression-b',
        name: 'Target Track Regression B',
        artist: 'Target Artist Regression B',
        durationMs: 184000,
    });
    const candidates = await (0, transition_1.findTransitionCandidates)({
        trackId: 'seed-track-regression',
        limit: 5,
    });
    strict_1.default.ok(candidates.length > 0);
    const firstResult = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-regression'],
        limit: 5,
        scopeLabel: 'all',
        relevantTargetsBySeed: {
            'seed-track-regression': [candidates[0].targetTrackId],
        },
    });
    strict_1.default.equal(firstResult.regressionDetected, false);
    strict_1.default.equal(firstResult.bottomSeeds.length, 1);
    strict_1.default.equal(firstResult.bottomSeeds[0].trackId, 'seed-track-regression');
    const secondResult = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-regression'],
        limit: 5,
        scopeLabel: 'all',
        relevantTargetsBySeed: {
            'seed-track-regression': ['missing-track-id'],
        },
    });
    strict_1.default.equal(secondResult.regressionDetected, true);
    strict_1.default.ok(secondResult.regressionSummary?.includes('Hit@3'));
});
(0, node_test_1.default)('regression gate rejects baseline run when enforced and Hit@K drops', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-gate',
        name: 'Seed Track Gate',
        artist: 'Seed Artist Gate',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-gate-a',
        name: 'Target Track Gate A',
        artist: 'Target Artist Gate A',
        durationMs: 181000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-gate-b',
        name: 'Target Track Gate B',
        artist: 'Target Artist Gate B',
        durationMs: 183000,
    });
    const candidates = await (0, transition_1.findTransitionCandidates)({
        trackId: 'seed-track-gate',
        limit: 5,
    });
    strict_1.default.ok(candidates.length > 0);
    await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-gate'],
        limit: 5,
        scopeLabel: 'all',
        relevantTargetsBySeed: {
            'seed-track-gate': [candidates[0].targetTrackId],
        },
    });
    await strict_1.default.rejects((0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-gate'],
        limit: 5,
        scopeLabel: 'all',
        enforceRegressionGate: true,
        relevantTargetsBySeed: {
            'seed-track-gate': ['missing-track-id'],
        },
    }), /Regression gate failed/);
});
(0, node_test_1.default)('relevance target gate rejects baseline run when enforced and labels are insufficient', async () => {
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'seed-track-label-gate',
        name: 'Seed Track Label Gate',
        artist: 'Seed Artist Label Gate',
        durationMs: 180000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-label-gate-a',
        name: 'Target Track Label Gate A',
        artist: 'Target Artist Label Gate A',
        durationMs: 181000,
    });
    await (0, transition_1.analyzeTrackWithHeuristicV1)({
        id: 'target-track-label-gate-b',
        name: 'Target Track Label Gate B',
        artist: 'Target Artist Label Gate B',
        durationMs: 182000,
    });
    await strict_1.default.rejects((0, transition_1.runBaselineEvaluation)({
        seedTrackIds: ['seed-track-label-gate'],
        limit: 5,
        scopeLabel: 'selected',
        requiredRelevantTargetsPerSeed: 2,
        enforceRelevantTargetMinimum: true,
        relevantTargetsBySeed: {
            'seed-track-label-gate': ['target-track-label-gate-a'],
        },
    }), /Label quality gate failed/);
});
