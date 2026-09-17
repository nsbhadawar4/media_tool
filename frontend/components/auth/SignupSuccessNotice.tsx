'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';

/**
 * Shown after signup redirects here. Signup deliberately does not create a session, so
 * without this the new account would land on a plain login form with no sign that
 * anything had worked.
 */
export function SignupSuccessNotice() {
  const registered = useSearchParams().get('registered');
  if (!registered) return null;

  return (
    <div
      role="status"
      className="animate-fade-in mb-6 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-3 text-xs text-success"
    >
      <CheckCircle2 className="mt-px h-4 w-4 shrink-0" />
      <span>Your account is ready. Sign in below to get started.</span>
    </div>
  );
}
