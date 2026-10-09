'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Crown,
  Mail,
  Search,
  Smartphone,
  Sparkles,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { adminApi, type ListUsersParams, type UserSort } from '@/lib/api/admin';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Avatar } from '@/components/ui/Avatar';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { UserStatusBadge, useUserStatusAction } from '@/components/admin/users/UserStatus';
import { PlanBadge, ProviderBadge, RoleBadge, VerifiedMark } from '@/components/admin/users/AccountBadges';
import { ALL_TIME, DateRangeFilter, rangeToBounds, type DateRange } from '@/components/admin/DateRangeFilter';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { AdminUserSummary, AuthProvider } from '@/types/api';
import { accountLabel } from '@/lib/auth/account';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Suspended', value: 'inactive' },
];
const PROVIDER_OPTIONS = [
  { label: 'All signup methods', value: '' },
  { label: 'Email signup', value: 'email' },
  { label: 'Mobile signup', value: 'mobile' },
  { label: 'Google signup', value: 'google' },
];
const PLAN_OPTIONS = [
  { label: 'All plans', value: '' },
  { label: 'Free', value: 'free' },
  { label: 'Pro', value: 'pro' },
  { label: 'Premium', value: 'premium' },
];
const ROLE_OPTIONS = [
  { label: 'All roles', value: '' },
  { label: 'Normal users', value: 'user' },
  { label: 'Admins', value: 'admin' },
];
const SORT_OPTIONS: Array<{ label: string; value: UserSort }> = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Recently active', value: 'last_active' },
  { label: 'Recent login', value: 'last_login' },
  { label: 'Name A–Z', value: 'name' },
];

interface Filters {
  status: '' | 'active' | 'inactive';
  provider: '' | AuthProvider;
  plan: '' | 'free' | 'pro' | 'premium';
  role: '' | 'user' | 'admin';
  joined: DateRange;
  sort: UserSort;
}

const NO_FILTERS: Filters = { status: '', provider: '', plan: '', role: '', joined: ALL_TIME, sort: 'newest' };

function shortDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

const relative = (iso: string | null | undefined) => (iso ? formatRelativeTime(iso) : 'Never');

/** Suspense because useSearchParams needs one on a statically rendered page. */
export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersView />
    </Suspense>
  );
}

/**
 * /admin/users: every account with how and when it registered, when it was last seen, its plan
 * and status. Search, filters, sorting and paging all run on the server. Each row opens
 * /admin/users/[id] (details, usage and the activity timeline); suspend / activate is available
 * from the row as well.
 */
