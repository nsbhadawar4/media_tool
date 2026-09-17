'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderClosed, Info, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { DangerConfirmDialog } from '@/components/ui/DangerConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { trashApi, PERMANENT_DELETE_CONFIRMATION, type DeletionPreview, type TrashFolder } from '@/lib/api/trash';
import { useToast } from '@/lib/toast/ToastContext';
import { ApiError } from '@/lib/api/client';
import { formatBytes, formatDate, formatRelativeTime } from '@/utils/format';
import type { Media } from '@/types/api';

export default function TrashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['trash'],
    queryFn: () => trashApi.list(),
  });

  // The blast radius is fetched fresh when the dialog opens rather than read from the
  // list, so the warning reflects the item's state right now.
  const { data: preview, isLoading: isPreviewLoading } = useQuery({
    queryKey: ['trash-deletion-preview', deleteTargetId],
    queryFn: () => trashApi.deletionPreview(deleteTargetId!),
    enabled: Boolean(deleteTargetId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['trash'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder'] });
    queryClient.invalidateQueries({ queryKey: ['media'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      const { data: result } = await trashApi.restore(id);
      const recovered = (result.restoredMedia ?? 0) + (result.restoredFolders ?? 0);
      toast.success(
        recovered > 0
          ? `Restored, along with ${result.restoredMedia} file(s) and ${result.restoredFolders} subfolder(s)`
          : 'Restored',
      );
      if (result.reparentedToRoot) {
        toast.info('The original parent folder no longer exists, so this was restored to the top level.');
      }
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to restore');
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      const { data: result } = await trashApi.permanentlyDelete(deleteTargetId, PERMANENT_DELETE_CONFIRMATION);
      toast.success(
        `Permanently deleted ${result.deletedMedia} file(s)` +
          (result.deletedFolders > 1 ? ` and ${result.deletedFolders} folder(s)` : '') +
          ` · ${formatBytes(result.freedBytes)} freed`,
      );
      invalidate();
      setDeleteTargetId(null);
    } catch (err) {
      // Surfaced inside the dialog so the admin sees it next to what they just confirmed.
      throw new Error(err instanceof ApiError ? err.message : 'Failed to delete permanently');
    } finally {
      setIsDeleting(false);
    }
  };

  const folders = data?.data.folders ?? [];
  const media = data?.data.media ?? [];
  const isEmpty = folders.length === 0 && media.length === 0;

  return (
    <div>
      <PageHeader
        title="Trash"
        description="Deleted items stay here until you remove them by hand. Nothing is erased from storage on its own."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <div className="text-sm text-muted">
          <p>
            Deleting a file or folder never touches the underlying storage — it only hides the item
            here. <span className="font-medium text-foreground">Restore</span> puts it back where it was,
            with everything that was inside it.
          </p>
          <p className="mt-1">
            Only <span className="font-medium text-danger">Delete permanently</span> erases the actual
            files, and that step cannot be undone.
          </p>
        </div>
      </div>

      {isError && <ErrorState error={error} onRetry={() => refetch()} subject="the trash" />}

      {isLoading && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-hover" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isError && isEmpty && (
        <EmptyState
          icon={Trash2}
          title="Trash is empty"
          description="Deleted folders and files will show up here, and stay until you remove them."
        />
      )}

      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Folders ({folders.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {folders.map((folder) => (
              <TrashFolderRow
                key={folder._id}
                folder={folder}
                isRestoring={restoringId === folder._id}
                onRestore={() => handleRestore(folder._id)}
                onDelete={() => setDeleteTargetId(folder._id)}
              />
            ))}
          </div>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Files ({media.length})
          </h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface">
            {media.map((item) => (
              <TrashMediaRow
                key={item.id}
                media={item}
                isRestoring={restoringId === item.id}
                onRestore={() => handleRestore(item.id)}
                onDelete={() => setDeleteTargetId(item.id)}
              />
            ))}
          </div>
        </section>
      )}

      <DangerConfirmDialog
        // Remounts per target so the typed phrase never carries over between items.
        key={deleteTargetId ?? 'none'}
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handlePermanentDelete}
        title="Permanently delete this?"
        consequences={<DeletionConsequences preview={preview?.data} isLoading={isPreviewLoading} />}
        confirmationPhrase={PERMANENT_DELETE_CONFIRMATION}
        isLoading={isDeleting}
      />
    </div>
  );
}

/** Spells out exactly what is about to be destroyed, using numbers from the server. */
function DeletionConsequences({ preview, isLoading }: { preview?: DeletionPreview; isLoading: boolean }) {
  if (isLoading || !preview) {
    return <p className="text-sm text-muted">Checking what this would remove…</p>;
  }

  return (
    <div>
      <p>
        <span className="font-semibold">{preview.name}</span>
        {preview.type === 'folder' ? ' and everything it holds' : ''}
      </p>
      <ul className="mt-2 space-y-0.5 text-sm text-muted">
        <li>
          <span className="font-medium text-foreground">{preview.media}</span> file
          {preview.media === 1 ? '' : 's'}
        </li>
        {preview.type === 'folder' && (
          <li>
            <span className="font-medium text-foreground">{preview.folders}</span> subfolder
            {preview.folders === 1 ? '' : 's'}
          </li>
        )}
        <li>
          <span className="font-medium text-foreground">{formatBytes(preview.bytes)}</span> of storage
        </li>
      </ul>
    </div>
  );
}

function TrashFolderRow({
  folder,
  isRestoring,
  onRestore,
  onDelete,
}: {
  folder: TrashFolder;
  isRestoring: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { media, folders: subfolders } = folder.contains;
  const hasContents = media > 0 || subfolders > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <FolderClosed className="h-4 w-4 shrink-0 text-accent" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{folder.name}</p>
          {folder.isProtected && (
            <span className="inline-flex items-center gap-1 text-xs text-muted" title="Protected folder">
              <Lock className="h-3 w-3" />
              Protected
            </span>
          )}
        </div>
        <p className="text-xs text-muted">
          {hasContents ? (
            <>
              Holds {media} file{media === 1 ? '' : 's'}
              {subfolders > 0 && ` · ${subfolders} subfolder${subfolders === 1 ? '' : 's'}`}
              {` · ${formatBytes(folder.contains.bytes)}`}
              {' · '}
            </>
          ) : (
            'Empty · '
          )}
          Deleted {folder.deletedAt ? formatRelativeTime(folder.deletedAt) : ''}
          {folder.deletedAt && <span title={formatDate(folder.deletedAt)} />}
        </p>
      </div>

      <Badge variant="danger">In trash</Badge>
      <RowActions isRestoring={isRestoring} onRestore={onRestore} onDelete={onDelete} disableDelete={folder.isProtected} />
    </div>
  );
}

function TrashMediaRow({
  media,
  isRestoring,
  onRestore,
  onDelete,
}: {
  media: Media;
  isRestoring: boolean;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg">
        <MediaThumbnail media={media} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{media.originalName}</p>
        <p className="text-xs text-muted" title={media.deletedAt ? formatDate(media.deletedAt) : undefined}>
          {formatBytes(media.size)} · Deleted {media.deletedAt ? formatRelativeTime(media.deletedAt) : ''}
        </p>
      </div>

      <RowActions isRestoring={isRestoring} onRestore={onRestore} onDelete={onDelete} />
    </div>
  );
}

function RowActions({
  isRestoring,
  onRestore,
  onDelete,
  disableDelete = false,
}: {
  isRestoring: boolean;
  onRestore: () => void;
  onDelete: () => void;
  disableDelete?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onRestore}
        disabled={isRestoring}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-accent transition hover:bg-accent/10 disabled:opacity-50"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        {isRestoring ? 'Restoring…' : 'Restore'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={disableDelete}
        title={disableDelete ? 'This folder is protected and cannot be deleted' : undefined}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete permanently
      </button>
    </div>
  );
}
