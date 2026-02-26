export interface HistoryPageProps {
  title?: string;
}

export function HistoryPage({ title = 'History' }: HistoryPageProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col gap-4">
      <section className="bg-[var(--color-surface)] border border-white/10 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Yakında: geçiş geçmişi, oynatma geçmişi ve run geçmişi burada görünecek.
        </p>
      </section>
      <section className="bg-[var(--color-surface)] border border-white/10 p-4 flex-1 min-h-0 flex items-center justify-center">
        <div className="text-sm text-[var(--color-text-secondary)]">Henüz gösterilecek kayıt yok.</div>
      </section>
    </div>
  );
}
