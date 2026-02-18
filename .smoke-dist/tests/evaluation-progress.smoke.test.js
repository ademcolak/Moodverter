"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = __importDefault(require("node:test"));
const transition_1 = require("../src/services/transition");
(0, node_test_1.default)('buildEvaluationProgressReport aggregates readiness and gate gaps', () => {
    const analysisStates = {
        'seed-a': {
            trackId: 'seed-a',
            status: 'ready',
            updatedAt: '2026-02-17T00:00:00.000Z',
            version: 2,
        },
        'seed-b': {
            trackId: 'seed-b',
            status: 'pending',
            updatedAt: '2026-02-17T00:00:00.000Z',
            version: 2,
        },
    };
    const relevanceMap = {
        'seed-a': ['target-1', 'target-2'],
        'seed-b': ['target-3'],
    };
    const manualChecklistMap = {
        'seed-a': {
            transitionSmooth: true,
            timingAligned: true,
            loudnessAcceptable: true,
            eventContinuity: true,
            replayWorth: true,
            updatedAt: '2026-02-17T00:00:00.000Z',
        },
        'seed-b': {
            transitionSmooth: true,
            timingAligned: false,
            loudnessAcceptable: false,
            eventContinuity: false,
            replayWorth: false,
            updatedAt: '2026-02-17T00:00:00.000Z',
        },
    };
    const report = (0, transition_1.buildEvaluationProgressReport)({
        seedTrackIds: ['seed-a', 'seed-b', 'seed-c'],
        analysisStates,
        relevanceMap,
        manualChecklistMap,
        requiredRelevantTargetsPerSeed: 2,
    });
    strict_1.default.equal(report.totalSeedCount, 3);
    strict_1.default.equal(report.readySeedCount, 1);
    strict_1.default.equal(report.labelGatePassedSeedCount, 1);
    strict_1.default.equal(report.checklistGatePassedSeedCount, 1);
    strict_1.default.deepEqual(report.seedsMissingAnalysis, ['seed-b', 'seed-c']);
    strict_1.default.deepEqual(report.seedsNeedingLabels, ['seed-b', 'seed-c']);
    strict_1.default.deepEqual(report.seedsNeedingManualChecklist, ['seed-b', 'seed-c']);
    const readyRow = report.rows.find((row) => row.seedTrackId === 'seed-a');
    strict_1.default.ok(readyRow);
    if (!readyRow)
        throw new Error('ready row is missing');
    strict_1.default.equal(readyRow.readyForBaseline, true);
});
