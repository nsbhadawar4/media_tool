'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/utils/cn';

interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

/**
 * Segmented tab strip with a sliding highlight. The highlight is one element that moves
 * between tabs (measured from the active button) rather than a background on each, which
 * is what makes switching read as motion instead of a swap. Scrolls sideways on a narrow
 * screen instead of wrapping.
 */
export function Tabs<T extends string>({ tabs, value, onChange, className, ...rest }: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      if (active) setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, tabs]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'app-no-scrollbar relative inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1',
        className,
      )}
    >
      {indicator && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 rounded-lg border border-border-strong bg-surface-elevated shadow-card transition-[left,width] duration-300 ease-(--ease-out)"
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {tabs.map((tab) => {
        const isActive = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.value)}
            className={cn(
              'relative z-10 flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-200',
              isActive ? 'text-foreground' : 'text-muted hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('text-xs tabular-nums', isActive ? 'text-accent-2' : 'text-subtle')}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
