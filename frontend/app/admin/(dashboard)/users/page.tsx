'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Search,
  ShieldCheck,
  UserRound,
  HardDrive,
  FolderClosed,
  Image as ImageIcon,
} from 'lucide-react';
import { adminApi } from '@/lib/api/admin';
import { useDebounce } from '@/hooks/useDebounce';
import { useToast } from '@/lib/toast/ToastContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { formatBytes, formatDate } from '@/utils/format';
import type { AdminUserSummary } from '@/types/api';

type StatusFilter = '' | 'active' | 'inactive';
type RoleFilter = '' | 'user' | 'admin';

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'active' },
  { label: 'Deactivated', value: 'inactive' },
];

const ROLE_OPTIONS = [
  { label: 'All roles', value: '' },
  { label: 'Users', value: 'user' },
  { label: 'Administrators', value: 'admin' },
];

export default function AdminUsersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [role, setRole] = useState<RoleFilter>('');
  const [page, setPage] = useState(1);
  const [pendingStatus, setPendingStatus] = useState<AdminUserSummary | null>(null);

  const debouncedSearch = useDebounce(search, 300);

  const params = {
    search: debouncedSearch || undefined,
    status: status || undefined,
    role: role || undefined,
    page,
    limit: PAGE_SIZE,
  };

  const query = useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: ({ signal }) => adminApi.listUsers(params, signal),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setStatus(id, isActive),
    onSuccess: (_result, variables) => {
      toast.success(variables.isActive ? 'Account activated' : 'Account deactivated');
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setPendingStatus(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const users = query.data?.data ?? [];
  const meta = query.data?.meta;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Accounts on this installation. Their folders and files are never shown here."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or email…"
            aria-label="Search users"
            className="w-full rounded-xl border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
          aria-label="Filter by status"
        />
        <Select
          options={ROLE_OPTIONS}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as RoleFilter);
            setPage(1);
          }}
          aria-label="Filter by role"
        />
      </div>

      {query.isError ? (
        <ErrorState error={query.error} subject="users" onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users found" description="Try a different search or filter." />
      ) : (
        <div className="flex flex-col gap-2">
          {users.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <Card key={user.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    {user.role === 'admin' ? (
                      <ShieldCheck className="h-5 w-5" />
                    ) : (
                      <UserRound className="h-5 w-5" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                      {user.role === 'admin' && <Badge variant="accent">Admin</Badge>}
                      {!user.isActive && <Badge variant="danger">Deactivated</Badge>}
                      {isSelf && <Badge>You</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted">{user.email}</p>
                    <p className="mt-0.5 text-xs text-muted">Joined {formatDate(user.createdAt)}</p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-4 text-xs text-muted">
                  <span className="inline-flex items-center gap-1.5" title="Folders">
                    <FolderClosed className="h-3.5 w-3.5" />
                    {user.folderCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5" title="Files">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {user.mediaCount}
                  </span>
                  <span className="inline-flex items-center gap-1.5" title="Storage used">
                    <HardDrive className="h-3.5 w-3.5" />
                    {formatBytes(user.storageUsedBytes)}
                  </span>
                </div>

                <div className="shrink-0">
                  <Button
                    variant={user.isActive ? 'secondary' : 'primary'}
                    size="sm"
                    // Deactivating yourself would lock you out; the API refuses it too.
                    disabled={isSelf || statusMutation.isPending}
                    onClick={() => setPendingStatus(user)}
                  >
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} />}

      <ConfirmDialog
        isOpen={pendingStatus !== null}
        onClose={() => setPendingStatus(null)}
        title={pendingStatus?.isActive ? 'Deactivate this account?' : 'Activate this account?'}
        description={
          pendingStatus?.isActive
            ? `${pendingStatus?.email} will be signed out and unable to log in. Their folders and files are kept untouched.`
            : `${pendingStatus?.email} will be able to log in again.`
        }
        confirmLabel={pendingStatus?.isActive ? 'Deactivate' : 'Activate'}
        isDangerous={pendingStatus?.isActive}
        isLoading={statusMutation.isPending}
        onConfirm={() =>
          pendingStatus &&
          statusMutation.mutate({ id: pendingStatus.id, isActive: !pendingStatus.isActive })
        }
      />
    </div>
  );
}
