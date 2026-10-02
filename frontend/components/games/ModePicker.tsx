'use client';

import { cn } from '@/utils/cn';

interface ModeOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

/** Vertical list of game modes with a one-line description each; used inside the start overlay. */
export function ModePicker<T extends string>({
  options,
  value,
  onChange,
  accent = '#7c5cff',
  'aria-label': ariaLabel,
}: {
  options: readonly ModeOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  'aria-label': string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex w-full flex-col gap-2">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-12 rounded-xl border px-4 py-2.5 text-left transition duration-200 active:scale-[0.98]',
              selected ? 'bg-surface-elevated' : 'border-border bg-surface/60 hover:border-border-strong',
            )}
            style={selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}55, 0 8px 24px -12px ${accent}` } : undefined}
          >
            <span className="block text-sm font-semibold text-foreground">{option.label}</span>
            <span className="block text-xs text-muted">{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
