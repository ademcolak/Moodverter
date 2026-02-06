import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface InfoTooltipProps {
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  variant?: 'info' | 'warning' | 'tip';
  learnMoreUrl?: string;
}

const VARIANT_STYLES: Record<NonNullable<InfoTooltipProps['variant']>, string> = {
  info: 'border-blue-500/30 bg-blue-500/10 text-blue-100',
  warning: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-100',
  tip: 'border-green-500/30 bg-green-500/10 text-green-100',
};

export const InfoTooltip = ({
  title,
  description,
  position = 'top',
  variant = 'info',
  learnMoreUrl,
}: InfoTooltipProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0, actual: position });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!isOpen) return;
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    const tooltipRect = tooltipRef.current?.getBoundingClientRect();
    if (!triggerRect || !tooltipRect) return;

    const { x, y, actualPosition } = calculatePosition(
      triggerRect,
      { width: tooltipRect.width, height: tooltipRect.height },
      position
    );

    setCoords({ x, y, actual: actualPosition });
  }, [isOpen, position, title, description]);

  return (
    <div ref={wrapperRef} className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="w-4 h-4 rounded-full bg-white/10 text-[10px]
                   text-[var(--color-text-secondary)] hover:bg-white/20
                   flex items-center justify-center"
        aria-label="Info"
      >
        i
      </button>

      {isOpen && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={`fixed z-50 w-64 p-3 border shadow-xl tooltip-enter ${VARIANT_STYLES[variant]}`}
          style={{ left: coords.x, top: coords.y }}
        >
          <h4 className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
            {title}
          </h4>
          <p className="text-xs text-[var(--color-text-secondary)]">
            {description}
          </p>
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 text-[10px] text-[var(--color-primary)] hover:underline"
            >
              Daha fazla bilgi
            </a>
          )}
        </div>
      )}
    </div>
  );
};

function calculatePosition(
  triggerRect: DOMRect,
  tooltipSize: { width: number; height: number },
  preferredPosition: 'top' | 'bottom' | 'left' | 'right'
): { x: number; y: number; actualPosition: 'top' | 'bottom' | 'left' | 'right' } {
  const spacing = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const padding = 8;

  const positions = {
    top: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipSize.width / 2,
      y: triggerRect.top - tooltipSize.height - spacing,
    },
    bottom: {
      x: triggerRect.left + triggerRect.width / 2 - tooltipSize.width / 2,
      y: triggerRect.bottom + spacing,
    },
    left: {
      x: triggerRect.left - tooltipSize.width - spacing,
      y: triggerRect.top + triggerRect.height / 2 - tooltipSize.height / 2,
    },
    right: {
      x: triggerRect.right + spacing,
      y: triggerRect.top + triggerRect.height / 2 - tooltipSize.height / 2,
    },
  } as const;

  const order: Array<'top' | 'bottom' | 'left' | 'right'> = [
    preferredPosition,
    'top',
    'bottom',
    'right',
    'left',
  ];

  const fits = (pos: { x: number; y: number }) => {
    return (
      pos.x >= padding &&
      pos.y >= padding &&
      pos.x + tooltipSize.width <= viewportWidth - padding &&
      pos.y + tooltipSize.height <= viewportHeight - padding
    );
  };

  let chosen: 'top' | 'bottom' | 'left' | 'right' = preferredPosition;
  for (const candidate of order) {
    if (fits(positions[candidate])) {
      chosen = candidate;
      break;
    }
  }

  const selected = positions[chosen];
  const clampedX = Math.min(
    Math.max(selected.x, padding),
    viewportWidth - tooltipSize.width - padding
  );
  const clampedY = Math.min(
    Math.max(selected.y, padding),
    viewportHeight - tooltipSize.height - padding
  );

  return { x: clampedX, y: clampedY, actualPosition: chosen };
}
