'use client';

import { useSearchParams } from 'next/navigation';
import { Clock } from 'lucide-react';
import { SESSION_ENDED_PARAM, SESSION_ENDED_VALUE } from '@/lib/auth/session';

/**
 * Shown when an auth gate sent someone here because the server stopped accepting their
 * session. Without it the app simply throws them back to a login form mid-task, with no
 * indication that anything happened or that their password is still fine.
 */
export function SessionExpiredNotice() {
  const expired = useSearchParams().get(SESSION_ENDED_PARAM) === SESSION_ENDED_VALUE;
  if (!expired) return null;

  return (
    <div
      role="status"
      className="animate-fade-in mb-6 flex items-start gap-2.5 rounded-xl border border-warning/30 bg-warning/10 px-3.5 py-3 text-xs text-warning"
    >
      <Clock className="mt-px h-4 w-4 shrink-0" />
      <span>Your session has ended. Please sign in again to continue.</span>
    </div>
  );
}
