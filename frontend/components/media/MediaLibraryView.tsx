'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { mediaApi } from '@/lib/api/media';
import { foldersApi } from '@/lib/api/folders';
import { useToast } from '@/lib/toast/ToastContext';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useMediaSelection } from '@/hooks/useMediaSelection';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { useDebounce } from '@/hooks/useDebounce';
import { MediaGrid, MediaGridSkeleton } from './MediaGrid';
import { MediaFilters } from './MediaFilters';
import { BulkActionBar } from './BulkActionBar';
import { UploadButton } from './UploadButton';
import { UploadProgressPanel } from './UploadProgressPanel';
import { MediaViewerModals } from '@/components/modals/MediaViewerModals';
import { FolderPickerModal } from '@/components/modals/FolderPickerModal';
import { RenameModal } from '@/components/ui/RenameModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { ErrorState } from '@/components/ui/ErrorState';
import { downloadFilesSequentially } from '@/utils/bulkDownload';
import { ApiError } from '@/lib/api/client';
import type { FileType, Media, SortOption } from '@/types/api';

const PAGE_SIZE = 48;

interface MediaLibraryViewProps {
  /** Restrict the grid (and default upload destination) to this folder. Omit to show/upload across the whole library. */
  folderId?: string;
  fixedFileType?: FileType;
  emptyMessage?: string;
}

