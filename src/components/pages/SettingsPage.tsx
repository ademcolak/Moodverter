import type { ReactNode } from 'react';
import { AdvancedToolsPanel } from '../settings/AdvancedToolsPanel';

export interface SettingsPageProps {
  advancedContent: ReactNode;
}

export function SettingsPage({ advancedContent }: SettingsPageProps) {
  return (
    <div className="h-full min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Settings</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Genel kullanıcı akışı sade tutulur. Veri ve benchmark araçları aşağıdaki gelişmiş bölümde yer alır.
        </p>
      </section>

      <AdvancedToolsPanel defaultExpanded={false}>
        {advancedContent}
      </AdvancedToolsPanel>
    </div>
  );
}
