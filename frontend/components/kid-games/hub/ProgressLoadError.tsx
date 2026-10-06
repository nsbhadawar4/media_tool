'use client';

import { CloudOff, RefreshCw } from 'lucide-react';

/**
 * Shown when saved progress could not be loaded. The games still work; only the figures are
 * missing, and saying so beats quietly showing zeros that look like lost progress.
 */
export function ProgressLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 sm:flex-row sm:items-center">
      <CloudOff aria-hidden className="h-5 w-5 shrink-0 text-amber-500" />
      <p className="flex-1 text-sm text-foreground">We couldn&apos;t load your saved progress just now. Your stars and scores are safe.</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-elevated px-4 text-sm font-semibold text-foreground transition hover:bg-surface-hover"
      >
        <RefreshCw aria-hidden className="h-4 w-4" />
        Try again
      </button>
    </div>
  );
}
