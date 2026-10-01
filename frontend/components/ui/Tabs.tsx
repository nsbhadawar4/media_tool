'use client';

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

/** Segmented tab strip. Scrolls sideways on a narrow screen instead of wrapping. */
export function Tabs<T extends string>({ tabs, value, onChange, className, ...rest }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'app-no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1',
        className,
      )}
    >
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
              'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-150',
              isActive ? 'bg-surface-hover text-foreground shadow-card' : 'text-muted hover:text-foreground',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('text-xs tabular-nums', isActive ? 'text-accent' : 'text-muted')}>{tab.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
