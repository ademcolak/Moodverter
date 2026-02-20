import type { UnifiedTrack } from '../../types/provider';
import type { AnalysisState } from './types';
import type { TransitionRelevanceMap } from './relevance';

export interface BenchmarkSeedSelectionInput {
  existingSeedTrackIds: string[];
  sortedLibrary: UnifiedTrack[];
  analysisStates: Record<string, AnalysisState>;
  relevanceMap: TransitionRelevanceMap;
  requiredRelevantTargetsPerSeed: number;
  targetSeedCount: number;
}

export interface RelevantTargetGap {
  trackId: string;
  relevantTargetCount: number;
  missingTargetCount: number;
}

export interface ResolveBenchmarkSeedTargetCountInput {
  eligibleSeedCount: number;
  minimumSeedCount: number;
  preferredSeedCount: number;
}

function normalizeTrackIds(trackIds: string[]): string[] {
  const unique = new Set<string>();
  trackIds.forEach((trackId) => {
    const normalized = trackId.trim();
    if (normalized.length > 0) unique.add(normalized);
  });
  return [...unique];
}

export function buildBenchmarkSeedSelection(input: BenchmarkSeedSelectionInput): string[] {
  const targetSeedCount = Math.max(1, Math.floor(input.targetSeedCount));
  const eligibleTrackIds = input.sortedLibrary
    .map((track) => track.id)
    .filter((trackId) =>
      input.analysisStates[trackId]?.status === 'ready'
      && (input.relevanceMap[trackId] ?? []).length >= input.requiredRelevantTargetsPerSeed
    );
  const eligibleSet = new Set(eligibleTrackIds);
  const prioritizedExisting = normalizeTrackIds(input.existingSeedTrackIds)
    .filter((trackId) => eligibleSet.has(trackId));

  const merged = [
    ...prioritizedExisting,
    ...eligibleTrackIds.filter((trackId) => !prioritizedExisting.includes(trackId)),
  ];
  return merged.slice(0, targetSeedCount);
}

export function buildRelevantTargetGaps(
  seedTrackIds: string[],
  relevanceMap: TransitionRelevanceMap,
  requiredRelevantTargetsPerSeed: number
): RelevantTargetGap[] {
  return normalizeTrackIds(seedTrackIds)
    .map((trackId) => {
      const relevantTargetCount = (relevanceMap[trackId] ?? []).length;
      const missingTargetCount = Math.max(0, requiredRelevantTargetsPerSeed - relevantTargetCount);
      return {
        trackId,
        relevantTargetCount,
        missingTargetCount,
      };
    })
    .filter((gap) => gap.missingTargetCount > 0)
    .sort((a, b) => b.missingTargetCount - a.missingTargetCount || a.trackId.localeCompare(b.trackId));
}

export function resolveBenchmarkSeedTargetCount(
  input: ResolveBenchmarkSeedTargetCountInput
): number {
  const minimumSeedCount = Math.max(1, Math.floor(input.minimumSeedCount));
  const preferredSeedCount = Math.max(minimumSeedCount, Math.floor(input.preferredSeedCount));
  const eligibleSeedCount = Math.max(0, Math.floor(input.eligibleSeedCount));

  if (eligibleSeedCount < minimumSeedCount) {
    return minimumSeedCount;
  }
  return Math.min(preferredSeedCount, eligibleSeedCount);
}
