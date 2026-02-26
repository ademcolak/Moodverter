const TABS = [
  { id: 'library', label: 'Kütüphane' },
  { id: 'transition', label: 'Transition' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
] as const;

export type BottomTabId = (typeof TABS)[number]['id'];

export interface BottomTabBarProps {
  activeTab: BottomTabId;
  onSelectTab: (tab: BottomTabId) => void;
}

export function BottomTabBar({ activeTab, onSelectTab }: BottomTabBarProps) {
  return (
    <nav
      aria-label="Ana sekmeler"
      className="border-t border-white/10 bg-[var(--color-surface)] px-2 py-2.5"
    >
      <div className="grid grid-cols-4 gap-2">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`px-2 py-2.5 min-h-10 text-[11px] border transition-colors ${
                isActive
                  ? 'border-[var(--color-primary)] text-white bg-[var(--color-primary)]/15'
                  : 'border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
