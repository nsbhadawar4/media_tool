'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/AuthContext';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { AdminShell } from '@/components/admin/AdminShell';

/**
 * The authoritative auth gate for every /admin/* page except /admin/login.
 * proxy.ts already redirects obvious logged-out visitors before this ever renders,
 * but this is what actually confirms the session is valid (via GET /api/auth/me)
 * and reacts if it expires while the app is open.
 */
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !admin) {
      router.replace('/admin/login');
    }
  }, [isLoading, admin, router]);

  if (isLoading || !admin) {
    return <FullPageSpinner />;
  }

  return <AdminShell>{children}</AdminShell>;
}
