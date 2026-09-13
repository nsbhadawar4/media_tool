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
import { FullPageSpinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/admin/StatCard';
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
import { formatBytes, formatDate } from '@/utils/format';
import { iconForFileType } from '@/utils/fileIcons';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
  });
  const { data: recent, isLoading: recentLoading } = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => dashboardApi.recent(),
  });

  const recentUploads = recent?.data.recentUploads ?? [];
  const recentActivity = recent?.data.recentActivity ?? [];
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
              Create folder
            </Button>
            <UploadButton onFilesSelected={(files) => uploadQueue.addFiles(files, null)} label="Quick upload" />
          </>
        }
      />

      {statsLoading || !stats ? (
        <FullPageSpinner />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <StatCard icon={FolderClosed} label="Total Folders" value={String(stats.data.totalFolders)} />
          <StatCard icon={ImageIcon} label="Total Images" value={String(stats.data.totalImages)} accent="success" />
          <StatCard icon={Video} label="Total Videos" value={String(stats.data.totalVideos)} accent="warning" />
          <StatCard icon={FileText} label="Total Documents" value={String(stats.data.totalDocuments)} />
          <StatCard icon={HardDrive} label="Storage Used" value={formatBytes(stats.data.storageUsedBytes)} />
          <StatCard icon={Trash2} label="Trash Items" value={String(stats.data.trashItems)} accent="danger" />
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <h2 className="text-sm font-semibold text-foreground">Recent uploads</h2>
          </CardHeader>
          <CardBody>
            {recentLoading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="aspect-square animate-pulse rounded-xl bg-surface-hover" />
                ))}
              </div>
            ) : recentUploads.length === 0 ? (
              <EmptyState icon={ImageIcon} title="No uploads yet" description="Files you upload will appear here." />
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {recentUploads.map((media) => {
                  const Icon = iconForFileType(media.fileType, media.mimeType);
                  return (
                    <button
                      key={media.id}
                      type="button"
                      onClick={() => viewer.openAt(media.id)}
                      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-surface-hover"
                    >
                      {media.fileType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={media.viewUrl} alt={media.originalName} className="h-full w-full object-cover transition group-hover:scale-105" />
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

        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent activity</h2>
            <button
              type="button"
              onClick={() => router.push('/admin/activity')}
              className="text-xs font-medium text-accent hover:underline"
            >
              View all
            </button>
          </CardHeader>
          <CardBody className="max-h-96 overflow-y-auto p-0">
            {recentLoading ? (
              <div className="p-5">
                <FullPageSpinner />
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
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{log.message}</p>
                    <p className="text-[11px] text-muted">{formatDate(log.createdAt)}</p>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      <UploadProgressPanel queue={uploadQueue} />
      <MediaViewerModals viewer={viewer} />
      <FolderModal isOpen={isCreateFolderOpen} onClose={() => setIsCreateFolderOpen(false)} onSubmit={handleCreateFolder} />
    </div>
  );
}
