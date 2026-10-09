'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, UserPlus, Users } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { formatDate, formatRelativeTime } from '@/utils/format';
import type { AdminUserSummary } from '@/types/api';
import { accountLabel } from '@/lib/auth/account';
import { UserStatusBadge } from '@/components/admin/users/UserStatus';
import { DashboardPanel, PanelEmpty, PanelRowsSkeleton } from './DashboardPanel';

const RECENT_USER_COUNT = 6;

/** Where "View" goes: the account's own admin page. */
function userHref(user: AdminUserSummary): string {
  return `/admin/users/${user.id}`;
}

/** "Oct 7" this year, "Oct 7, 2025" before it — short enough for the table's Joined column. */
function joined(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
}

function StatusBadge({ user }: { user: AdminUserSummary }) {
  return <UserStatusBadge isActive={user.isActive} />;
}

/**
 * The newest accounts, from the same endpoint (and cache entry family) as the users page.
 * A table from `md` up; below that each account is a stacked row, so nothing scrolls sideways.
 */
export function RecentUsers({ className }: { className?: string }) {
  const params = { page: 1, limit: RECENT_USER_COUNT };
  const query = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: ({ signal }) => adminApi.listUsers(params, signal),
  });
  const users = query.data?.data ?? [];

  return (
    <DashboardPanel
      title="Recent signups"
      description="Newest accounts first"
      icon={Users}
      link={{ href: '/admin/users', label: 'All users' }}
      className={className}
    >
      {query.isError ? (
        <InlineErrorState error={query.error} onRetry={() => query.refetch()} subject="users" />
      ) : query.isLoading ? (
        <PanelRowsSkeleton rows={RECENT_USER_COUNT} />
      ) : users.length === 0 ? (
        <PanelEmpty icon={UserPlus} title="No accounts yet" />
      ) : (
        <>
          {/* md and up: a real table. table-fixed + truncate keeps it inside the card. */}
          <table className="hidden w-full table-fixed text-sm md:table">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-wider text-subtle">
                <th scope="col" className="w-[27%] px-5 py-2.5 font-medium">User</th>
                <th scope="col" className="w-[29%] px-3 py-2.5 font-medium">Email</th>
                <th scope="col" className="w-[13%] px-3 py-2.5 font-medium">Joined</th>
                <th scope="col" className="w-[13%] px-3 py-2.5 font-medium">Status</th>
                <th scope="col" className="w-[7%] px-3 py-2.5 text-right font-medium">Files</th>
                <th scope="col" className="w-[9%] px-5 py-2.5 text-right font-medium">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id} className="group transition-colors hover:bg-surface-hover/50">
                  <td className="px-5 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                      <span className="truncate font-medium text-foreground">{user.name}</span>
                      {user.role === 'admin' && <Badge variant="accent">Admin</Badge>}
                    </div>
                  </td>
                  <td className="truncate px-3 py-3 text-muted" title={accountLabel(user)}>{accountLabel(user)}</td>
                  <td
                    className="truncate whitespace-nowrap px-3 py-3 tabular-nums text-muted"
                    title={`${formatDate(user.createdAt)} (${formatRelativeTime(user.createdAt)})`}
                  >
                    {joined(user.createdAt)}
                  </td>
                  <td className="px-3 py-3"><StatusBadge user={user} /></td>
                  <td className="px-3 py-3 text-right tabular-nums text-foreground-soft">{user.mediaCount.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={userHref(user)}
                      aria-label={`View ${user.name}`}
                      className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Below md: one tappable row per account. */}
          <ul className="divide-y divide-border md:hidden">
            {users.map((user) => (
              <li key={user.id}>
                <Link href={userHref(user)} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-surface-hover">
                  <Avatar name={user.name} src={user.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
                      <StatusBadge user={user} />
                    </div>
                    <p className="truncate text-xs text-muted">{accountLabel(user)}</p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-subtle">
                      Joined {joined(user.createdAt)} · {user.mediaCount.toLocaleString()} file{user.mediaCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-subtle" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </DashboardPanel>
  );
}
