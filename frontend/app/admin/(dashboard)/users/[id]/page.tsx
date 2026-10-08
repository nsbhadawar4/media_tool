'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  FileText,
  Files,
  FolderClosed,
  GraduationCap,
  HardDrive,
  Image as ImageIcon,
  MessageSquareDashed,
  MessagesSquare,
  ShieldAlert,
  UserCheck,
  UserRound,
  UserX,
  Video,
} from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { ApiError } from '@/lib/api/client';
import { REVIEW_CATEGORY_LABEL } from '@/lib/api/reviews';
import { useAuth } from '@/lib/auth/AuthContext';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { DashboardPanel, PanelEmpty, PanelRowsSkeleton } from '@/components/admin/dashboard/DashboardPanel';
import { UserStatusBadge, useUserStatusAction } from '@/components/admin/users/UserStatus';
import { PlanBadge, ProviderBadge, RoleBadge } from '@/components/admin/users/AccountBadges';
import { UserActivityTimeline } from '@/components/admin/activity/ActivityTimeline';
import { StarDisplay } from '@/components/reviews/ReviewStars';
import { ModerationBadge, VisibilityBadge } from '@/components/reviews/ReviewStatusBadge';
import { formatBytes, formatDate, formatRelativeTime } from '@/utils/format';
import { accountLabel } from '@/lib/auth/account';

/** One labelled fact in the account-details list. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className="flex min-w-0 justify-end truncate text-right text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** "Mar 3, 2026, 4:05 PM (2 days ago)", or a fallback when it never happened. */
function When({ iso, never = 'Never' }: { iso: string | null | undefined; never?: string }) {
  if (!iso) return <span className="text-subtle">{never}</span>;
  return (
    <time dateTime={iso} title={formatRelativeTime(iso)} className="truncate">
      {formatDate(iso)}
    </time>
  );
}

function Verified({ ok, at, na }: { ok: boolean; at?: string | null; na?: boolean }) {
  if (na) return <span className="text-subtle">Not applicable</span>;
  return ok ? (
    <span className="inline-flex items-center gap-1 text-success">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
      {at ? formatDate(at) : 'Verified'}
    </span>
  ) : (
    <span className="text-muted">Not verified</span>
  );
}

/**
 * /admin/users/[id]: one account in full — what it holds, what it has been doing, its review
 * and Kid Games progress — and the suspend / activate control. Password data never leaves
 * the server; the API this reads from does not include it.
 */
