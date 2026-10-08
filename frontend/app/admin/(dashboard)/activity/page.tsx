'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Activity, Search, ShieldAlert, UserRound, X } from 'lucide-react';
import { adminApi, type ListActivityParams } from '@/lib/api/admin';
import { useDebounce } from '@/hooks/useDebounce';
import { CATEGORY_OPTIONS, EVENT_OPTIONS, PROVIDER_LABEL, REASON_LABEL, describeEvent } from '@/lib/admin/activityEvents';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { EventStatusBadge } from '@/components/admin/users/AccountBadges';
import { ClientLine, EventIcon } from '@/components/admin/activity/ActivityTimeline';
import { ALL_TIME, DateRangeFilter, rangeToBounds, type DateRange } from '@/components/admin/DateRangeFilter';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { ActivityCategory, AdminActivityEntry, AuthProvider } from '@/types/api';

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  { label: 'Success & failure', value: '' },
  { label: 'Success only', value: 'success' },
  { label: 'Failures only', value: 'failure' },
];
const PROVIDER_OPTIONS = [
  { label: 'Any sign-in method', value: '' },
  { label: 'Email', value: 'email' },
  { label: 'Mobile', value: 'mobile' },
  { label: 'Google', value: 'google' },
];
const SORT_OPTIONS = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
];

interface Filters {
  category: '' | ActivityCategory;
  action: string;
  status: '' | 'success' | 'failure';
  provider: '' | AuthProvider;
  user: { id: string; label: string } | null;
  range: DateRange;
  sort: 'newest' | 'oldest';
}
const NO_FILTERS: Filters = { category: '', action: '', status: '', provider: '', user: null, range: ALL_TIME, sort: 'newest' };

/** Suspense because useSearchParams needs one on a statically rendered page. */
export default function AdminActivityPage() {
  return (
    <Suspense fallback={null}>
      <ActivityView />
    </Suspense>
  );
}

/**
 * /admin/activity: the installation-wide audit trail — sign-ups, sign-ins, security events,
 * account changes, plans and content — filtered and paged on the server. IP addresses arrive
 * already masked and devices only as a coarse description; nothing raw reaches the browser.
 * `?userId=` (from a user's page) opens it on one account.
 */
