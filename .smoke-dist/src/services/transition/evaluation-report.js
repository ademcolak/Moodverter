"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildEvaluationProgressReport = buildEvaluationProgressReport;
const manual_checklist_1 = require("./manual-checklist");
function nowIsoString() {
    return new Date().toISOString();
}
function normalizeId(id) {
    return id.trim();
}
function normalizeSeedTrackIds(ids) {
    const unique = new Set();
    ids.forEach((id) => {
        const normalized = normalizeId(id);
        if (normalized.length > 0)
            unique.add(normalized);
    });
    return [...unique];
}
function buildEvaluationProgressReport(input) {
    const requiredRelevantTargetsPerSeed = Math.max(1, Math.floor(input.requiredRelevantTargetsPerSeed ?? 2));
    const seedTrackIds = normalizeSeedTrackIds(input.seedTrackIds);
    const rows = seedTrackIds
        .map((seedTrackId) => {
        const analysisStatus = input.analysisStates[seedTrackId]?.status ?? 'missing';
        const relevantTargetCount = (input.relevanceMap[seedTrackId] ?? []).length;
        const checklistCompletedCount = (0, manual_checklist_1.countCompletedManualListeningChecklistItems)(input.manualChecklistMap[seedTrackId] ?? {
            transitionSmooth: false,
            timingAligned: false,
            loudnessAcceptable: false,
            eventContinuity: false,
            replayWorth: false,
            updatedAt: '',
        });
        const passesLabelGate = relevantTargetCount >= requiredRelevantTargetsPerSeed;
        const passesManualChecklistGate = checklistCompletedCount >= manual_checklist_1.MANUAL_LISTENING_CHECKLIST_ITEM_COUNT;
        const readyForBaseline = analysisStatus === 'ready' && passesLabelGate && passesManualChecklistGate;
        return {
            seedTrackId,
            analysisStatus,
            relevantTargetCount,
            checklistCompletedCount,
            checklistTotalCount: manual_checklist_1.MANUAL_LISTENING_CHECKLIST_ITEM_COUNT,
            passesLabelGate,
            passesManualChecklistGate,
            readyForBaseline,
        };
    })
        .sort((a, b) => a.seedTrackId.localeCompare(b.seedTrackId));
    const seedsNeedingLabels = rows
        .filter((row) => !row.passesLabelGate)
        .map((row) => row.seedTrackId);
    const seedsNeedingManualChecklist = rows
        .filter((row) => !row.passesManualChecklistGate)
        .map((row) => row.seedTrackId);
    const seedsMissingAnalysis = rows
        .filter((row) => row.analysisStatus !== 'ready')
        .map((row) => row.seedTrackId);
    return {
        generatedAt: nowIsoString(),
        requiredRelevantTargetsPerSeed,
        totalSeedCount: rows.length,
        readySeedCount: rows.filter((row) => row.readyForBaseline).length,
        labelGatePassedSeedCount: rows.filter((row) => row.passesLabelGate).length,
        checklistGatePassedSeedCount: rows.filter((row) => row.passesManualChecklistGate).length,
        seedsNeedingLabels,
        seedsNeedingManualChecklist,
        seedsMissingAnalysis,
        rows,
    };
}
