'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
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
import { MediaViewerModals } from '@/components/modals/MediaViewerModals';
import { FolderGrid, FolderGridSkeleton } from '@/components/folders/FolderGrid';
import { FolderCrudModals } from '@/components/folders/FolderCrudModals';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useUploads } from '@/lib/upload/UploadContext';
import { dashboardApi } from '@/lib/api/dashboard';
import { foldersApi } from '@/lib/api/folders';
import { formatBytes, formatRelativeTime } from '@/utils/format';
import { iconForFileType, toneForDocument } from '@/utils/fileIcons';
import { cn } from '@/utils/cn';

const RECENT_TILE_GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6';

/** How many folders the overview strip shows before sending people to the full list. */
const RECENT_FOLDER_COUNT = 6;

export default function DashboardPage() {
  const router = useRouter();
  const crud = useFolderCrud(null);
  const { addFiles, requestUpload } = useUploads();

  const statsQuery = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.stats(),
  });
  const recentQuery = useQuery({
    queryKey: ['dashboard', 'recent'],
    queryFn: () => dashboardApi.recent(),
  });
  // There is no "recent folders" endpoint, and adding one is not what this change is for.
  // The existing list endpoint sorted newest-first answers it for top-level folders, which
  // is what this strip shows; nested folders live one click further in.
  const recentFoldersQuery = useQuery({
    queryKey: ['folders', 'root', '', 'newest'],
    queryFn: () => foldersApi.list({ parentFolder: null, sort: 'newest' }),
  });

  const stats = statsQuery.data;
  const recentUploads = recentQuery.data?.data.recentUploads ?? [];
  const recentActivity = recentQuery.data?.data.recentActivity ?? [];
  const recentFolders = (recentFoldersQuery.data?.data.folders ?? []).slice(0, RECENT_FOLDER_COUNT);
  const viewer = useMediaViewer(recentUploads);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="An overview of your private library."
        actions={
          <>
            <Button variant="secondary" onClick={() => crud.setIsCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Create folder</span>
              <span className="sm:hidden">Folder</span>
            </Button>
            <UploadButton onFilesSelected={(files) => addFiles(files, null)} label="Upload" />
          </>
        }
      />

      {statsQuery.isError ? (
        <ErrorState error={statsQuery.error} onRetry={() => statsQuery.refetch()} subject="your library stats" />
      ) : (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6',
            // Only once the real figures arrive: fading the skeleton in as well would
            // just delay the thing being waited for.
            !statsQuery.isLoading && stats && 'app-content-enter',
          )}
        >
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

      <section className="mt-6 sm:mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">Recent folders</h2>
          <Link href="/folders" className="shrink-0 rounded-lg px-1 text-xs font-medium text-accent transition hover:underline">
            View all
          </Link>
        </div>

        {recentFoldersQuery.isError ? (
          <InlineErrorState
            error={recentFoldersQuery.error}
            onRetry={() => recentFoldersQuery.refetch()}
            subject="your folders"
          />
        ) : recentFoldersQuery.isLoading ? (
          <FolderGridSkeleton count={RECENT_FOLDER_COUNT} />
        ) : (
          <FolderGrid
            folders={recentFolders}
            onRename={crud.setFolderToRename}
            onMove={crud.setFolderToMove}
            onDelete={crud.setFolderToDelete}
            onUpload={(folder) => requestUpload(folder._id)}
            emptyMessage="Create your first folder to organize your photos, videos and documents."
            emptyAction={
              <Button onClick={() => crud.setIsCreateOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Create folder
              </Button>
            }
          />
        )}
      </section>

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
              <div className={cn(RECENT_TILE_GRID, 'app-content-enter')}>
                {recentUploads.map((media) => {
                  const Icon = iconForFileType(media.fileType, media.mimeType);
                  // Same colour language as the gallery tiles, minus the badge: these
                  // tiles are too small for one to read as anything but clutter.
                  const iconTone =
                    media.fileType === 'document' ? toneForDocument(media.mimeType).icon : 'text-muted';
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
                        <Icon className={cn('h-7 w-7', iconTone)} />
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
                <div
                  key={log._id}
                  className="app-content-enter flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0"
                >
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

      <MediaViewerModals viewer={viewer} />
      <FolderCrudModals crud={crud} />
    </div>
  );
}
