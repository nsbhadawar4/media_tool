'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { MEANINGFUL_ACTIONS, describeEvent } from '@/lib/admin/activityEvents';
import { EventIcon } from '@/components/admin/activity/ActivityTimeline';
import { EventStatusBadge } from '@/components/admin/users/AccountBadges';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { DashboardPanel, PanelEmpty, PanelRowsSkeleton } from './DashboardPanel';

/** The events the dashboard summarises: accounts, security and plans. File edits live on /admin/activity. */
export const DASHBOARD_ACTIVITY_ACTIONS = MEANINGFUL_ACTIONS;
export const ADMIN_ACTIVITY_KEY = ['admin', 'activity'] as const;

const RECENT_ACTIVITY_COUNT = 15;

/** The latest sign-ups, sign-ins, security events and plan changes across the installation. */
export function RecentActivity({ className }: { className?: string }) {
  const params = { actions: DASHBOARD_ACTIVITY_ACTIONS, page: 1, limit: RECENT_ACTIVITY_COUNT };
  const query = useQuery({
    queryKey: [...ADMIN_ACTIVITY_KEY, params],
    queryFn: ({ signal }) => adminApi.activity(params, signal),
    refetchInterval: 60_000,
  });
  const entries = query.data?.data ?? [];

  return (
    <DashboardPanel
      title="Recent activity"
      description="Sign-ups, sign-ins, security and plans"
      icon={Activity}
      className={className}
      link={{ href: '/admin/activity', label: 'View all' }}
    >
      {query.isError ? (
        <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="activity" />
      ) : query.isLoading ? (
        <PanelRowsSkeleton rows={8} />
      ) : entries.length === 0 ? (
        <PanelEmpty icon={Activity} title="No activity yet" description="Sign-ups and sign-ins will appear here." />
      ) : (
        <ol className="relative px-4 py-2 sm:px-5">
          {entries.map((entry, index) => {
            const { label } = describeEvent(entry);
            const who = entry.user?.name ?? entry.subjectLabel ?? entry.performedByEmail ?? 'Someone';
            return (
              <li key={entry.id} className="relative flex gap-3 py-2.5">
                {/* The timeline's spine, joining each icon to the next. */}
                {index < entries.length - 1 && <span aria-hidden className="absolute bottom-0 left-[15px] top-[42px] w-px bg-border" />}
                <EventIcon entry={entry} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] leading-snug">
                    <span className="font-medium text-foreground">{label}</span>
                    {entry.status === 'failure' && <EventStatusBadge status="failure" />}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {entry.user ? (
                      <Link href={`/admin/users/${entry.user.id}`} className="hover:text-accent">
                        {who}
                      </Link>
                    ) : (
                      who
                    )}
                    {' · '}
                    <time dateTime={entry.createdAt} title={formatDate(entry.createdAt)}>
                      {formatRelativeTime(entry.createdAt)}
                    </time>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </DashboardPanel>
  );
}
