'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderClosed, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { trashApi } from '@/lib/api/trash';
import { useToast } from '@/lib/toast/ToastContext';
import { ApiError } from '@/lib/api/client';
import { iconForFileType } from '@/utils/fileIcons';
import { formatBytes, formatDate } from '@/utils/format';
import type { Folder, Media } from '@/types/api';

type TrashTarget = { kind: 'folder'; item: Folder } | { kind: 'media'; item: Media };

export default function TrashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TrashTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['trash'],
    queryFn: () => trashApi.list(),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trash'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['media'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await trashApi.restore(id);
      toast.success('Restored');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to restore');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const id = deleteTarget.kind === 'folder' ? deleteTarget.item._id : deleteTarget.item.id;
      await trashApi.permanentlyDelete(id);
      toast.success('Permanently deleted');
      invalidate();
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete permanently');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) return <FullPageSpinner />;

  const folders = data?.data.folders ?? [];
  const media = data?.data.media ?? [];
  const isEmpty = folders.length === 0 && media.length === 0;

  return (
    <div>
      <PageHeader title="Trash" description="Deleted items are kept here until you permanently remove them." />

      {isEmpty && <EmptyState icon={Trash2} title="Trash is empty" description="Deleted folders and files will show up here." />}

      {folders.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Folders ({folders.length})</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {folders.map((folder) => (
              <div key={folder._id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                <FolderClosed className="h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{folder.name}</p>
                  <p className="text-xs text-muted">Deleted {folder.deletedAt ? formatDate(folder.deletedAt) : ''}</p>
                </div>
                <Badge variant="danger">Deleted</Badge>
                <button
                  type="button"
                  onClick={() => handleRestore(folder._id)}
                  disabled={restoringId === folder._id}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ kind: 'folder', item: folder })}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete forever
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {media.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Files ({media.length})</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {media.map((item) => {
              const Icon = iconForFileType(item.fileType, item.mimeType);
              return (
                <div key={item.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
                  <Icon className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.originalName}</p>
                    <p className="text-xs text-muted">
                      {formatBytes(item.size)} &middot; Deleted {item.deletedAt ? formatDate(item.deletedAt) : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(item.id)}
                    disabled={restoringId === item.id}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ kind: 'media', item })}
                    className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete forever
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handlePermanentDelete}
        title="Delete forever?"
        description="This cannot be undone. The file or folder will be permanently removed from storage."
        confirmLabel="Delete forever"
        isLoading={isDeleting}
      />
    </div>
  );
}
