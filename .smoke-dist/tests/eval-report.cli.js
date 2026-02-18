"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const transition_1 = require("../src/services/transition");
function parseArgs(argv) {
    const inputIndex = argv.findIndex((token) => token === '--input');
    if (inputIndex < 0)
        return { inputPath: null };
    const maybePath = argv[inputIndex + 1];
    return { inputPath: maybePath ? maybePath.trim() : null };
}
function normalizeAnalysisStates(raw) {
    if (!raw)
        return {};
    return Object.fromEntries(Object.entries(raw)
        .map(([trackId, state]) => {
        const normalizedTrackId = trackId.trim();
        if (!normalizedTrackId)
            return null;
        const status = state.status === 'ready' || state.status === 'failed' || state.status === 'pending'
            ? state.status
            : 'pending';
        return [normalizedTrackId, {
                trackId: normalizedTrackId,
                status,
                updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString(),
                version: Number.isFinite(state.version) ? Number(state.version) : 0,
            }];
    })
        .filter((entry) => entry !== null));
}
async function loadInputFile(filePath) {
    if (!filePath)
        return null;
    const absolutePath = node_path_1.default.isAbsolute(filePath)
        ? filePath
        : node_path_1.default.resolve(process.cwd(), filePath);
    const raw = await promises_1.default.readFile(absolutePath, 'utf-8');
    return JSON.parse(raw);
}
function printUsage() {
    console.log('Usage: pnpm run eval:report -- --input <path-to-json>');
    console.log('Input schema keys: seedTrackIds, analysisStates, relevanceMap, manualChecklistMap, requiredRelevantTargetsPerSeed');
}
async function main() {
    const { inputPath } = parseArgs(process.argv.slice(2));
    const envInputPath = process.env.EVAL_REPORT_INPUT?.trim() || null;
    const resolvedInputPath = inputPath || envInputPath;
    const inputFile = await loadInputFile(resolvedInputPath);
    if (!inputFile) {
        printUsage();
        console.log('No input provided. Rendering empty report.');
    }
    const report = (0, transition_1.buildEvaluationProgressReport)({
        seedTrackIds: inputFile?.seedTrackIds ?? [],
        analysisStates: normalizeAnalysisStates(inputFile?.analysisStates),
        relevanceMap: inputFile?.relevanceMap ?? {},
        manualChecklistMap: inputFile?.manualChecklistMap ?? {},
        requiredRelevantTargetsPerSeed: inputFile?.requiredRelevantTargetsPerSeed ?? 2,
    });
    console.log('Evaluation Progress Report');
    console.log(`GeneratedAt: ${report.generatedAt}`);
    console.log(`Ready: ${report.readySeedCount}/${report.totalSeedCount}`);
    console.log(`Label Gate: ${report.labelGatePassedSeedCount}/${report.totalSeedCount}`);
    console.log(`Checklist Gate: ${report.checklistGatePassedSeedCount}/${report.totalSeedCount}`);
    if (report.rows.length === 0) {
        console.log('No seed rows found.');
        return;
    }
    console.log('Rows:');
    report.rows.forEach((row) => {
        console.log(`- ${row.seedTrackId} | analysis=${row.analysisStatus} | labels=${row.relevantTargetCount}/${report.requiredRelevantTargetsPerSeed} | checklist=${row.checklistCompletedCount}/${row.checklistTotalCount} | ready=${row.readyForBaseline ? 'yes' : 'no'}`);
    });
}
void main().catch((error) => {
    console.error('eval:report failed:', error);
    process.exitCode = 1;
});
