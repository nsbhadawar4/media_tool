'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UploadCloud } from 'lucide-react';
import { mediaApi } from '@/lib/api/media';
import { useToast } from '@/lib/toast/ToastContext';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { MediaGrid } from './MediaGrid';
import { MediaFilters } from './MediaFilters';
import { UploadButton } from './UploadButton';
import { UploadProgressPanel } from './UploadProgressPanel';
import { MediaViewerModals } from '@/components/modals/MediaViewerModals';
import { FolderPickerModal } from '@/components/modals/FolderPickerModal';
import { RenameModal } from '@/components/ui/RenameModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pagination } from '@/components/ui/Pagination';
import { ApiError } from '@/lib/api/client';
import type { FileType, Media, SortOption } from '@/types/api';

interface MediaLibraryViewProps {
  /** Restrict the grid (and default upload destination) to this folder. Omit to show/upload across the whole library. */
  folderId?: string;
  fixedFileType?: FileType;
  emptyMessage?: string;
}

export function MediaLibraryView({ folderId, fixedFileType, emptyMessage }: MediaLibraryViewProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [fileType, setFileType] = useState<FileType | undefined>(fixedFileType);
  const [page, setPage] = useState(1);
  const [isDragOver, setIsDragOver] = useState(false);

  const [mediaToRename, setMediaToRename] = useState<Media | null>(null);
  const [mediaToMove, setMediaToMove] = useState<Media | null>(null);
  const [mediaToDelete, setMediaToDelete] = useState<Media | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const queryKey = ['media', folderId ?? 'all', fileType ?? 'any', search, sort, page];
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => mediaApi.list({ folderId, fileType, search: search || undefined, sort, page, limit: 48 }),
  });

  const media = data?.data ?? [];
  const viewer = useMediaViewer(media);

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['media'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const uploadQueue = useUploadQueue({
    onFileUploaded: () => invalidateAfterChange(),
    onAllSettled: () => toast.success('Upload complete'),
  });

  const handleFilesSelected = (files: File[]) => {
    uploadQueue.addFiles(files, folderId ?? null);
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

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        handleFilesSelected(Array.from(e.dataTransfer.files));
      }}
      className="relative"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MediaFilters
          search={search}
          onSearchChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          sort={sort}
          onSortChange={setSort}
          fileType={fileType}
          onFileTypeChange={fixedFileType ? undefined : (v) => setFileType(v)}
          showTypeFilter={!fixedFileType}
        />
        <UploadButton onFilesSelected={handleFilesSelected} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : (
        <MediaGrid
          media={media}
          onPreview={(m) => viewer.openAt(m.id)}
          onRename={setMediaToRename}
          onMove={setMediaToMove}
          onDelete={setMediaToDelete}
          emptyMessage={emptyMessage}
        />
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

      <UploadProgressPanel queue={uploadQueue} />
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
        title={`Move "${mediaToMove?.originalName ?? ''}"`}
      />

      <ConfirmDialog
        isOpen={Boolean(mediaToDelete)}
        onClose={() => setMediaToDelete(null)}
        onConfirm={handleDelete}
        title="Move to trash?"
        description={`"${mediaToDelete?.originalName ?? ''}" will be moved to trash. You can restore it later.`}
        confirmLabel="Move to trash"
        isLoading={isDeleting}
      />
    </div>
  );
}
