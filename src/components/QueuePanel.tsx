import { useState } from 'react';
import type { QueueItem } from '../types/queue';

interface QueuePanelProps {
  items: QueueItem[];
  onPlay: (item: QueueItem) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const QueuePanel = ({
  items,
  onPlay,
  onRemove,
  onClear,
  onReorder,
  collapsed,
  onToggleCollapse,
}: QueuePanelProps) => {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }

    onReorder(dragIndex, targetIndex);
    setDragIndex(null);
  };

  return (
    <div className="bg-[var(--color-surface)] border border-white/10">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-1 text-xs text-[var(--color-text-primary)]"
          title={collapsed ? 'Genislet' : 'Daralt'}
        >
          <svg
            className={`w-3 h-3 transition-transform ${collapsed ? '-rotate-90' : 'rotate-0'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span>
            Siradaki ({items.length})
          </span>
        </button>

        <button
          onClick={onClear}
          className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          disabled={items.length === 0}
        >
          Temizle
        </button>
      </div>

      {!collapsed && (
        <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-2 py-3 text-[10px] text-[var(--color-text-secondary)]">
              Sira bos.
            </div>
          ) : (
            items.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(index)}
                className="w-full flex items-center gap-2 px-2 py-1.5 bg-white/5 hover:bg-white/10"
              >
                <span className="text-[10px] text-[var(--color-text-secondary)] cursor-grab" title="Surukle birak">
                  ≡
                </span>

                <button
                  onClick={() => onPlay(item)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-xs text-[var(--color-text-primary)] truncate">
                    {index + 1}. {item.track.name}
                  </div>
                  <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                    {item.track.artist}
                  </div>
                </button>

                <button
                  onClick={() => onRemove(item.id)}
                  className="p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                  title="Siradan cikar"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
