"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const browser_mocks_1 = require("./helpers/browser-mocks");
const transition_1 = require("../src/services/transition");
(0, browser_mocks_1.installBrowserMocks)();
node_test_1.default.beforeEach(() => {
    (0, browser_mocks_1.resetBrowserMocks)();
});
(0, node_test_1.default)('benchmark seed helpers persist unique normalized ids', () => {
    const first = (0, transition_1.setBenchmarkSeedTrackIds)([' seed-1 ', 'seed-2', 'seed-1', '']);
    strict_1.default.deepEqual(first, ['seed-1', 'seed-2']);
    strict_1.default.deepEqual((0, transition_1.getBenchmarkSeedTrackIds)(), ['seed-1', 'seed-2']);
    const second = (0, transition_1.addBenchmarkSeedTrackId)(' seed-3 ');
    strict_1.default.deepEqual(second, ['seed-1', 'seed-2', 'seed-3']);
    const third = (0, transition_1.removeBenchmarkSeedTrackId)('seed-2');
    strict_1.default.deepEqual(third, ['seed-1', 'seed-3']);
});
(0, node_test_1.default)('benchmark seed helpers can clear storage', () => {
    (0, transition_1.setBenchmarkSeedTrackIds)(['seed-a']);
    (0, transition_1.clearBenchmarkSeedTrackIds)();
    strict_1.default.deepEqual((0, transition_1.getBenchmarkSeedTrackIds)(), []);
});
