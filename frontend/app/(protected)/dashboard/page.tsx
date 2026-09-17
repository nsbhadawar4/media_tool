'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  FolderClosed,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  FileText,
  Trash2,
  Video,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineErrorState } from '@/components/ui/ErrorState';
import { Button } from '@/components/ui/Button';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { ActivityIcon } from '@/components/admin/ActivityIcon';
import { UploadButton } from '@/components/media/UploadButton';
import { UploadProgressPanel } from '@/components/media/UploadProgressPanel';
import { MediaViewerModals } from '@/components/modals/MediaViewerModals';
import { FolderModal } from '@/components/folders/FolderModal';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import { useToast } from '@/lib/toast/ToastContext';
import { dashboardApi } from '@/lib/api/dashboard';
import { foldersApi } from '@/lib/api/folders';
import { ApiError } from '@/lib/api/client';
import { formatBytes, formatRelativeTime } from '@/utils/format';
import { iconForFileType } from '@/utils/fileIcons';

const RECENT_TILE_GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
  });
  const recentQuery = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => dashboardApi.recent(),
  });

  const stats = statsQuery.data;
  const recentUploads = recentQuery.data?.data.recentUploads ?? [];
  const recentActivity = recentQuery.data?.data.recentActivity ?? [];
  const viewer = useMediaViewer(recentUploads);

  const invalidateAfterUpload = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['media'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
  };

  const uploadQueue = useUploadQueue({
    onFileUploaded: invalidateAfterUpload,
    onAllSettled: () => toast.success('Upload complete'),
  });

  const handleCreateFolder = async (input: { name: string; description?: string }) => {
    try {
      await foldersApi.create({ ...input, parentFolder: null });
      toast.success('Folder created');
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to create folder');
    }
  };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="An overview of your private library."
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsCreateFolderOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Create folder</span>
              <span className="sm:hidden">Folder</span>
            </Button>
            <UploadButton onFilesSelected={(files) => uploadQueue.addFiles(files, null)} label="Upload" />
          </>
        }
      />

      {statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} subject="your library stats" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          {statsQuery.isLoading || !stats ? (
            Array.from({ length: 6 }).map((_, index) => <StatCardSkeleton key={index} />)
          ) : (
            <>
              <StatCard icon={FolderClosed} label="Folders" value={String(stats.data.totalFolders)} />
              <StatCard icon={ImageIcon} label="Images" value={String(stats.data.totalImages)} accent="success" />
              <StatCard icon={Video} label="Videos" value={String(stats.data.totalVideos)} accent="warning" />
              <StatCard icon={FileText} label="Documents" value={String(stats.data.totalDocuments)} />
              <StatCard icon={HardDrive} label="Storage used" value={formatBytes(stats.data.storageUsedBytes)} />
              <StatCard icon={Trash2} label="In trash" value={String(stats.data.trashItems)} accent="danger" />
            </>
          )}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Recent uploads</h2>
          </CardHeader>
          <CardBody>
            {recentQuery.isError ? (
              <InlineErrorState
                error={recentQuery.error}
                onRetry={() => recentQuery.refetch()}
                subject="recent uploads"
              />
            ) : recentQuery.isLoading ? (
              <div className={RECENT_TILE_GRID}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="aspect-square animate-pulse rounded-xl bg-surface-hover" />
                ))}
              </div>
            ) : recentUploads.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No uploads yet" description="Files you upload will appear here." />
            ) : (
              <div className={RECENT_TILE_GRID}>
                {recentUploads.map((media) => {
                  const Icon = iconForFileType(media.fileType, media.mimeType);
                  return (
                    <button
                      key={media.id}
                      type="button"
                      onClick={() => viewer.openAt(media.id)}
                      title={media.originalName}
                      aria-label={`Preview ${media.originalName}`}
                      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-surface-hover"
                    >
                      {media.fileType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={media.thumbnailUrl ?? media.viewUrl}
                          alt={media.originalName}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                        />
                      ) : (
                        <Icon className="h-7 w-7 text-muted" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <button
              type="button"
              onClick={() => router.push('/activity')}
              className="shrink-0 rounded-lg px-1 text-xs font-medium text-accent transition hover:underline"
            >
              View all
            </button>
          </CardHeader>
          {/* padded={false} rather than a p-0 override — see CardBody for why. */}
          <CardBody padded={false} className="max-h-96 min-h-0 flex-1 overflow-y-auto">
            {recentQuery.isError ? (
              <InlineErrorState error={recentQuery.error} onRetry={() => recentQuery.refetch()} subject="activity" />
            ) : recentQuery.isLoading ? (
              <div className="space-y-3 p-5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
                      <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Activity} title="No activity yet" />
              </div>
            ) : (
              recentActivity.map((log) => (
                <div key={log._id} className="flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <ActivityIcon action={log.action} className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="wrap-break-word text-xs font-medium text-foreground">{log.message}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{formatRelativeTime(log.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <UploadProgressPanel queue={uploadQueue} />
      <MediaViewerModals viewer={viewer} />
      <FolderModal
        key={isCreateFolderOpen ? 'create-open' : 'create-closed'}
        isOpen={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        onSubmit={handleCreateFolder}
      />
    </div>
  );
}
