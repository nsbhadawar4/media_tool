'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { sessionEndedUrl } from '@/lib/auth/session';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { SessionCheckFailed } from '@/components/auth/SessionCheckFailed';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * Gate for the administration area. Two separate outcomes on purpose: a signed-out
 * visitor goes to the admin login, while a signed-in *non-admin* is sent to their own
 * dashboard rather than a login form — asking them to sign in again would be misleading,
 * since their session is perfectly valid and simply lacks the role.
 *
 * The backend enforces the same rule independently (requireAdmin), so bypassing this
 * only produces a page with no data in it.
 */
export default function AdminAreaLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading, sessionError, refresh } = useAuth();
  const router = useRouter();

  // Same rule as the user-facing gate: a server that never answered is an outage to
  // report, not a session to end, and a session the server *did* reject leaves with the
  // marker that keeps proxy.ts from bouncing it back here. See lib/auth/session.ts.
  const isUnreachable = !isLoading && !user && sessionError === 'unreachable';

  useEffect(() => {
    if (isLoading || isUnreachable) return;
    if (!user) router.replace(sessionError === 'rejected' ? sessionEndedUrl('/admin/login') : '/admin/login');
    else if (!isAdmin) router.replace('/dashboard');
  }, [isLoading, isUnreachable, user, isAdmin, sessionError, router]);

  if (isUnreachable) {
    return <SessionCheckFailed onRetry={() => void refresh()} />;
  }

  if (isLoading || !user || !isAdmin) {
    return <FullPageSpinner />;
  }

  return <AdminShell variant="admin">{children}</AdminShell>;
}
