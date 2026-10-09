'use client';

import Link from 'next/link';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  ArrowUpRight,
  CalendarDays,
  Crown,
  FileText,
  Files,
  FolderClosed,
  HardDrive,
  LayoutTemplate,
  LogIn,
  Mail,
  MessageSquareMore,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Star,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { adminReviewsApi } from '@/lib/api/reviews';
import { useAuth } from '@/lib/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { RecentUsers } from '@/components/admin/dashboard/RecentUsers';
import { Distribution } from '@/components/admin/dashboard/Distribution';
import { RecentActivity } from '@/components/admin/dashboard/RecentActivity';
import { PendingReviews } from '@/components/admin/dashboard/PendingReviews';
import { ADMIN_REVIEW_STATS_KEY } from '@/components/reviews/admin/AdminReviewsView';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

/** Where the admin manages things — the same destinations as the admin sidebar. */
const QUICK_LINKS: ReadonlyArray<{ href: string; label: string; hint: string; icon: LucideIcon }> = [
  { href: '/admin/users', label: 'Manage users', hint: 'Accounts, status and plans', icon: Users },
  { href: '/admin/reviews', label: 'Reviews', hint: 'Moderate and publish', icon: Star },
  { href: '/admin/activity', label: 'Activity', hint: 'The full audit log', icon: Activity },
  { href: '/admin/content', label: 'Content', hint: 'Sections, classes, courses, games', icon: LayoutTemplate },
];

