'use client';

import { RefreshCw } from 'lucide-react';

/**
 * /classes/…: what a visitor sees when a class, subject or chapter exists but could not be read right
 * now. The server answered with an error status (see lib/server/contentErrors.ts); this is its friendly
 * face, with a retry that re-renders the route. A page that is simply not there is a 404 instead
 * (each segment's not-found.tsx).
 */
export default function ClassesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-20">
      <div role="alert" className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
        <h1 className="text-xl font-semibold text-foreground">This page is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-muted">We could not load it just now. Nothing is lost — please try again in a moment.</p>
        <button type="button" onClick={reset} className="btn-primary mt-6 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground">
          <RefreshCw aria-hidden className="h-4 w-4" />
          Try again
        </button>
      </div>
    </div>
  );
}
