import type { UnifiedTrack } from './provider';

export type DecisionSource =
  | 'manual'
  | 'queue'
  | 'library_selector'
  | 'library_fallback'
  | 'discovery_auto'
  | 'discovery_suggest'
  | 'unknown';

export interface HistoryEntry {
  track: UnifiedTrack;
  playedAt: number;
  listenDuration: number;
  completedPercent: number;
  mood?: string;
  source: 'library' | 'discovery';
  decisionSource?: DecisionSource;
  algorithmVersion?: string;
}
