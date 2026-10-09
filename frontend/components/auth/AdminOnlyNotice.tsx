'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ShieldAlert, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/AuthContext';
import { ADMIN_HOME_PATH, LOGIN_PATH } from '@/lib/auth/routes';
import { Button } from '@/components/ui/Button';

/** The marker the admin layout adds when it turns a signed-in non-admin away from /admin. */
export const ADMIN_ONLY_NOTICE = 'admin-only';

/**
 * Says why a visit to /admin ended up here: the account signed in is not an administrator.
 * Without it the redirect is silent, and someone signed in to their personal account reads it
 * as "the admin dashboard shows the user dashboard". Offers the way out — sign out and sign in
 * with the administrator account. Nothing here grants access: the admin layout and the API's
 * requireAdmin decide that from the server's own record.
 */
export function AdminOnlyNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (dismissed || params.get('notice') !== ADMIN_ONLY_NOTICE || !user || user.role === 'admin') return null;

  const switchAccount = async () => {
    setSwitching(true);
    try {
      await logout();
    } finally {
      router.replace(`${LOGIN_PATH}?from=${encodeURIComponent(ADMIN_HOME_PATH)}`);
    }
  };

  return (
    <div role="alert" className="mb-6 flex flex-col gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-4">
      <ShieldAlert className="h-5 w-5 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">The admin panel is for administrator accounts</p>
        <p className="mt-0.5 text-muted">
          You&apos;re signed in as <span className="font-medium text-foreground-soft">{user.email ?? user.name}</span>, a normal account. Sign in with
          the administrator account to open it.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" onClick={() => void switchAccount()} disabled={switching}>
          {switching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Sign in as administrator
        </Button>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            router.replace(window.location.pathname);
          }}
          aria-label="Dismiss"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
