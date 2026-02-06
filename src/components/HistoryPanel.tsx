import type { HistoryEntry } from '../types/history';
import type { UnifiedTrack } from '../types/provider';

interface HistoryPanelProps {
  entries: HistoryEntry[];
  onPlay: (track: UnifiedTrack) => void;
  onClear: () => void;
}

export const HistoryPanel = ({ entries, onPlay, onClear }: HistoryPanelProps) => {
  const grouped = groupByDay(entries);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-2">
        <span className="text-xs text-[var(--color-text-primary)]">Gecmis</span>
        <button
          onClick={onClear}
          className="text-[10px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        >
          Sil
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="px-2 py-3 text-[10px] text-[var(--color-text-secondary)]">
          Henuz gecmis yok.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map((group) => (
            <div key={group.label}>
              <div className="px-2 text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">
                {group.label}
              </div>
              <div className="space-y-1 mt-1">
                {group.items.map((entry) => (
                  <button
                    key={`${entry.track.provider}:${entry.track.id}:${entry.playedAt}`}
                    onClick={() => onPlay(entry.track)}
                    className="w-full flex items-center justify-between px-2 py-1.5 bg-white/5 hover:bg-white/10 text-left"
                  >
                    <div className="min-w-0">
                      <div className="text-xs text-[var(--color-text-primary)] truncate">
                        {entry.track.name} - {entry.track.artist}
                      </div>
                      {entry.mood && (
                        <div className="text-[10px] text-[var(--color-text-secondary)] truncate">
                          Mood: {entry.mood}
                        </div>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--color-text-secondary)]">
                      {formatTime(entry.playedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function groupByDay(entries: HistoryEntry[]): Array<{ label: string; items: HistoryEntry[] }> {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const groups = new Map<string, HistoryEntry[]>();

  for (const entry of entries) {
    const date = new Date(entry.playedAt);
    const label = getDayLabel(date, today, yesterday);
    const list = groups.get(label) || [];
    list.push(entry);
    groups.set(label, list);
  }

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

function getDayLabel(date: Date, today: Date, yesterday: Date): string {
  if (isSameDay(date, today)) return 'Bugun';
  if (isSameDay(date, yesterday)) return 'Dun';

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}