export function MediaLibraryView({ folderId, fixedFileType, emptyMessage }: MediaLibraryViewProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  // The field updates instantly; only the debounced value reaches the query, so typing
  // a filename does not fire a request per keystroke.
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [sort, setSort] = useState<SortOption>('newest');
  const [fileType, setFileType] = useState<FileType | undefined>(fixedFileType);
  const [page, setPage] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  const [mediaToRename, setMediaToRename] = useState<Media | null>(null);
  const [mediaToMove, setMediaToMove] = useState<Media | null>(null);
  const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isBulkMoveOpen, setIsBulkMoveOpen] = useState(false);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [bulkLabel, setBulkLabel] = useState<string | null>(null);

  const { data, isLoading, isPlaceholderData, isError, error, refetch } = useQuery({
    queryKey: ['media', folderId ?? 'all', fileType ?? 'any', search, sort, page],
    queryFn: () =>
      mediaApi.list({ folderId, fileType, search: search || undefined, sort, page, limit: PAGE_SIZE }),
    // Keeps the previous page on screen while the next one loads, so the grid never
    // collapses to a skeleton mid-browse.
    placeholderData: (previous) => previous,
  });

  const media = data?.data ?? [];
  const viewer = useMediaViewer(media);
  const selection = useMediaSelection(media);

  // Selecting items in one view then acting on them from another would be surprising, so
  // changing what the grid shows drops the selection.
  const viewKey = `${folderId ?? 'all'}|${fileType ?? 'any'}|${search}|${sort}|${page}`;
  const { clear: clearSelection } = selection;
  useEffect(() => {
    clearSelection();
  }, [viewKey, clearSelection]);

  // Escape is the conventional way out of a selection; the viewer owns it while open.
  const hasSelection = selection.selectedCount > 0;
  const isViewerOpen = Boolean(viewer.activeMedia);
  useEffect(() => {
    if (!hasSelection || isViewerOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearSelection();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [hasSelection, isViewerOpen, clearSelection]);

  const invalidateAfterChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['media'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }, [queryClient]);

  const uploadQueue = useUploadQueue({
    onFileUploaded: () => invalidateAfterChange(),
    onAllSettled: () => toast.success('Upload complete'),
  });

  const handleFilesSelected = (files: File[]) => {
    uploadQueue.addFiles(files, folderId ?? null);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setPage(1);
  };

  const handleRename = async (newName: string) => {
    if (!mediaToRename) return;
    try {
      await mediaApi.rename(mediaToRename.id, newName);
      toast.success('File renamed');
      invalidateAfterChange();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to rename file');
    }
  };

  const handleMove = async (targetFolderId: string | null) => {
    if (!mediaToMove) return;
    try {
      await mediaApi.move(mediaToMove.id, targetFolderId);
      toast.success('File moved');
      invalidateAfterChange();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move file');
    }
  };

  const handleSetCover = async (item: Media) => {
    if (!folderId) return;
    try {
      await foldersApi.update(folderId, { coverImage: item.id });
      toast.success('Folder cover updated');
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to set folder cover');
    }
  };

  const handleDelete = async () => {
    if (!mediaToDelete) return;
    setIsDeleting(true);
    try {
      await mediaApi.remove(mediaToDelete.id);
      toast.success('Moved to trash');
      invalidateAfterChange();
      setMediaToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete file');
    } finally {
      setIsDeleting(false);
    }
  };

  /** Summarises a bulk response, which can partially succeed. */
  const reportBulkResult = (
    result: { succeeded: Media[]; failed: Array<{ id: string; error: string }> },
    { done, failedAll }: { done: string; failedAll: string },
  ) => {
    const { succeeded, failed } = result;
    if (succeeded.length === 0) {
      toast.error(failedAll);
      return;
    }
    toast.success(
      `${done} ${succeeded.length} file${succeeded.length === 1 ? '' : 's'}` +
        (failed.length > 0 ? ` · ${failed.length} skipped` : ''),
    );
  };

  const handleBulkDelete = async () => {
    const ids = selection.selectedItems.map((item) => item.id);
    setBulkLabel(`Deleting ${ids.length}…`);
    try {
      const { data: result } = await mediaApi.bulkRemove(ids);
      reportBulkResult(result, {
        done: 'Moved to trash:',
        failedAll: 'None of the selected files could be moved to trash',
      });
      invalidateAfterChange();
      clearSelection();
      setIsBulkDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete files');
    } finally {
      setBulkLabel(null);
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    const ids = selection.selectedItems.map((item) => item.id);
    setBulkLabel(`Moving ${ids.length}…`);
    try {
      const { data: result } = await mediaApi.bulkMove(ids, targetFolderId);
      reportBulkResult(result, {
        done: 'Moved',
        failedAll: 'None of the selected files could be moved',
      });
      invalidateAfterChange();
      clearSelection();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move files');
    } finally {
      setBulkLabel(null);
    }
  };

  // Cancels an in-progress bulk download if the component unmounts part-way through.
  const downloadAbort = useRef<AbortController | null>(null);
  useEffect(() => () => downloadAbort.current?.abort(), []);

  const handleBulkDownload = async () => {
    const files = selection.selectedItems.map((item) => ({
      url: item.downloadUrl,
      name: item.originalName,
    }));

    const controller = new AbortController();
    downloadAbort.current = controller;
    setBulkLabel(`Starting ${files.length} download${files.length === 1 ? '' : 's'}…`);

    try {
      const started = await downloadFilesSequentially(files, {
        signal: controller.signal,
        onProgress: (completed, total) => setBulkLabel(`Downloading ${completed} of ${total}…`),
      });
      if (started > 0) {
        toast.success(`Started ${started} download${started === 1 ? '' : 's'}`);
      }
    } finally {
      downloadAbort.current = null;
      setBulkLabel(null);
    }
  };

  const total = data?.meta?.total ?? media.length;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragOver(false);
        handleFilesSelected(Array.from(event.dataTransfer.files));
      }}
      className="relative"
    >
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <MediaFilters
          search={searchInput}
          onSearchChange={handleSearchChange}
          sort={sort}
          onSortChange={setSort}
          fileType={fileType}
          onFileTypeChange={fixedFileType ? undefined : (value) => setFileType(value)}
          showTypeFilter={!fixedFileType}
        />
        <div className="flex shrink-0 items-center gap-3">
          {!isLoading && (
            <p className="hidden text-xs text-muted sm:block">
              {total} file{total === 1 ? '' : 's'}
            </p>
          )}
          <UploadButton onFilesSelected={handleFilesSelected} />
        </div>
      </div>

      {/* Falling through to the empty state here would tell the user their folder is
          empty when the request simply failed. */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} subject="files" />
      ) : isLoading ? (
        <MediaGridSkeleton />
      ) : (
        <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
          <MediaGrid
            media={media}
            onPreview={(item) => viewer.openAt(item.id)}
            onRename={setMediaToRename}
            onMove={setMediaToMove}
            onDelete={setMediaToDelete}
            onSetCover={folderId ? handleSetCover : undefined}
            emptyMessage={searchInput ? `No files match “${searchInput}”.` : emptyMessage}
            selection={selection}
          />
        </div>
      )}

      {data?.meta && <Pagination meta={data.meta} onPageChange={setPage} />}

      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-accent/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface px-10 py-8">
            <UploadCloud className="h-8 w-8 text-accent" />
            <p className="text-sm font-medium text-foreground">Drop files to upload</p>
          </div>
        </div>
      )}

      <BulkActionBar
        selection={selection}
        onDownload={handleBulkDownload}
        onMove={() => setIsBulkMoveOpen(true)}
        onDelete={() => setIsBulkDeleteOpen(true)}
        busyLabel={bulkLabel}
      />

      {/* Both dock to the bottom of the viewport, so the panel steps aside for the bulk bar. */}
      <UploadProgressPanel queue={uploadQueue} isRaised={selection.selectedCount > 0} />
      <MediaViewerModals viewer={viewer} />

      <RenameModal
        key={mediaToRename?.id ?? 'rename-none'}
        isOpen={Boolean(mediaToRename)}
        onClose={() => setMediaToRename(null)}
        onSubmit={handleRename}
        title="Rename file"
        initialValue={mediaToRename?.originalName ?? ''}
      />

      <FolderPickerModal
        isOpen={Boolean(mediaToMove)}
        onClose={() => setMediaToMove(null)}
        onSelect={handleMove}
        title={`Move “${mediaToMove?.originalName ?? ''}”`}
      />

      <FolderPickerModal
        isOpen={isBulkMoveOpen}
        onClose={() => setIsBulkMoveOpen(false)}
        onSelect={handleBulkMove}
        title={`Move ${selection.selectedCount} file${selection.selectedCount === 1 ? '' : 's'}`}
      />

      <ConfirmDialog
        isOpen={Boolean(mediaToDelete)}
        onClose={() => setMediaToDelete(null)}
        onConfirm={handleDelete}
        title="Move to trash?"
        description={`“${mediaToDelete?.originalName ?? ''}” will be moved to trash. You can restore it later.`}
        confirmLabel="Move to trash"
        isLoading={isDeleting}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        onClose={() => setIsBulkDeleteOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Move ${selection.selectedCount} file${selection.selectedCount === 1 ? '' : 's'} to trash?`}
        description="They will be moved to trash together. You can restore them later."
        confirmLabel="Move to trash"
        isLoading={Boolean(bulkLabel)}
      />
    </div>
  );
}
