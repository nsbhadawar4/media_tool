'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { adminReviewsApi } from '@/lib/api/reviews';

/**
 * Counts shown next to navigation items. Today only Reviews has one: how many are waiting for
 * moderation, straight from the server, refreshed every minute and after any moderation (the
 * review screens invalidate this query). Only fetched for administrators.
 */
export function useNavBadges(): Record<string, number> {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const { data } = useQuery({
    queryKey: ['admin', 'reviews', 'stats'],
    queryFn: async ({ signal }) => (await adminReviewsApi.stats(signal)).data,
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return isAdmin && data?.pending ? { '/admin/reviews': data.pending } : {};
}

/** "12", or "99+" so the badge never outgrows its pill. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
