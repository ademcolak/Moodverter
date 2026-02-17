import type { AnalysisState } from './types';
import type { TransitionRelevanceMap } from './relevance';
import {
  MANUAL_LISTENING_CHECKLIST_ITEM_COUNT,
  countCompletedManualListeningChecklistItems,
  type ManualListeningChecklistMap,
} from './manual-checklist';

export interface EvaluationProgressSeedRow {
  seedTrackId: string;
  analysisStatus: AnalysisState['status'] | 'missing';
  relevantTargetCount: number;
  checklistCompletedCount: number;
  checklistTotalCount: number;
  passesLabelGate: boolean;
  passesManualChecklistGate: boolean;
  readyForBaseline: boolean;
}

export interface EvaluationProgressReport {
  generatedAt: string;
  requiredRelevantTargetsPerSeed: number;
  totalSeedCount: number;
  readySeedCount: number;
  labelGatePassedSeedCount: number;
  checklistGatePassedSeedCount: number;
  seedsNeedingLabels: string[];
  seedsNeedingManualChecklist: string[];
  seedsMissingAnalysis: string[];
  rows: EvaluationProgressSeedRow[];
}

interface BuildEvaluationProgressReportInput {
  seedTrackIds: string[];
  analysisStates: Record<string, AnalysisState>;
  relevanceMap: TransitionRelevanceMap;
  manualChecklistMap: ManualListeningChecklistMap;
  requiredRelevantTargetsPerSeed?: number;
}

function nowIsoString(): string {
  return new Date().toISOString();
}

function normalizeId(id: string): string {
  return id.trim();
}

function normalizeSeedTrackIds(ids: string[]): string[] {
  const unique = new Set<string>();
  ids.forEach((id) => {
    const normalized = normalizeId(id);
    if (normalized.length > 0) unique.add(normalized);
  });
  return [...unique];
}

export function buildEvaluationProgressReport(
  input: BuildEvaluationProgressReportInput
): EvaluationProgressReport {
  const requiredRelevantTargetsPerSeed = Math.max(
    1,
    Math.floor(input.requiredRelevantTargetsPerSeed ?? 2)
  );

  const seedTrackIds = normalizeSeedTrackIds(input.seedTrackIds);
  const rows: EvaluationProgressSeedRow[] = seedTrackIds
    .map((seedTrackId) => {
      const analysisStatus = input.analysisStates[seedTrackId]?.status ?? 'missing';
      const relevantTargetCount = (input.relevanceMap[seedTrackId] ?? []).length;
      const checklistCompletedCount = countCompletedManualListeningChecklistItems(
        input.manualChecklistMap[seedTrackId] ?? {
          transitionSmooth: false,
          timingAligned: false,
          loudnessAcceptable: false,
          eventContinuity: false,
          replayWorth: false,
          updatedAt: '',
        }
      );
      const passesLabelGate = relevantTargetCount >= requiredRelevantTargetsPerSeed;
      const passesManualChecklistGate = checklistCompletedCount >= MANUAL_LISTENING_CHECKLIST_ITEM_COUNT;
      const readyForBaseline = analysisStatus === 'ready' && passesLabelGate && passesManualChecklistGate;

      return {
        seedTrackId,
        analysisStatus,
        relevantTargetCount,
        checklistCompletedCount,
        checklistTotalCount: MANUAL_LISTENING_CHECKLIST_ITEM_COUNT,
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