export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const status = useUserStatusAction();

  const query = useQuery({
    queryKey: ['admin', 'users', 'detail', id],
    queryFn: ({ signal }) => adminApi.getUser(id, signal),
  });

  const backLink = (
    <Link
      href="/admin/users"
      className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted transition hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      All users
    </Link>
  );

  if (query.isError) {
    const notFound = query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400);
    return (
      <div className="flex flex-col gap-6">
        {backLink}
        {notFound ? (
          <EmptyState icon={UserX} title="User not found" description="This account may have been deleted." />
        ) : (
          <ErrorState error={query.error} subject="this user" onRetry={() => query.refetch()} />
        )}
      </div>
    );
  }

  const detail = query.data?.data;
  const user = detail?.user;
  const stats = detail?.stats;
  const isSelf = user?.id === currentUser?.id;
  const totalFiles = stats ? stats.imageCount + stats.videoCount + stats.documentCount : 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {backLink}

      {/* Identity and the one action this page exists for */}
      <section className="gradient-border relative overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-card sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_120%_at_100%_0%,color-mix(in_srgb,var(--accent)_18%,transparent),transparent_60%)]"
        />
        {!user ? (
          <div className="relative flex items-center gap-4" role="status" aria-label="Loading">
            <div className="h-14 w-14 animate-pulse rounded-full bg-surface-hover" />
            <div className="space-y-2">
              <div className="h-5 w-40 animate-pulse rounded bg-surface-hover" />
              <div className="h-3.5 w-56 animate-pulse rounded bg-surface-hover" />
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <Avatar name={user.name} src={user.avatarUrl} size="lg" />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{user.name}</h1>
                  <UserStatusBadge isActive={user.isActive} />
                  {user.role === 'admin' && <Badge variant="accent">Admin</Badge>}
                  {isSelf && <Badge>You</Badge>}
                </div>
                <p className="truncate text-sm text-muted">{accountLabel(user)}</p>
                <p className="mt-1 text-xs text-subtle">
                  Joined {formatRelativeTime(user.createdAt)} · Last active{' '}
                  {user.lastActiveAt ? formatRelativeTime(user.lastActiveAt) : 'never'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
              <Button
                variant={user.isActive ? 'danger' : 'primary'}
                size="sm"
                // The API refuses this too; an admin suspending themselves would be locked out.
                disabled={isSelf || status.isPending}
                onClick={() => status.request({ id: user.id, name: user.name, email: accountLabel(user), isActive: user.isActive })}
              >
                {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {user.isActive ? 'Suspend account' : 'Activate account'}
              </Button>
              {isSelf && <p className="text-[11px] text-subtle">You can&apos;t suspend your own account.</p>}
            </div>
          </div>
        )}
        {user && !user.isActive && (
          <div className="relative mt-5 flex items-start gap-2.5 rounded-xl border border-danger/25 bg-danger/10 px-3.5 py-3 text-xs text-danger">
            <ShieldAlert className="mt-px h-4 w-4 shrink-0" />
            <span>
              This account is suspended. It cannot sign in, its sessions have been ended and its media links no longer
              work. Nothing it owns has been deleted.
            </span>
          </div>
        )}
      </section>

      {/* What the account holds */}
      <section aria-label="Content" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 min-[87.5rem]:grid-cols-6">
        {!stats ? (
          Array.from({ length: 6 }).map((_, index) => <StatCardSkeleton key={index} />)
        ) : (
          <>
            <StatCard index={0} icon={Files} label="Files" value={totalFiles.toLocaleString()} hint={stats.trashCount ? `${stats.trashCount} in trash` : 'Trash is empty'} />
            <StatCard index={1} icon={ImageIcon} color="var(--accent-2)" label="Images" value={stats.imageCount.toLocaleString()} />
            <StatCard index={2} icon={Video} color="var(--accent-2)" label="Videos" value={stats.videoCount.toLocaleString()} />
            <StatCard index={3} icon={FileText} accent="warning" label="Documents" value={stats.documentCount.toLocaleString()} />
            <StatCard index={4} icon={FolderClosed} label="Folders" value={stats.folderCount.toLocaleString()} />
            <StatCard index={5} icon={HardDrive} label="Storage" value={formatBytes(stats.storageUsedBytes)} hint="Excluding trash" />
          </>
        )}
      </section>

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-3">
        {/* Activity timeline */}
        <DashboardPanel
          title="Activity timeline"
          description="Sign-ins, security events, plan changes and what was done to the account — newest first"
          icon={Activity}
          className="xl:col-span-2 xl:row-span-5 xl:self-start"
          link={user ? { href: `/admin/activity?userId=${user.id}&user=${encodeURIComponent(accountLabel(user))}`, label: 'Open in activity log' } : undefined}
        >
          <UserActivityTimeline userId={id} />
        </DashboardPanel>
        {/* Profile */}
        <DashboardPanel title="Profile" icon={UserRound}>
          {!user ? (
            <PanelRowsSkeleton rows={5} />
          ) : (
            <dl className="divide-y divide-border px-4 sm:px-5">
              <Fact label="Name">{user.name}</Fact>
              <Fact label="Email">{user.email ?? <span className="text-subtle">—</span>}</Fact>
              <Fact label="Mobile">{user.phone ?? user.mobile ?? <span className="text-subtle">—</span>}</Fact>
              <Fact label="Signed up with"><ProviderBadge provider={user.authProvider} /></Fact>
              {user.googleLinked && user.authProvider !== 'google' && <Fact label="Google">Linked</Fact>}
              <Fact label="Role"><RoleBadge role={user.role} /></Fact>
              <Fact label="Status"><UserStatusBadge isActive={user.isActive} /></Fact>
            </dl>
          )}
        </DashboardPanel>

        {/* Verification */}
        <DashboardPanel title="Verification" icon={BadgeCheck}>
          {!user ? (
            <PanelRowsSkeleton rows={2} />
          ) : (
            <dl className="divide-y divide-border px-4 sm:px-5">
              <Fact label="Email"><Verified ok={user.isEmailVerified} na={!user.email} /></Fact>
              <Fact label="Mobile"><Verified ok={user.mobileVerified} at={user.phoneVerifiedAt} na={!user.phone && !user.mobile} /></Fact>
            </dl>
          )}
        </DashboardPanel>

        {/* Account, plan and sign-ins */}
        <DashboardPanel title="Account & plan" icon={CreditCard}>
          {!user ? (
            <PanelRowsSkeleton rows={7} />
          ) : (
            <dl className="divide-y divide-border px-4 sm:px-5">
              <Fact label="Signed up"><When iso={user.createdAt} /></Fact>
              <Fact label="Last login"><When iso={user.lastLoginAt} /></Fact>
              <Fact label="Last login from">{user.lastLoginIpMasked ?? <span className="text-subtle">—</span>}</Fact>
              <Fact label="Last active"><When iso={user.lastActiveAt} /></Fact>
              {user.role !== 'admin' && (
                <>
                  <Fact label="Onboarding">
                    {user.onboardingRequired ? (
                      <span className="text-warning">Not finished</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                        {user.onboardingCompletedAt ? formatDate(user.onboardingCompletedAt) : 'Complete'}
                      </span>
                    )}
                  </Fact>
                  <Fact label="Plan"><PlanBadge user={user} /></Fact>
                  <Fact label="Subscription">
                    <span className="capitalize">{user.subscriptionStatus ?? (user.plan ? '—' : 'Free (not chosen)')}</span>
                  </Fact>
                  <Fact label="Plan selected"><When iso={user.planSelectedAt} never="—" /></Fact>
                  {user.subscriptionExpiresAt && <Fact label="Renews / ends"><When iso={user.subscriptionExpiresAt} /></Fact>}
                </>
              )}
            </dl>
          )}
        </DashboardPanel>

        {/* Review */}
        <DashboardPanel
          title="Review"
          icon={MessagesSquare}
          link={detail?.review ? { href: '/admin/reviews', label: 'Moderate' } : undefined}
        >
          {!detail ? (
            <PanelRowsSkeleton rows={1} />
          ) : !detail.review ? (
            <PanelEmpty icon={MessageSquareDashed} title="No review submitted" />
          ) : (
            <div className="flex flex-col gap-3 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <StarDisplay value={detail.review.rating} size="sm" />
                <ModerationBadge status={detail.review.status} />
                <VisibilityBadge status={detail.review.status} isPublic={detail.review.isPublic} />
              </div>
              <p className="text-[13px] text-foreground-soft [overflow-wrap:anywhere]">“{detail.review.reviewText}”</p>
              <p className="text-[11px] text-subtle">
                {REVIEW_CATEGORY_LABEL[detail.review.category]} · {formatDate(detail.review.createdAt)}
              </p>
            </div>
          )}
        </DashboardPanel>

        {/* Kid Games */}
        <DashboardPanel title="Kid Games" description="Progress summary" icon={GraduationCap}>
          {!detail ? (
            <PanelRowsSkeleton rows={2} />
          ) : !detail.kidGames ? (
            <PanelEmpty icon={GraduationCap} title="Never played" description="This account hasn't opened Kid Games." />
          ) : (
            <div className="px-4 py-4 sm:px-5">
              <dl className="grid grid-cols-3 gap-3">
                {[
                  ['XP', detail.kidGames.totalXp.toLocaleString()],
                  ['Played', detail.kidGames.gamesPlayed.toLocaleString()],
                  ['Completed', detail.kidGames.gamesCompleted.toLocaleString()],
                  ['Stars', detail.kidGames.stars.toLocaleString()],
                  ['Streak', `${detail.kidGames.bestDailyStreak}d`],
                  ['Badges', detail.kidGames.achievements.toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0 rounded-xl border border-border bg-surface-elevated/50 px-2.5 py-2">
                    <dt className="truncate text-[10px] font-medium uppercase tracking-wider text-subtle">{label}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {detail.kidGames.lastPlayedAt ? `Last played ${formatRelativeTime(detail.kidGames.lastPlayedAt)}` : 'No games finished yet'}
              </p>
            </div>
          )}
        </DashboardPanel>
      </div>

      {status.dialog}
    </div>
  );
}
