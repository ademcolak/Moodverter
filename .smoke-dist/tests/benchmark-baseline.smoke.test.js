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
});
function buildSeedTrackIds(count) {
    return Array.from({ length: count }, (_, index) => `benchmark-seed-${index + 1}`);
}
(0, node_test_1.default)('benchmark baseline passes with 10-seed set and enforces regression gate on next run', async () => {
    const seedTrackIds = buildSeedTrackIds(10);
    for (const [index, trackId] of seedTrackIds.entries()) {
        await (0, transition_1.analyzeTrackWithHeuristicV1)({
            id: trackId,
            name: `Benchmark Seed ${index + 1}`,
            artist: 'Benchmark Artist',
            durationMs: 180000 + index * 2000,
        });
    }
    const firstRelevantTargetsBySeed = {};
    for (const seedTrackId of seedTrackIds) {
        const candidates = await (0, transition_1.findTransitionCandidates)({
            trackId: seedTrackId,
            limit: 5,
        });
        strict_1.default.ok(candidates.length >= 2);
        const uniqueTargets = Array.from(new Set(candidates.map((candidate) => candidate.targetTrackId)));
        if (uniqueTargets.length < 2) {
            const fallbackTargets = seedTrackIds.filter((trackId) => trackId !== seedTrackId).slice(0, 2);
            firstRelevantTargetsBySeed[seedTrackId] = fallbackTargets;
            continue;
        }
        firstRelevantTargetsBySeed[seedTrackId] = [uniqueTargets[0], uniqueTargets[1]];
    }
    const firstRun = await (0, transition_1.runBaselineEvaluation)({
        seedTrackIds,
        scopeLabel: 'custom',
        scopeId: 'benchmark-v1',
        limit: 5,
        enforceRelevantTargetMinimum: true,
        requiredRelevantTargetsPerSeed: 2,
        relevantTargetsBySeed: firstRelevantTargetsBySeed,
    });
    strict_1.default.equal(firstRun.seedCount, 10);
    strict_1.default.equal(firstRun.scopeId, 'benchmark-v1');
    strict_1.default.equal(firstRun.relevanceTargetGatePassed, true);
    strict_1.default.equal(firstRun.regressionDetected, false);
    const degradedRelevantTargetsBySeed = Object.fromEntries(seedTrackIds.map((trackId) => [trackId, ['missing-target-a', 'missing-target-b']]));
    await strict_1.default.rejects((0, transition_1.runBaselineEvaluation)({
        seedTrackIds,
        scopeLabel: 'custom',
        scopeId: 'benchmark-v1',
        limit: 5,
        enforceRegressionGate: true,
        enforceRelevantTargetMinimum: true,
        requiredRelevantTargetsPerSeed: 2,
        relevantTargetsBySeed: degradedRelevantTargetsBySeed,
    }), /Regression gate failed/);
});
