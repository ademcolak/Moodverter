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
(0, node_test_1.default)('relevance map helpers add and remove targets without duplicates', () => {
    let map = (0, transition_1.addRelevantTarget)('seed-track-3', 'target-track-d');
    map = (0, transition_1.addRelevantTarget)('seed-track-3', 'target-track-d');
    strict_1.default.deepEqual(map['seed-track-3'], ['target-track-d']);
    strict_1.default.deepEqual((0, transition_1.getTransitionRelevanceMap)()['seed-track-3'], ['target-track-d']);
    map = (0, transition_1.removeRelevantTarget)('seed-track-3', 'target-track-d');
    strict_1.default.equal(map['seed-track-3'], undefined);
});
