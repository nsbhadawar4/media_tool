'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { ActivityIcon } from '@/components/admin/ActivityIcon';
import { activityApi } from '@/lib/api/activity';
import { formatDate } from '@/utils/format';
import type { ActivityLog } from '@/types/api';

const ACTION_LABELS: Record<string, string> = {
  login: 'Signed in',
  login_failed: 'Failed sign-in attempt',
  logout: 'Signed out',
  folder_created: 'Folder created',
  folder_renamed: 'Folder renamed',
  folder_updated: 'Folder updated',
  folder_deleted: 'Folder moved to trash',
  folder_restored: 'Folder restored',
  folder_permanently_deleted: 'Folder permanently deleted',
  media_uploaded: 'File uploaded',
  media_renamed: 'File renamed',
  media_updated: 'File updated',
  media_deleted: 'File moved to trash',
  media_restored: 'File restored',
  media_permanently_deleted: 'File permanently deleted',
  media_moved: 'File moved',
};

/** Buckets consecutive logs by calendar day, newest first, for the timeline's date headings. */
function groupByDay(logs: ActivityLog[]): Array<{ key: string; label: string; items: ActivityLog[] }> {
  const today = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayStart = startOf(today);
  const groups = new Map<string, { key: string; label: string; items: ActivityLog[] }>();

  for (const log of logs) {
    const date = new Date(log.createdAt);
    const key = String(startOf(date));
    let group = groups.get(key);
    if (!group) {
      const diffDays = Math.round((todayStart - startOf(date)) / 86_400_000);
      const label =
        diffDays === 0
          ? 'Today'
          : diffDays === 1
            ? 'Yesterday'
            : date.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      group = { key, label, items: [] };
      groups.set(key, group);
    }
    group.items.push(log);
  }
  return [...groups.values()];
}

export default function ActivityPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['activity', page, action],
    queryFn: () => activityApi.list({ page, limit: 40, action: action || undefined }),
  });

  const logs = data?.data ?? [];

  return (
    <div>
      <PageHeader
        icon={Activity}
        eyebrow="Audit trail"
        title="Activity"
        description="A full audit trail of everything that happens in your library."
        actions={
          <Select
            aria-label="Filter by action"
            value={action}
            onChange={(event) => {
              setAction(event.target.value);
              setPage(1);
            }}
            className="w-full sm:w-52"
            options={[
              { label: 'All actions', value: '' },
              ...Object.entries(ACTION_LABELS).map(([value, label]) => ({ value, label })),
            ]}
          />
        }
      />

      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} subject="activity logs" />
      ) : isLoading ? (
        <ListSkeleton rows={10} />
      ) : logs.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Actions you take will be recorded here." />
      ) : (
        <div className="app-content-enter space-y-8">
          {groupByDay(logs).map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{group.label}</h2>
              {/* The vertical rule is the timeline; each icon sits on it. */}
              <ol className="relative ml-4 space-y-1 border-l border-border-strong pl-6">
                {group.items.map((log, logIndex) => (
                  <li
                    key={log._id}
                    style={{ ['--i' as string]: logIndex } as React.CSSProperties}
                    className="anim-rise relative rounded-xl px-3 py-2.5 transition-colors hover:bg-surface"
                  >
                    <span className="absolute -left-[41px] top-2.5 flex h-8 w-8 items-center justify-center rounded-full border border-border-strong bg-surface-elevated text-accent shadow-card">
                      <ActivityIcon action={log.action} className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                      <p className="min-w-0 wrap-break-word text-sm font-medium text-foreground">{log.message}</p>
                      <time
                        dateTime={log.createdAt}
                        title={formatDate(log.createdAt)}
                        className="shrink-0 text-xs tabular-nums text-muted"
                      >
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </time>
                    </div>
                    <p className="mt-0.5 wrap-break-word text-xs text-muted">
                      {ACTION_LABELS[log.action] ?? log.action}
                      {log.performedByEmail ? ` · ${log.performedByEmail}` : ''}
                      {log.ip ? ` · ${log.ip}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} />}
    </div>
  );
}
