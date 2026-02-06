import type { UnifiedTrack } from './provider';

export interface QueueItem {
  id: string;
  track: UnifiedTrack;
  source: 'library' | 'discovery' | 'manual';
  addedAt: number;
}

export interface QueueState {
  items: QueueItem[];
  currentIndex: number;
  history: QueueItem[];
}