function AdminUsersView() {
  const { user: currentUser } = useAuth();
  const searchParams = useSearchParams();
  const statusAction = useUserStatusAction();

  // `?search=` pre-fills the box, so other admin screens can link straight to one account.
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '');
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const update = (patch: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPage(1);
  };

  const bounds = rangeToBounds(filters.joined);
  const params: ListUsersParams = {
    search: debouncedSearch.trim() || undefined,
    status: filters.status || undefined,
    provider: filters.provider || undefined,
    plan: filters.plan || undefined,
    role: filters.role || undefined,
    from: bounds.from,
    to: bounds.to,
    sort: filters.sort,
    page,
    limit: PAGE_SIZE,
  };

  const statsQuery = useQuery({
    queryKey: ['admin', 'users', 'stats'],
    queryFn: ({ signal }) => adminApi.userStats(signal),
  });
  const query = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: ({ signal }) => adminApi.listUsers(params, signal),
    placeholderData: keepPreviousData,
  });

  const stats = statsQuery.data?.data;
  const users = query.data?.data ?? [];
  const meta = query.data?.meta;
  const filtersActive =
    Boolean(params.search) || filters.status !== '' || filters.provider !== '' || filters.plan !== '' || filters.role !== '' || filters.joined.preset !== 'all';

  const pct = (n: number) => (stats?.total ? `${Math.round((n / stats.total) * 100)}% of accounts` : 'No accounts yet');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Manage"
        icon={Users}
        title="Users"
        description="Who has registered, how and when, when they were last seen, and their plan. Folders and files are counted, never shown."
      />

      {/* Headline figures */}
      <section aria-label="User figures">
        {statsQuery.isError ? (
          <div className="rounded-2xl border border-border bg-surface">
            <InlineErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} subject="user figures" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {!stats ? (
              Array.from({ length: 10 }).map((_, index) => <StatCardSkeleton key={index} />)
            ) : (
              <>
                <StatCard index={0} icon={Users} label="Total users" value={stats.total.toLocaleString()} hint="All accounts" />
                <StatCard index={1} icon={UserCheck} accent="success" label="Active" value={stats.active.toLocaleString()} hint={pct(stats.active)} />
                <StatCard index={2} icon={UserPlus} color="var(--accent-2)" label="New users" value={stats.newUsers.toLocaleString()} hint={`Last ${stats.newUserWindowDays} days`} />
                <StatCard index={3} icon={UserX} accent="danger" label="Suspended" value={stats.suspended.toLocaleString()} hint={stats.suspended ? 'Cannot sign in' : 'None suspended'} />
                <StatCard index={4} icon={Mail} label="Email users" value={stats.byProvider.email.toLocaleString()} hint={pct(stats.byProvider.email)} />
                <StatCard index={5} icon={Smartphone} color="var(--accent-2)" label="Mobile users" value={stats.byProvider.mobile.toLocaleString()} hint={pct(stats.byProvider.mobile)} />
                <StatCard index={6} icon={Sparkles} accent="warning" label="Google users" value={stats.byProvider.google.toLocaleString()} hint={pct(stats.byProvider.google)} />
                <StatCard index={7} icon={Users} label="Free plan" value={stats.byPlan.free.toLocaleString()} hint="Includes not yet chosen" />
                <StatCard index={8} icon={Zap} color="var(--accent-2)" label="Pro plan" value={stats.byPlan.pro.toLocaleString()} hint="Active or pending" />
                <StatCard index={9} icon={Crown} accent="warning" label="Premium plan" value={stats.byPlan.premium.toLocaleString()} hint="Active or pending" />
              </>
            )}
          </div>
        )}
      </section>

      {/* Search and filters */}
      <section aria-label="Search and filters" className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name, email or mobile number…"
            aria-label="Search users"
            className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select options={STATUS_OPTIONS} value={filters.status} onChange={(e) => update({ status: e.target.value as Filters['status'] })} aria-label="Account status" />
          <Select options={PROVIDER_OPTIONS} value={filters.provider} onChange={(e) => update({ provider: e.target.value as Filters['provider'] })} aria-label="Signup method" />
          <Select options={PLAN_OPTIONS} value={filters.plan} onChange={(e) => update({ plan: e.target.value as Filters['plan'] })} aria-label="Plan" />
          <Select options={ROLE_OPTIONS} value={filters.role} onChange={(e) => update({ role: e.target.value as Filters['role'] })} aria-label="Role" />
          <DateRangeFilter label="Signed up" value={filters.joined} onChange={(joined) => update({ joined })} />
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
            <Select options={SORT_OPTIONS} value={filters.sort} onChange={(e) => update({ sort: e.target.value as UserSort })} aria-label="Sort users" />
          </div>
        </div>
        {meta && (
          <p className="text-xs text-subtle" aria-live="polite">
            {meta.total.toLocaleString()} {meta.total === 1 ? 'account' : 'accounts'}
            {filtersActive ? ' match' : ''}
          </p>
        )}
      </section>

      {/* Results */}
      {query.isError ? (
        <ErrorState error={query.error} subject="users" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <UsersSkeleton />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtersActive ? 'No matching users' : 'No users yet'}
          description={filtersActive ? 'Try a different search or clear the filters.' : 'New accounts will appear here as people sign up.'}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', query.isFetching && 'opacity-70')}>
          {/* md and up: the full table, scrolling sideways inside its card when the screen is narrower than it. */}
          <div className="hidden overflow-x-auto md:block">
            {/* Fits its column at every width: lower-priority columns appear as the screen widens
                (lg → xl → 2xl), and the user cell carries the address while Email is hidden. */}
            <table className="w-full text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-subtle">
                  <th scope="col" className="sticky left-0 z-10 bg-surface px-5 py-3 font-medium">User</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Email</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium 2xl:table-cell">Mobile</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Signup</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Role</th>
                  <th scope="col" className="px-3 py-3 font-medium">Plan</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="hidden px-2 py-3 text-center font-medium 2xl:table-cell" title="Email verified">Email ✓</th>
                  <th scope="col" className="hidden px-2 py-3 text-center font-medium 2xl:table-cell" title="Mobile verified">Mobile ✓</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Joined</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Last login</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium 2xl:table-cell">Last active</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === currentUser?.id}
                    onToggleStatus={() => statusAction.request({ id: user.id, name: user.name, email: accountLabel(user), isActive: user.isActive })}
                    statusBusy={statusAction.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Below md: one tappable card per account. */}
          <ul className="divide-y divide-border md:hidden">
            {users.map((user) => (
              <li key={user.id}>
                <Link href={`/admin/users/${user.id}`} className="flex items-start gap-3 px-4 py-3.5 transition-colors active:bg-surface-hover">
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                      <UserStatusBadge isActive={user.isActive} />
                    </div>
                    <p className="truncate text-xs text-muted">{accountLabel(user)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <ProviderBadge provider={user.authProvider} />
                      <RoleBadge role={user.role} />
                      <PlanBadge user={user} />
                    </div>
                    <p className="mt-1.5 text-[11px] tabular-nums text-subtle">
                      Joined {shortDate(user.createdAt)} · Active {relative(user.lastActiveAt).toLowerCase()}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} numbered />}
      {statusAction.dialog}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onToggleStatus,
  statusBusy,
}: {
  user: AdminUserSummary;
  isSelf: boolean;
  onToggleStatus: () => void;
  statusBusy: boolean;
}) {
  return (
    <tr className="group transition-colors hover:bg-surface-hover/50">
      <td className="sticky left-0 z-10 bg-surface px-5 py-3 transition-colors group-hover:bg-surface-hover">
        <Link href={`/admin/users/${user.id}`} className="flex min-w-0 max-w-[220px] items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <Avatar name={user.name} src={user.avatarUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-medium text-foreground group-hover:text-accent" title={user.name}>
              {user.name}
            </span>
            <span className="block truncate text-[11px] text-muted xl:hidden">{user.email ?? user.phone ?? user.mobile ?? ''}</span>
            {isSelf && <span className="text-[11px] text-subtle">You</span>}
          </span>
        </Link>
      </td>
      <td className="hidden max-w-[220px] truncate px-3 py-3 text-muted xl:table-cell" title={user.email ?? undefined}>{user.email ?? '—'}</td>
      <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-muted 2xl:table-cell">{user.phone ?? user.mobile ?? '—'}</td>
      <td className="hidden px-3 py-3 xl:table-cell"><ProviderBadge provider={user.authProvider} /></td>
      <td className="hidden px-3 py-3 lg:table-cell"><RoleBadge role={user.role} /></td>
      <td className="whitespace-nowrap px-3 py-3"><PlanBadge user={user} /></td>
      <td className="px-3 py-3"><UserStatusBadge isActive={user.isActive} /></td>
      <td className="hidden px-2 py-3 text-center 2xl:table-cell"><VerifiedMark label="Email" verified={user.isEmailVerified} applicable={Boolean(user.email)} /></td>
      <td className="hidden px-2 py-3 text-center 2xl:table-cell"><VerifiedMark label="Mobile" verified={user.mobileVerified} applicable={Boolean(user.phone || user.mobile)} /></td>
      <td className="hidden whitespace-nowrap px-3 py-3 tabular-nums text-muted xl:table-cell" title={formatDate(user.createdAt)}>{shortDate(user.createdAt)}</td>
      <td className="hidden whitespace-nowrap px-3 py-3 text-muted lg:table-cell" title={user.lastLoginAt ? formatDate(user.lastLoginAt) : undefined}>{relative(user.lastLoginAt)}</td>
      <td className="hidden whitespace-nowrap px-3 py-3 text-muted 2xl:table-cell" title={user.lastActiveAt ? formatDate(user.lastActiveAt) : undefined}>{relative(user.lastActiveAt)}</td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <Link
            href={`/admin/users/${user.id}`}
            aria-label={`View ${user.name}`}
            className="inline-flex items-center rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground-soft transition hover:border-accent/40 hover:bg-accent/10 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            View
          </Link>
          <button
            type="button"
            onClick={onToggleStatus}
            disabled={isSelf || statusBusy}
            title={isSelf ? 'You can’t change your own account’s status' : undefined}
            aria-label={`${user.isActive ? 'Suspend' : 'Activate'} ${user.name}`}
            className={cn(
              'inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40',
              user.isActive
                ? 'border-border text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger focus-visible:ring-danger/40'
                : 'border-success/40 text-success hover:bg-success/10 focus-visible:ring-success/40',
            )}
          >
            {user.isActive ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>
  );
}

function UsersSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading users">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-4 py-3.5 last:border-b-0 sm:px-5">
          <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-hover" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/4 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
          </div>
          <div className="hidden h-5 w-14 animate-pulse rounded bg-surface-hover md:block" />
          <div className="hidden h-5 w-14 animate-pulse rounded bg-surface-hover md:block" />
          <div className="hidden h-5 w-16 animate-pulse rounded bg-surface-hover lg:block" />
        </div>
      ))}
    </div>
  );
}
