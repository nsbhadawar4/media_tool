'use client';

import { useQuery } from '@tanstack/react-query';
import { Users, UserCheck, UserX, FolderClosed, Image as ImageIcon, HardDrive } from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/admin/StatCard';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatBytes } from '@/utils/format';

/** Installation-wide figures. Each user's own numbers live on their /dashboard. */
export default function AdminStatsPage() {
  const query = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: ({ signal }) => adminApi.stats(signal),
  });

  const stats = query.data?.data;
  // The cards take a string, so an absent value reads as a dash rather than a premature 0.
  const show = (value: number | undefined) => (value === undefined ? '—' : value.toLocaleString());

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Statistics" description="Totals across every account on this installation." />

      {query.isError ? (
        <ErrorState error={query.error} subject="statistics" onRetry={() => query.refetch()} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          <StatCard icon={Users} label="Users" value={show(stats?.totalUsers)} />
          <StatCard icon={UserCheck} label="Active" value={show(stats?.activeUsers)} accent="success" />
          <StatCard icon={UserX} label="Deactivated" value={show(stats?.inactiveUsers)} accent="warning" />
          <StatCard icon={FolderClosed} label="Folders" value={show(stats?.totalFolders)} />
          <StatCard icon={ImageIcon} label="Files" value={show(stats?.totalMedia)} />
          <StatCard
            icon={HardDrive}
            label="Storage used"
            value={stats ? formatBytes(stats.storageUsedBytes) : '—'}
          />
        </div>
      )}
    </div>
  );
}
