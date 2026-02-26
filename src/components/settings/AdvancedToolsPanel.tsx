import { useState, type ReactNode } from 'react';

export interface AdvancedToolsPanelProps {
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function AdvancedToolsPanel({
  children,
  defaultExpanded = false,
}: AdvancedToolsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <section className="bg-[var(--color-surface)] border border-white/10 p-3">
      <button
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
        className="w-full flex items-center justify-between gap-2 text-left"
        aria-expanded={isExpanded}
      >
        <div>
          <h3 className="text-xs uppercase tracking-wide text-[var(--color-text-secondary)]">
            Gelişmiş
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            Benchmark, dataset ve kalite araçları
          </p>
        </div>
        <span className="text-xs text-[var(--color-text-secondary)]">
          {isExpanded ? 'Kapat' : 'Aç'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          {children}
        </div>
      )}
    </section>
  );
}
