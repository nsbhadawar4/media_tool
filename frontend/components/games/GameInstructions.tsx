'use client';

import { useState } from 'react';
import { ChevronDown, Info } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Collapsible "how to play" panel; open by default so a first-time player sees it. */
export function GameInstructions({ steps }: { steps: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent-2">
          <Info className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-semibold text-foreground">How to play</span>
        <ChevronDown className={cn('h-4 w-4 text-muted transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <ol className="min-h-0 space-y-2.5 overflow-hidden px-5 text-sm text-muted">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-3 first:pt-1 last:pb-5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[11px] font-semibold text-foreground-soft">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
