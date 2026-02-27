import type { ReactNode } from 'react';

export interface AppFrameProps {
  title: string;
  children: ReactNode;
  playerBar: ReactNode;
  tabBar: ReactNode;
}

export function AppFrame({ title, children, playerBar, tabBar }: AppFrameProps) {
  return (
    <div className="w-full h-screen bg-[var(--color-background)] overflow-hidden flex flex-col border border-white/10">
      <div className="h-10 flex items-center px-4 bg-[var(--color-surface)] no-select cursor-default relative z-20 shrink-0 border-b border-white/10">
        <span
          data-tauri-drag-region
          className="text-sm font-semibold text-[var(--color-text-primary)] pointer-events-none"
        >
          {title}
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden p-4">
        {children}
      </div>

      <div className="shrink-0">
        {playerBar}
      </div>
      <div className="shrink-0">
        {tabBar}
      </div>
    </div>
  );
}
