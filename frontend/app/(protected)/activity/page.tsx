'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Select } from '@/components/ui/Select';
import { Pagination } from '@/components/ui/Pagination';
import { ActivityIcon } from '@/components/admin/ActivityIcon';
import { activityApi } from '@/lib/api/activity';
import { formatDate } from '@/utils/format';

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
        title="Activity Logs"
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
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-surface-hover" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
              </div>
            </div>
          ))}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState icon={Activity} title="No activity yet" description="Actions you take will be recorded here." />
      ) : (
        <div className="app-content-enter overflow-hidden rounded-2xl border border-border bg-surface">
          {logs.map((log) => (
            <div key={log._id} className="flex items-start gap-3 border-b border-border px-4 py-3.5 last:border-b-0">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <ActivityIcon action={log.action} className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="wrap-break-word text-sm text-foreground">{log.message}</p>
                <p className="mt-0.5 wrap-break-word text-xs text-muted">
                  {ACTION_LABELS[log.action] ?? log.action} &middot; {formatDate(log.createdAt)}
                  {log.performedByEmail ? ` · ${log.performedByEmail}` : ''}
                  {log.ip ? ` · ${log.ip}` : ''}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} />}
    </div>
  );
}