function ActivityView() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Filters>(() => {
    const userId = searchParams.get('userId');
    return userId ? { ...NO_FILTERS, user: { id: userId, label: searchParams.get('user') ?? 'Selected user' } } : NO_FILTERS;
  });
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const update = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const bounds = rangeToBounds(filters.range);
  const params: ListActivityParams = {
    search: debouncedSearch.trim() || undefined,
    category: filters.category || undefined,
    actions: filters.action ? [filters.action] : undefined,
    status: filters.status || undefined,
    provider: filters.provider || undefined,
    userId: filters.user?.id,
    from: bounds.from,
    to: bounds.to,
    sort: filters.sort,
    page,
    limit: PAGE_SIZE,
  };
  const query = useQuery({
    queryKey: ['admin', 'activity', 'log', params],
    queryFn: ({ signal }) => adminApi.activity(params, signal),
    placeholderData: keepPreviousData,
  });
  const entries = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtersActive =
    Boolean(params.search) || Boolean(filters.category || filters.action || filters.status || filters.provider || filters.user) || filters.range.preset !== 'all';

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="System"
        icon={Activity}
        title="Activity"
        description="Sign-ups, sign-ins, security events, account changes and plans across every account."
      />

      <section aria-label="Search and filters" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-2 lg:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search descriptions, emails and numbers…"
              aria-label="Search activity"
              className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <UserPicker value={filters.user} onChange={(user) => update({ user })} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            options={[{ label: 'All categories', value: '' }, ...CATEGORY_OPTIONS]}
            value={filters.category}
            onChange={(e) => update({ category: e.target.value as Filters['category'] })}
            aria-label="Category"
          />
          <Select
            options={[{ label: 'All events', value: '' }, ...EVENT_OPTIONS]}
            value={filters.action}
            onChange={(e) => update({ action: e.target.value })}
            aria-label="Event"
          />
          <Select options={STATUS_OPTIONS} value={filters.status} onChange={(e) => update({ status: e.target.value as Filters['status'] })} aria-label="Outcome" />
          <Select options={PROVIDER_OPTIONS} value={filters.provider} onChange={(e) => update({ provider: e.target.value as Filters['provider'] })} aria-label="Sign-in method" />
          <DateRangeFilter value={filters.range} onChange={(range) => update({ range })} />
          <div className="ml-auto flex items-center gap-2">
            {filtersActive && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilters({ ...NO_FILTERS, sort: filters.sort });
                  setPage(1);
                }}
                className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <X className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
            <Select options={SORT_OPTIONS} value={filters.sort} onChange={(e) => update({ sort: e.target.value as Filters['sort'] })} aria-label="Sort" />
          </div>
        </div>
        {meta && (
          <p className="text-xs text-subtle" aria-live="polite">
            {meta.total.toLocaleString()} {meta.total === 1 ? 'event' : 'events'}
            {filtersActive ? ' match' : ''}
          </p>
        )}
      </section>

      {query.isError ? (
        <ErrorState error={query.error} subject="activity" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <ActivitySkeleton />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={filters.status === 'failure' ? ShieldAlert : Activity}
          title={filtersActive ? 'No matching activity' : 'No activity yet'}
          description={filtersActive ? 'Try a wider date range or fewer filters.' : 'Sign-ups, sign-ins and account changes will appear here.'}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', query.isFetching && 'opacity-70')}>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-subtle">
                  <th scope="col" className="px-5 py-3 font-medium">User</th>
                  <th scope="col" className="px-3 py-3 font-medium">Event</th>
                  <th scope="col" className="px-3 py-3 font-medium">Description</th>
                  <th scope="col" className="px-3 py-3 font-medium">Method</th>
                  <th scope="col" className="px-3 py-3 font-medium">Device</th>
                  <th scope="col" className="px-3 py-3 font-medium">Browser</th>
                  <th scope="col" className="px-3 py-3 font-medium" title="Masked IP address">IP</th>
                  <th scope="col" className="px-3 py-3 font-medium">Date / time</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below lg: one card per event. */}
          <ol className="divide-y divide-border lg:hidden">
            {entries.map((entry) => {
              const { label } = describeEvent(entry);
              return (
                <li key={entry.id} className="flex gap-3 px-4 py-3.5">
                  <EventIcon entry={entry} />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-foreground">{label}</span>
                      {entry.status === 'failure' && <EventStatusBadge status="failure" />}
                    </div>
                    <p className="mt-0.5 text-[13px] leading-snug text-foreground-soft [overflow-wrap:anywhere]">{entry.message}</p>
                    <p className="mt-1 truncate text-[11px] text-muted">
                      <UserCellText entry={entry} />
                      {' · '}
                      <time dateTime={entry.createdAt}>{formatRelativeTime(entry.createdAt)}</time>
                    </p>
                    <ClientLine entry={entry} className="mt-0.5" />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} numbered />}
    </div>
  );
}

function UserCellText({ entry }: { entry: AdminActivityEntry }) {
  if (entry.user) return <>{entry.user.label}</>;
  return <>{entry.subjectLabel ?? entry.performedByEmail ?? 'Unknown'}</>;
}

function ActivityRow({ entry }: { entry: AdminActivityEntry }) {
  const { label } = describeEvent(entry);
  return (
    <tr className="align-top transition-colors hover:bg-surface-hover/50">
      <td className="px-5 py-3">
        {entry.user ? (
          <Link href={`/admin/users/${entry.user.id}`} className="flex max-w-[180px] items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
            <Avatar name={entry.user.name} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-foreground hover:text-accent">{entry.user.name}</span>
              <span className="block truncate text-[11px] text-muted">{entry.user.label}</span>
            </span>
          </Link>
        ) : (
          <span className="flex max-w-[180px] items-center gap-2 text-muted">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-hover">
              <UserRound className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate text-[13px]" title="No account matches this event">
              {entry.subjectLabel ?? entry.performedByEmail ?? 'Unknown'}
            </span>
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-2">
          <EventIcon entry={entry} size="sm" />
          <span className="whitespace-nowrap text-[13px] font-medium text-foreground">{label}</span>
        </div>
      </td>
      <td className="min-w-[240px] max-w-[340px] px-3 py-3 text-[13px] text-foreground-soft [overflow-wrap:anywhere]">
        {entry.message}
        {entry.status === 'failure' && entry.reason && (
          <span className="mt-0.5 block text-[11px] text-danger/90">{REASON_LABEL[entry.reason] ?? entry.reason.replace(/[_-]/g, ' ')}</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted">{entry.authProvider ? PROVIDER_LABEL[entry.authProvider] : '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted">{[entry.device, entry.os].filter(Boolean).join(' · ') || '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted">{entry.browser ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] tabular-nums text-muted">{entry.ipMasked ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-3 text-[13px] text-muted">
        <time dateTime={entry.createdAt} title={formatDate(entry.createdAt)}>
          {new Date(entry.createdAt).toLocaleString('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </time>
        <span className="block text-[11px] text-subtle">{formatRelativeTime(entry.createdAt)}</span>
      </td>
      <td className="px-5 py-3 text-right"><EventStatusBadge status={entry.status} /></td>
    </tr>
  );
}

/**
 * "Only this account": type a name, email or number, pick from the matches (searched on the
 * server, a handful at a time), and the log narrows to that account's events.
 */
function UserPicker({ value, onChange }: { value: Filters['user']; onChange: (user: Filters['user']) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(text, 250);
  const boxRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ['admin', 'users', 'picker', debounced],
    queryFn: ({ signal }) => adminApi.listUsers({ search: debounced, limit: 6, sort: 'name' }, signal),
    enabled: open && debounced.trim().length >= 2,
  });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (value) {
    return (
      <div className="flex h-[42px] min-w-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 text-sm text-accent lg:w-72">
        <UserRound className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="Show every user" className="rounded p-0.5 transition hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  const matches = query.data?.data ?? [];
  return (
    <div ref={boxRef} className="relative min-w-0 lg:w-72">
      <UserRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Filter by user…"
        aria-label="Filter by user"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="activity-user-options"
        aria-expanded={open && debounced.trim().length >= 2}
        className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      {open && debounced.trim().length >= 2 && (
        <ul className="animate-pop-in absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-xl border border-border bg-surface-elevated p-1 shadow-pop" role="listbox" id="activity-user-options">
          {query.isLoading ? (
            <li className="px-3 py-2 text-xs text-muted">Searching…</li>
          ) : matches.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted">No matching users</li>
          ) : (
            matches.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onChange({ id: u.id, label: u.email ?? u.phone ?? u.name });
                    setText('');
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
                >
                  <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-foreground">{u.name}</span>
                    <span className="block truncate text-[11px] text-muted">{u.email ?? u.phone}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function ActivitySkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading activity">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="hidden h-3 w-24 animate-pulse rounded bg-surface-hover lg:block" />
          <div className="hidden h-5 w-14 animate-pulse rounded bg-surface-hover lg:block" />
        </div>
      ))}
    </div>
  );
}
