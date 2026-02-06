import { useEffect } from 'react';

interface KeyboardShortcuts {
  Space: () => void;
  ArrowRight: () => void;
  ArrowLeft: () => void;
  ArrowUp: () => void;
  ArrowDown: () => void;
  m: () => void;
  Escape: () => void;
  s: () => void;
  '/': () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
}

export function useKeyboardShortcuts(shortcuts: Partial<KeyboardShortcuts>) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.code === 'Space'
        ? 'Space'
        : (e.key.length === 1 ? e.key.toLowerCase() : e.key);

      const handler = shortcuts[key as keyof KeyboardShortcuts];
      if (!handler) return;

      if (isTypingTarget(e.target) && key !== 'Escape') {
        return;
      }

      e.preventDefault();
      handler();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
