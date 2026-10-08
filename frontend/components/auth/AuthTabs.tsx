'use client';

import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

export interface AuthTab<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
}

/**
 * The Email / Mobile switch on the sign-in and sign-up cards: a full-width segmented control
 * with proper tab semantics (arrow keys move between tabs, as WAI-ARIA tabs do).
 */
export function AuthTabs<T extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  label,
}: {
  tabs: readonly AuthTab<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Prefix for tab / panel ids, so panels can point back with aria-labelledby. */
  idPrefix: string;
  label: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.value === value));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[next]!.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="relative grid rounded-xl border border-border bg-surface/70 p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {/* One highlight that slides between tabs, so switching reads as motion, not a swap. */}
      <span
        aria-hidden
        className="absolute bottom-1 top-1 rounded-lg bg-surface-elevated shadow-card ring-1 ring-border transition-transform duration-300 ease-[var(--ease-out)]"
        style={{ left: 4, width: `calc((100% - 8px) / ${tabs.length})`, transform: `translateX(${activeIndex * 100}%)` }}
      />
      {tabs.map((tab, index) => {
        const selected = tab.value === value;
        return (
          <button
            key={tab.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            id={`${idPrefix}-tab-${tab.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={cn(
              'relative z-10 inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 text-[13px] font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              selected ? 'text-foreground' : 'text-muted hover:text-foreground-soft',
            )}
          >
            <span className={cn('transition-colors', selected ? 'text-accent' : '')}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
