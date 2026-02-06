import { useEffect, useRef, useState } from 'react';

const SHORTCUTS = [
  { key: 'Space', label: 'Cal / Duraklat' },
  { key: '→', label: 'Sonraki sarki' },
  { key: '←', label: 'Onceki sarki' },
  { key: 'S', label: 'Ayarlari ac' },
  { key: '/', label: 'Mood girisine odaklan' },
  { key: 'Esc', label: 'Pencereyi kapat' },
];

export const KeyboardHelp = () => {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener('mousedown', handleClick);
    }

    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={panelRef} className="fixed bottom-4 right-4 z-40">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-8 h-8 bg-[var(--color-surface)] border border-white/10 text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
        aria-label="Klavye kisayollari"
      >
        ?
      </button>

      {open && (
        <div className="absolute bottom-10 right-0 w-52 bg-[var(--color-surface)] border border-white/10 shadow-xl">
          <div className="px-3 py-2 border-b border-white/5 text-xs text-[var(--color-text-primary)]">
            ⌨️ Klavye Kisayollari
          </div>
          <div className="p-2 space-y-1">
            {SHORTCUTS.map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-text-secondary)]">{shortcut.key}</span>
                <span className="text-[var(--color-text-primary)]">{shortcut.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