/**
 * The admin panel's landing page — the administrator's dashboard, never the personal library
 * one (/dashboard sends an administrator here). Every figure is read live from the database through the
 * admin API — installation-wide counts from /api/admin/stats, moderation counts from
 * /api/admin/reviews/stats — and every panel shares its cache entry with the full page it
 * links to, so moderating or suspending anywhere keeps this in step.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(signal),
  });
  // Same key and shape as the sidebar badge and /admin/reviews, so this is a shared cache entry.
  const reviewStatsQuery = useQuery({
    queryKey: ADMIN_REVIEW_STATS_KEY,
    queryFn: async ({ signal }) => (await adminReviewsApi.stats(signal)).data,
  });
  const isRefreshing = useIsFetching({ queryKey: ['admin'] }) > 0;

  const stats = statsQuery.data?.data;
  const reviewStats = reviewStatsQuery.data;
  const statsFailed = statsQuery.isError || reviewStatsQuery.isError;
  const statsLoading = statsQuery.isLoading || reviewStatsQuery.isLoading;

  const activeShare = stats && stats.totalUsers > 0 ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0;
  const firstName = user?.name.split(/\s+/)[0];

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      {/* Header */}
      <section className="gradient-border relative overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_120%_at_100%_0%,color-mix(in_srgb,var(--accent)_22%,transparent),transparent_60%)]"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-accent-2">Admin overview</p>
            <h1 className="bg-linear-to-b from-foreground to-foreground/85 bg-clip-text text-[26px] font-semibold leading-tight tracking-tight text-transparent sm:text-[34px]">
              {firstName ? `Welcome back, ${firstName}` : 'Dashboard'}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted sm:text-[15px]">
              Accounts, storage and moderation across the whole installation.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin'] })}
            disabled={isRefreshing}
            className="self-start sm:self-auto"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </section>

      {/* Quick links */}
      <nav aria-label="Manage" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {QUICK_LINKS.map(({ href, label, hint, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="card-interactive group flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                {label}
                {href === '/admin/reviews' && reviewStats && reviewStats.pending > 0 && (
                  <span className="rounded-full bg-warning/15 px-1.5 py-px text-[10px] font-semibold tabular-nums text-warning">{reviewStats.pending}</span>
                )}
              </span>
              <span className="block truncate text-xs text-muted">{hint}</span>
            </span>
            <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:text-foreground" />
          </Link>
        ))}
      </nav>

      {/* Headline figures */}
      <section aria-label="Key figures">
        {statsFailed ? (
          <div className="rounded-2xl border border-border bg-surface">
            <InlineErrorState
              error={statsQuery.error ?? reviewStatsQuery.error}
              onRetry={() => {
                void statsQuery.refetch();
                void reviewStatsQuery.refetch();
              }}
              subject="statistics"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
            {statsLoading || !stats || !reviewStats ? (
              Array.from({ length: 8 }).map((_, index) => <StatCardSkeleton key={index} />)
            ) : (
              <>
                <StatCard
                  index={0}
                  icon={Users}
                  label="Total users"
                  value={stats.totalUsers.toLocaleString()}
                  hint={stats.inactiveUsers ? `${stats.inactiveUsers.toLocaleString()} suspended` : 'All accounts active'}
                />
                <StatCard
                  index={1}
                  icon={UserCheck}
                  accent="success"
                  label="Active users"
                  value={stats.activeUsers.toLocaleString()}
                  hint={`${activeShare}% of accounts`}
                />
                <StatCard index={2} icon={UserPlus} accent="success" label="New users today" value={stats.users.newToday.toLocaleString()} hint="Since midnight" />
                <StatCard
                  index={3}
                  icon={Files}
                  color="var(--accent-2)"
                  label="Total media files"
                  value={stats.totalMedia.toLocaleString()}
                  hint="Photos, videos and documents"
                />
                <StatCard index={4} icon={FileText} color="#f59e0b" label="Total documents" value={stats.totalDocuments.toLocaleString()} hint="PDF, Word, Excel, text" />
                <StatCard index={5} icon={FolderClosed} color="#22d3ee" label="Total folders" value={stats.totalFolders.toLocaleString()} hint="Across all accounts" />
                <StatCard
                  index={6}
                  icon={MessageSquareMore}
                  accent="warning"
                  label="Pending reviews"
                  value={reviewStats.pending.toLocaleString()}
                  hint={reviewStats.pending ? 'Awaiting moderation' : 'Queue is clear'}
                />
                <StatCard index={7} icon={HardDrive} label="Storage used" value={formatBytes(stats.storageUsedBytes)} hint="Across all accounts" />
              </>
            )}
          </div>
        )}
      </section>

      {/* User activity — every figure is counted in the database; "today" is the admin's own day. */}
      <section aria-labelledby="user-activity-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="user-activity-heading" className="text-base font-semibold tracking-tight text-foreground">User activity</h2>
          <p className="text-xs text-muted">Registrations, sign-ins, sign-in methods and plans</p>
        </div>
        {statsQuery.isError ? null : !stats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 min-[87.5rem]:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => <StatCardSkeleton key={index} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 min-[87.5rem]:grid-cols-6">
            <StatCard
              index={0}
              icon={UserMinus}
              accent={stats.inactiveUsers ? 'warning' : 'success'}
              label="Suspended"
              value={stats.inactiveUsers.toLocaleString()}
              hint={stats.inactiveUsers ? 'Cannot sign in' : 'None'}
            />
            <StatCard index={1} icon={CalendarDays} color="var(--accent-2)" label="New this week" value={stats.users.newThisWeek.toLocaleString()} hint="Last 7 days" />
            <StatCard index={2} icon={Activity} accent="success" label="Active today" value={stats.users.activeToday.toLocaleString()} hint="Signed in or used the app" />
            <StatCard index={3} icon={UserCheck} label="Active this month" value={stats.users.activeThisMonth.toLocaleString()} hint="Last 30 days" />
            <StatCard index={4} icon={LogIn} label="Logins today" value={stats.users.loginsToday.toLocaleString()} hint="Successful sign-ins" />
            <StatCard
              index={5}
              icon={ShieldAlert}
              accent={stats.users.failedLoginsToday ? 'danger' : 'success'}
              label="Failed logins"
              value={stats.users.failedLoginsToday.toLocaleString()}
              hint="Today"
            />
          </div>
        )}
        {/* How the accounts split: by plan, and by how they sign in. */}
        {stats && (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 xl:grid-cols-2">
            <Distribution
              title="Plan distribution"
              description="Normal accounts by plan (Pro and Premium: active or pending)"
              icon={Crown}
              segments={[
                { label: 'Free', value: stats.users.byPlan.free, color: '#a1a1aa', icon: Users, detail: 'Includes not yet chosen' },
                { label: 'Pro', value: stats.users.byPlan.pro, color: '#8b6dff', icon: Zap },
                { label: 'Premium', value: stats.users.byPlan.premium, color: '#f59e0b', icon: Crown },
              ]}
            />
            <Distribution
              title="Sign-in methods"
              description="Every account by how it signs in"
              icon={LogIn}
              segments={[
                { label: 'Email', value: stats.users.byProvider.email, color: '#60a5fa', icon: Mail, detail: `+${stats.users.newThisWeekByProvider.email} this week` },
                { label: 'Mobile', value: stats.users.byProvider.mobile, color: '#a78bfa', icon: Smartphone, detail: `+${stats.users.newThisWeekByProvider.mobile} this week` },
                { label: 'Google', value: stats.users.byProvider.google, color: '#fbbf24', icon: Sparkles, detail: `+${stats.users.newThisWeekByProvider.google} this week` },
              ]}
            />
          </div>
        )}
      </section>

      {/*
        Recent users and pending reviews stack in the wide column; activity runs down the
        narrow one beside both. Below xl everything is a single column.
      */}
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        <RecentUsers className="xl:col-span-2" />
        <RecentActivity className="xl:col-start-3 xl:row-span-2 xl:row-start-1" />
        <PendingReviews total={reviewStats?.pending} className="xl:col-span-2" />
      </div>
    </div>
  );
}
