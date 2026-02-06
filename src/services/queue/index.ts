// Queue Service - Manage upcoming tracks

import type { QueueItem, QueueState } from '../../types/queue';
import type { UnifiedTrack } from '../../types/provider';

const STORAGE_KEY = 'moodverter_queue';
const MAX_QUEUE_ITEMS = 50;

function getDefaultState(): QueueState {
  return {
    items: [],
    currentIndex: -1,
    history: [],
  };
}

function loadQueueState(): QueueState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefaultState();
    const parsed = JSON.parse(stored) as QueueState;

    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      currentIndex: typeof parsed.currentIndex === 'number' ? parsed.currentIndex : -1,
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return getDefaultState();
  }
}

function saveQueueState(state: QueueState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore
  }
}

function generateQueueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createQueueManager(initialState?: QueueState) {
  let state: QueueState = initialState ?? loadQueueState();

  const persist = () => saveQueueState(state);

  return {
    addToQueue: (track: UnifiedTrack, source: QueueItem['source']): QueueItem => {
      const item: QueueItem = {
        id: generateQueueId(),
        track,
        source,
        addedAt: Date.now(),
      };

      const items = [...state.items, item].slice(0, MAX_QUEUE_ITEMS);
      state = { ...state, items, currentIndex: -1 };
      persist();
      return item;
    },

    removeFromQueue: (id: string): void => {
      state = {
        ...state,
        items: state.items.filter(item => item.id !== id),
        currentIndex: -1,
      };
      persist();
    },

    reorder: (fromIndex: number, toIndex: number): void => {
      if (fromIndex === toIndex) return;
      if (fromIndex < 0 || toIndex < 0) return;
      if (fromIndex >= state.items.length || toIndex >= state.items.length) return;

      const items = [...state.items];
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      state = { ...state, items, currentIndex: -1 };
      persist();
    },

    getNext: (): QueueItem | null => {
      if (state.items.length === 0) return null;
      const [next, ...rest] = state.items;
      state = {
        ...state,
        items: rest,
        history: [next, ...state.history],
        currentIndex: -1,
      };
      persist();
      return next;
    },

    getPrevious: (): QueueItem | null => {
      if (state.history.length === 0) return null;
      const [previous, ...rest] = state.history;
      state = {
        ...state,
        items: [previous, ...state.items],
        history: rest,
        currentIndex: -1,
      };
      persist();
      return previous;
    },

    clear: (): void => {
      state = getDefaultState();
      persist();
    },

    getState: (): QueueState => state,
  };
}

export function getInitialQueueState(): QueueState {
  return loadQueueState();
}

export function clearQueueState(): void {
  saveQueueState(getDefaultState());
}
