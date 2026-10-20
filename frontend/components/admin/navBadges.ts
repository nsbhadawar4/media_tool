'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { adminReviewsApi } from '@/lib/api/reviews';
import { LIFECYCLE_KEY, lifecycleApi } from '@/lib/api/contentLifecycle';

/**
 * Counts shown next to navigation items: Reviews waiting for moderation, and what is in Archive and
 * in Trash / Deleted. Straight from the server, refreshed every minute and after any change (the
 * review, archive and trash screens and Manage Courses invalidate these queries). Only fetched for
 * administrators; a 0 shows no badge.
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
  const lifecycle = useQuery({
    queryKey: [...LIFECYCLE_KEY, 'summary'],
    queryFn: async ({ signal }) => (await lifecycleApi.summary(signal)).data,
    enabled: isAdmin,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!isAdmin) return {};
  return {
    ...(data?.pending ? { '/admin/reviews': data.pending } : {}),
    ...(lifecycle.data?.archive.all ? { '/admin/archive': lifecycle.data.archive.all } : {}),
    ...(lifecycle.data?.trash.all ? { '/admin/trash': lifecycle.data.trash.all } : {}),
  };
}

/** What a badge's number means, for screen readers. */
export const BADGE_MEANING: Record<string, string> = { '/admin/reviews': 'waiting', '/admin/archive': 'archived', '/admin/trash': 'deleted' };

/** "12", or "99+" so the badge never outgrows its pill. */
export function badgeText(count: number): string {
  return count > 99 ? '99+' : String(count);
}
