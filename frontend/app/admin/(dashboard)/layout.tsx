'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
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
  const { user, isAdmin, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) router.replace('/admin/login');
    else if (!isAdmin) router.replace('/dashboard');
  }, [isLoading, user, isAdmin, router]);

  if (isLoading || !user || !isAdmin) {
    return <FullPageSpinner />;
  }

  return <AdminShell variant="admin">{children}</AdminShell>;
}
