'use client';

import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  CalendarDays,
  Crown,
  Files,
  Globe,
  HardDrive,
  LogIn,
  Mail,
  MessageSquareMore,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { adminReviewsApi } from '@/lib/api/reviews';
import { useAuth } from '@/lib/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { InlineErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { RecentUsers } from '@/components/admin/dashboard/RecentUsers';
import { RecentActivity } from '@/components/admin/dashboard/RecentActivity';
import { PendingReviews } from '@/components/admin/dashboard/PendingReviews';
import { ADMIN_REVIEW_STATS_KEY } from '@/components/reviews/admin/AdminReviewsView';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * The admin panel's landing page. Every figure is read live from the database through the
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 min-[87.5rem]:grid-cols-6">
            {statsLoading || !stats || !reviewStats ? (
              Array.from({ length: 6 }).map((_, index) => <StatCardSkeleton key={index} />)
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
                <StatCard
                  index={2}
                  icon={Files}
                  color="var(--accent-2)"
                  label="Total files"
                  value={stats.totalMedia.toLocaleString()}
                  hint={`In ${stats.totalFolders.toLocaleString()} folder${stats.totalFolders === 1 ? '' : 's'}`}
                />
                <StatCard
                  index={3}
                  icon={HardDrive}
                  label="Storage used"
                  value={formatBytes(stats.storageUsedBytes)}
                  hint="Across all accounts"
                />
                <StatCard
                  index={4}
                  icon={MessageSquareMore}
                  accent="warning"
                  label="Pending reviews"
                  value={reviewStats.pending.toLocaleString()}
                  hint={reviewStats.pending ? 'Awaiting moderation' : 'Queue is clear'}
                />
                <StatCard
                  index={5}
                  icon={Globe}
                  accent="success"
                  label="Public reviews"
                  value={reviewStats.published.toLocaleString()}
                  hint={reviewStats.published ? `Average ${reviewStats.averagePublic.toFixed(1)} ★` : 'None published yet'}
                />
              </>
            )}
          </div>
        )}
      </section>

      {/* User activity — every figure is counted in the database; "today" is the admin's own day. */}
      <section aria-labelledby="user-activity-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="user-activity-heading" className="text-base font-semibold tracking-tight text-foreground">User activity</h2>
          <p className="text-xs text-muted">Registrations, sign-ins and plans</p>
        </div>
        {statsQuery.isError ? null : !stats ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 min-[87.5rem]:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => <StatCardSkeleton key={index} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 min-[87.5rem]:grid-cols-6">
            <StatCard index={0} icon={UserPlus} accent="success" label="New today" value={stats.users.newToday.toLocaleString()} hint="Since midnight" />
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
            <StatCard index={6} icon={Mail} label="New email users" value={stats.users.newThisWeekByProvider.email.toLocaleString()} hint="Last 7 days" />
            <StatCard index={7} icon={Smartphone} color="var(--accent-2)" label="New mobile users" value={stats.users.newThisWeekByProvider.mobile.toLocaleString()} hint="Last 7 days" />
            <StatCard index={8} icon={Sparkles} accent="warning" label="New Google users" value={stats.users.newThisWeekByProvider.google.toLocaleString()} hint="Last 7 days" />
            <StatCard index={9} icon={Users} label="Free users" value={stats.users.byPlan.free.toLocaleString()} hint="Includes not yet chosen" />
            <StatCard index={10} icon={Zap} color="var(--accent-2)" label="Pro users" value={stats.users.byPlan.pro.toLocaleString()} hint="Active or pending" />
            <StatCard index={11} icon={Crown} accent="warning" label="Premium users" value={stats.users.byPlan.premium.toLocaleString()} hint="Active or pending" />
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
