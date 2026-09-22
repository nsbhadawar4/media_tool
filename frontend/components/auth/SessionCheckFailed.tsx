'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Shown by the auth gates when the session check could not be completed — the backend is
 * down, unreachable, or answering with an error — as opposed to answering that the
 * session is over.
 *
 * It exists because the alternative behaviours are both wrong. Spinning forever tells the
 * user nothing and looks like the app is broken; redirecting to the sign-in page would
 * sign out someone whose session is perfectly valid, and (while their cookie is still
 * there) would bounce them straight back here anyway. Saying what happened and offering
 * to try again is the only honest option, and it costs nothing once the server is back.
 */
export function SessionCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="app-viewport-min-h flex items-center justify-center bg-background px-6 py-16">
      <div
        role="alert"
        className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-dashed border-danger/40 bg-danger/5 px-6 py-12 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <WifiOff className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-sm font-semibold text-foreground">Cannot reach the server</h1>
        <p className="mt-1.5 text-sm text-muted">
          Your session could not be checked. Check that the backend is running, then try again.
        </p>
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      </div>
    </main>
  );
}
