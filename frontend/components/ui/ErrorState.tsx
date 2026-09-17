'use client';

import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { Button } from './Button';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/utils/cn';

interface ErrorStateProps {
  error: unknown;
  /** Re-runs the failed query. Omit when there is nothing sensible to retry. */
  onRetry?: () => void;
  /** What could not be loaded, e.g. "folders" — used to phrase the message. */
  subject?: string;
  className?: string;
}

/**
 * Shown when a query fails.
 *
 * Without this a failed request is indistinguishable from an empty library: the grid
 * falls through to its empty state and tells the user they have no folders, which is a
 * lie that invites them to re-upload things they already have. An error must never be
 * rendered as "nothing here".
 */
export function ErrorState({ error, onRetry, subject = 'this', className }: ErrorStateProps) {
  // status 0 is how the API client reports "the request never reached the server".
  const isOffline = error instanceof ApiError && error.status === 0;
  const Icon = isOffline ? WifiOff : AlertTriangle;

  const message = isOffline
    ? 'Could not reach the server. Check that the backend is running and try again.'
    : error instanceof ApiError
      ? error.message
      : `Something went wrong while loading ${subject}.`;

  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-danger/40 bg-danger/5 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-foreground">
        {isOffline ? 'Cannot reach the server' : `Could not load ${subject}`}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-muted">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-5" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Compact variant for errors inside a card or a panel, where the full-height block
 * above would blow out the surrounding layout.
 */
export function InlineErrorState({ error, onRetry, subject = 'this' }: ErrorStateProps) {
  const isOffline = error instanceof ApiError && error.status === 0;
  const message = isOffline
    ? 'Could not reach the server.'
    : error instanceof ApiError
      ? error.message
      : `Could not load ${subject}.`;

  return (
    <div role="alert" className="flex items-start gap-3 px-5 py-6 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 text-xs font-medium text-accent transition hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
