'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Activity, Globe, Laptop, Loader2, Smartphone, Tablet } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { PROVIDER_LABEL, REASON_LABEL, TONE_COLOR, describeEvent } from '@/lib/admin/activityEvents';
import { EventStatusBadge } from '@/components/admin/users/AccountBadges';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { PanelEmpty, PanelRowsSkeleton } from '@/components/admin/dashboard/DashboardPanel';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { ActivityCategory, AdminActivityEntry } from '@/types/api';

const DEVICE_ICON = { Mobile: Smartphone, Tablet, Desktop: Laptop } as const;

/** "Mobile · iOS · Safari · 203.0.113.•••" — only what was recorded. */
export function ClientLine({ entry, className }: { entry: AdminActivityEntry; className?: string }) {
  const parts = [entry.device, entry.os, entry.browser].filter(Boolean);
  if (!parts.length && !entry.ipMasked) return null;
  const DeviceIcon = (entry.device && DEVICE_ICON[entry.device as keyof typeof DEVICE_ICON]) || Globe;
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1 text-[11px] text-subtle', className)}>
      <DeviceIcon className="h-3 w-3 shrink-0" aria-hidden />
      <span className="truncate">
        {parts.join(' · ')}
        {entry.ipMasked && (
          <>
            {parts.length ? ' · ' : ''}
            <span className="tabular-nums" title="IP address (masked)">{entry.ipMasked}</span>
          </>
        )}
      </span>
    </span>
  );
}

/** The coloured icon tile for an event. */
export function EventIcon({ entry, size = 'md' }: { entry: AdminActivityEntry; size?: 'sm' | 'md' }) {
  const { icon: Icon, tone } = describeEvent(entry);
  const color = TONE_COLOR[entry.status === 'failure' ? 'danger' : tone];
  return (
    <span
      className={cn('relative flex shrink-0 items-center justify-center rounded-lg border', size === 'sm' ? 'h-7 w-7' : 'h-8 w-8')}
      style={{ color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, borderColor: `color-mix(in srgb, ${color} 26%, transparent)` }}
    >
      <Icon className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={1.9} />
    </span>
  );
}

/** A vertical timeline of events, newest first as given. */
export function ActivityTimeline({ entries, showUser = false }: { entries: AdminActivityEntry[]; showUser?: boolean }) {
  return (
    <ol className="relative px-4 py-2 sm:px-5">
      {entries.map((entry, index) => {
        const { label } = describeEvent(entry);
        const performedByOther = entry.performedByEmail && entry.user && entry.performedBy !== entry.user.id && entry.performedBy !== null;
        return (
          <li key={entry.id} className="relative flex gap-3 py-3">
            {index < entries.length - 1 && <span aria-hidden className="absolute bottom-0 left-[15px] top-[46px] w-px bg-border" />}
            <EventIcon entry={entry} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[13px] font-semibold text-foreground">{label}</span>
                {entry.status === 'failure' && <EventStatusBadge status="failure" />}
                {entry.authProvider && entry.action !== 'signup' && entry.action !== 'login' && (
                  <span className="text-[11px] text-subtle">via {PROVIDER_LABEL[entry.authProvider]}</span>
                )}
                {entry.reason && entry.status === 'failure' && (
                  <span className="text-[11px] text-danger/90">{REASON_LABEL[entry.reason] ?? entry.reason.replace(/[_-]/g, ' ')}</span>
                )}
              </div>
              <p className="mt-0.5 text-[13px] leading-snug text-foreground-soft [overflow-wrap:anywhere]">
                {showUser && entry.user && (
                  <Link href={`/admin/users/${entry.user.id}`} className="font-medium text-foreground hover:text-accent">
                    {entry.user.name}
                  </Link>
                )}
                {showUser && entry.user ? ' — ' : ''}
                {entry.message}
                {performedByOther && <span className="ml-1 text-[11px] text-subtle">(by {entry.performedByEmail})</span>}
              </p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                <time dateTime={entry.createdAt} title={formatDate(entry.createdAt)} className="text-[11px] text-subtle">
                  {formatRelativeTime(entry.createdAt)} · {new Date(entry.createdAt).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}
                </time>
                <ClientLine entry={entry} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TIMELINE_PAGE = 15;

const FILTERS: Array<{ value: '' | 'failure' | ActivityCategory; label: string }> = [
  { value: '', label: 'All' },
  { value: 'auth', label: 'Sign-ins' },
  { value: 'security', label: 'Security' },
  { value: 'failure', label: 'Failures' },
  { value: 'onboarding', label: 'Plans' },
  { value: 'account', label: 'Account' },
  { value: 'content', label: 'Files' },
];

/**
 * One account's full timeline for /admin/users/[id]: filter chips, then pages of 15 loaded on
 * demand ("Load older"), so a long history never arrives all at once.
 */
export function UserActivityTimeline({ userId }: { userId: string }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('');
  const params = filter === 'failure' ? { status: 'failure' as const } : filter ? { category: filter } : {};

  const query = useInfiniteQuery({
    queryKey: ['admin', 'users', 'detail', userId, 'activity', params],
    queryFn: ({ pageParam, signal }) => adminApi.userActivity(userId, { ...params, page: pageParam, limit: TIMELINE_PAGE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta && last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
  });
  const entries = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.meta?.total;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-4 py-3 sm:px-5" role="group" aria-label="Filter activity">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              'rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
              filter === f.value ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border text-muted hover:border-border-strong hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
        {total !== undefined && <span className="ml-auto text-[11px] text-subtle">{total.toLocaleString()} events</span>}
      </div>
      {query.isError ? (
        <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="activity" />
      ) : query.isLoading ? (
        <PanelRowsSkeleton rows={6} />
      ) : entries.length === 0 ? (
        <PanelEmpty icon={Activity} title="No activity recorded" description={filter ? 'Nothing in this category yet.' : undefined} />
      ) : (
        <>
          <ActivityTimeline entries={entries} />
          {query.hasNextPage && (
            <div className="border-t border-border px-4 py-3 text-center sm:px-5">
              <button
                type="button"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-accent transition hover:bg-accent/10 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                {query.isFetchingNextPage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Load older activity
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

