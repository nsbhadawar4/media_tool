'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FolderClosed, Info, Lock, RotateCcw, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { DangerConfirmDialog } from '@/components/ui/DangerConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Badge } from '@/components/ui/Badge';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { trashApi, PERMANENT_DELETE_CONFIRMATION, type DeletionPreview, type TrashFolder } from '@/lib/api/trash';
import { cn } from '@/utils/cn';
import { useToast } from '@/lib/toast/ToastContext';
import { ApiError } from '@/lib/api/client';
import { formatBytes, formatDate, formatRelativeTime } from '@/utils/format';
import type { FileType, Media } from '@/types/api';

export default function TrashPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [typeFilter, setTypeFilter] = useState<FileType | undefined>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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

  /**
   * Memoised because `?? []` builds a new array on every render, and the derivations below
   * depend on these: without it each one recomputes every time anything on the page
   * changes state, which for a selection that updates on every click is most of the time.
   */
  const folders = useMemo(() => data?.data.folders ?? [], [data]);
  const media = useMemo(() => data?.data.media ?? [], [data]);
  const isEmpty = folders.length === 0 && media.length === 0;

  /**
   * Filtering applies to files only. A folder has no single type — it holds whatever was
   * inside it — so hiding folders under an "Images" filter would quietly remove the one
   * row that could restore a hundred of them.
   */
  const visibleMedia = typeFilter ? media.filter((item) => item.fileType === typeFilter) : media;

  /**
   * Counted from the full list, not the filtered one, so the buttons keep their numbers
   * while a filter is applied — a "Documents (3)" that turns into "Documents (0)" the
   * moment you pick Images is reporting the filter back at you, not the trash.
   */
  const typeCounts = useMemo(() => {
    const counts: Record<FileType, number> = { image: 0, video: 0, document: 0 };
    for (const item of media) counts[item.fileType] += 1;
    return counts;
  }, [media]);

  /**
   * Everything a selection may contain. Protected folders are excluded rather than shown
   * and refused: the row already disables its own delete, and offering a checkbox that
   * silently does nothing on submit is worse than not offering one.
   */
  const selectableIds = useMemo(
    () => [
      ...folders.filter((folder) => !folder.isProtected).map((folder) => folder._id),
      ...visibleMedia.map((item) => item.id),
    ],
    [folders, visibleMedia],
  );

  // A selection made before filtering must not survive into a view that no longer shows
  // it — deleting rows nobody can see is exactly the surprise this page cannot afford.
  const selected = useMemo(
    () => new Set(selectableIds.filter((id) => selectedIds.has(id))),
    [selectableIds, selectedIds],
  );

  const allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(selectableIds));

  /** Counts for the confirmation, from the rows on screen rather than a second request. */
  const selectionSummary = useMemo(() => {
    let files = 0;
    let folderCount = 0;
    let bytes = 0;

    for (const folder of folders) {
      if (!selected.has(folder._id)) continue;
      folderCount += 1 + folder.contains.folders;
      files += folder.contains.media;
      bytes += folder.contains.bytes;
    }
    for (const item of visibleMedia) {
      if (!selected.has(item.id)) continue;
      files += 1;
      bytes += item.size;
    }

    return { files, folders: folderCount, bytes };
  }, [folders, visibleMedia, selected]);

  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    try {
      const { data: result } = await trashApi.permanentlyDeleteMany(
        [...selected],
        PERMANENT_DELETE_CONFIRMATION,
      );

      if (result.succeeded.length > 0) {
        toast.success(
          `Permanently deleted ${result.deletedMedia} file(s)` +
            (result.deletedFolders > 0 ? ` and ${result.deletedFolders} folder(s)` : '') +
            ` · ${formatBytes(result.freedBytes)} freed`,
        );
      }
      // Reported rather than swallowed: a selection is routinely stale by the time it is
      // acted on, and silence would leave rows on screen with no explanation.
      if (result.failed.length > 0) {
        toast.error(`${result.failed.length} item(s) could not be deleted: ${result.failed[0]!.error}`);
      }

      setSelectedIds(new Set());
      invalidate();
      setIsBulkDeleteOpen(false);
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to delete permanently');
    } finally {
      setIsBulkDeleting(false);
    }
  };

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

      {!isLoading && !isError && !isEmpty && selectableIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <button
            type="button"
            onClick={toggleAll}
            className="flex items-center gap-2.5 text-sm text-foreground"
          >
            <span
              aria-hidden
              className={cn(
                'flex h-5 w-5 items-center justify-center rounded-md border-2 transition',
                allSelected ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-transparent',
              )}
            >
              <Check className="h-3 w-3" strokeWidth={3} />
            </span>
            {allSelected ? 'Clear selection' : `Select all (${selectableIds.length})`}
          </button>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setIsBulkDeleteOpen(true)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger transition hover:bg-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size} permanently
            </button>
          )}
        </div>
      )}

      {folders.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Folders ({folders.length})
          </h2>
          <div className="app-content-enter overflow-hidden rounded-2xl border border-border bg-surface">
            {folders.map((folder) => (
              <TrashFolderRow
                key={folder._id}
                folder={folder}
                isRestoring={restoringId === folder._id}
                isSelected={selected.has(folder._id)}
                onToggleSelect={folder.isProtected ? undefined : () => toggleOne(folder._id)}
                onRestore={() => handleRestore(folder._id)}
                onDelete={() => setDeleteTargetId(folder._id)}
              />
            ))}
          </div>
        </section>
      )}

      {media.length > 0 && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Files ({visibleMedia.length}
              {typeFilter && visibleMedia.length !== media.length ? ` of ${media.length}` : ''})
            </h2>
            <TrashTypeFilter value={typeFilter} onChange={setTypeFilter} counts={typeCounts} />
          </div>

          {visibleMedia.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted">
              No {typeFilter === 'image' ? 'images' : typeFilter === 'video' ? 'videos' : 'documents'} in
              the trash.
            </div>
          ) : (
            <div className="app-content-enter overflow-hidden rounded-2xl border border-border bg-surface">
              {visibleMedia.map((item) => (
                <TrashMediaRow
                  key={item.id}
                  media={item}
                  isRestoring={restoringId === item.id}
                  isSelected={selected.has(item.id)}
                  onToggleSelect={() => toggleOne(item.id)}
                  onRestore={() => handleRestore(item.id)}
                  onDelete={() => setDeleteTargetId(item.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <DangerConfirmDialog
        // Remounts per selection size so the typed phrase never carries over.
        key={`bulk-${selected.size}`}
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Permanently delete ${selected.size} item${selected.size === 1 ? '' : 's'}?`}
        consequences={
          <div>
            <p>The selected items and everything they hold</p>
            <ul className="mt-2 space-y-0.5 text-sm text-muted">
              <li>
                <span className="font-medium text-foreground">{selectionSummary.files}</span> file
                {selectionSummary.files === 1 ? '' : 's'}
              </li>
              {selectionSummary.folders > 0 && (
                <li>
                  <span className="font-medium text-foreground">{selectionSummary.folders}</span> folder
                  {selectionSummary.folders === 1 ? '' : 's'}
                </li>
              )}
              <li>
                <span className="font-medium text-foreground">{formatBytes(selectionSummary.bytes)}</span> of
                storage
              </li>
            </ul>
          </div>
        }
        confirmationPhrase={PERMANENT_DELETE_CONFIRMATION}
        isLoading={isBulkDeleting}
      />

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

/** One row's selection box. Same mark as the grid's, sized for a list row. */
function RowCheckbox({
  isSelected,
  onToggle,
  label,
  disabledReason,
}: {
  isSelected: boolean;
  onToggle?: () => void;
  label: string;
  disabledReason?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={isSelected}
      aria-label={label}
      onClick={onToggle}
      disabled={!onToggle}
      title={disabledReason}
      className={cn(
        'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition',
        isSelected ? 'border-accent bg-accent text-accent-foreground' : 'border-border text-transparent',
        onToggle ? 'hover:border-accent' : 'cursor-not-allowed opacity-40',
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </button>
  );
}

const TRASH_TYPE_FILTERS: Array<{ label: string; value: FileType | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'document' },
];

/**
 * Narrows the file list by type, the same way the gallery does.
 *
 * A trash holding a folder of photos and two stray PDFs reads as one undifferentiated
 * list, and the file you came to restore is the one you cannot find. A type with nothing
 * in it is left out entirely rather than shown as an empty option.
 */
function TrashTypeFilter({
  value,
  onChange,
  counts,
}: {
  value: FileType | undefined;
  onChange: (value: FileType | undefined) => void;
  counts: Record<FileType, number>;
}) {
  const options = TRASH_TYPE_FILTERS.filter(
    (option) => option.value === undefined || counts[option.value] > 0,
  );

  // Nothing to narrow: one type, or none.
  if (options.length <= 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            'rounded-lg px-2.5 py-1 text-xs font-medium transition',
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted hover:bg-surface-hover hover:text-foreground',
          )}
        >
          {option.label}
          {option.value && <span className="ml-1 tabular-nums opacity-70">{counts[option.value]}</span>}
        </button>
      ))}
    </div>
  );
}

function TrashFolderRow({
  folder,
  isRestoring,
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
}: {
  folder: TrashFolder;
  isRestoring: boolean;
  isSelected: boolean;
  /** Omitted for a protected folder, which cannot be deleted and so cannot be selected. */
  onToggleSelect?: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { media, folders: subfolders } = folder.contains;
  const hasContents = media > 0 || subfolders > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <RowCheckbox
        isSelected={isSelected}
        onToggle={onToggleSelect}
        label={`Select ${folder.name}`}
        disabledReason={folder.isProtected ? 'Protected folders cannot be deleted' : undefined}
      />
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
  isSelected,
  onToggleSelect,
  onRestore,
  onDelete,
}: {
  media: Media;
  isRestoring: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <RowCheckbox isSelected={isSelected} onToggle={onToggleSelect} label={`Select ${media.originalName}`} />
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
