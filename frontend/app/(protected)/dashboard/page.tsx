'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  FolderClosed,
  FolderPlus,
  ArrowUpRight,
  Layers,
  HardDrive,
  Image as ImageIcon,
  FileText,
  Trash2,
  Video,
} from 'lucide-react';
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
import { FadeUp } from '@/components/ui/motion';
import { KidGamesDashboardCard } from '@/components/kid-games/KidGamesDashboardCard';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useUploads } from '@/lib/upload/UploadContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { dashboardApi } from '@/lib/api/dashboard';
import { foldersApi } from '@/lib/api/folders';
import { formatBytes, formatRelativeTime } from '@/utils/format';
import { iconForFileType, toneForMedia } from '@/utils/fileIcons';
import { cn } from '@/utils/cn';

const RECENT_TILE_GRID = 'grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6';

/** How many folders the overview strip shows before sending people to the full list. */
const RECENT_FOLDER_COUNT = 6;

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuth();
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
      <section className="gradient-border relative mb-6 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:mb-8 sm:p-8">
        {/* Aurora wash: two soft accent blobs, static, clipped to the card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_60%),radial-gradient(40%_90%_at_0%_100%,color-mix(in_srgb,var(--accent-2)_12%,transparent),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-2">Overview</p>
            <h1 className="bg-linear-to-b from-foreground to-foreground/85 bg-clip-text text-3xl font-semibold leading-tight tracking-tight text-transparent sm:text-[40px]">
              {user?.name ? `Welcome back, ${user.name.split(' ')[0]}` : 'Dashboard'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted sm:text-[15px]">
              Here is what is happening in your private library — everything you have stored, in one place.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => crud.setIsCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              <span className="hidden sm:inline">Create folder</span>
              <span className="sm:hidden">Folder</span>
            </Button>
            <UploadButton onFilesSelected={(files) => addFiles(files, null)} label="Upload files" />
          </div>
        </div>
      </section>

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
              <StatCard
                index={0}
                icon={Layers}
                label="Total files"
                value={String(stats.data.totalImages + stats.data.totalVideos + stats.data.totalDocuments)}
                hint="Across your library"
              />
              <StatCard
                index={1}
                icon={ImageIcon}
                label="Images"
                value={String(stats.data.totalImages)}
                hint="Photos & graphics"
                color="#38bdf8"
              />
              <StatCard
                index={2}
                icon={Video}
                label="Videos"
                value={String(stats.data.totalVideos)}
                hint="Clips & recordings"
                color="#fbbf24"
              />
              <StatCard
                index={3}
                icon={FileText}
                label="Documents"
                value={String(stats.data.totalDocuments)}
                hint="PDF, Word, Excel, text"
                color="#34d399"
              />
              <StatCard
                index={4}
                icon={FolderClosed}
                label="Folders"
                value={String(stats.data.totalFolders)}
                hint="Top-level & nested"
                color="var(--accent-2)"
              />
              <StatCard
                index={5}
                icon={HardDrive}
                label="Storage used"
                value={formatBytes(stats.data.storageUsedBytes)}
                hint={stats.data.trashItems > 0 ? `${stats.data.trashItems} in trash` : 'Trash is empty'}
                color="var(--accent)"
              />
            </>
          )}
        </div>
      )}

      {stats && (
        <FadeUp index={6} className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-3">
          <StorageOverview
            usedBytes={stats.data.storageUsedBytes}
            images={stats.data.totalImages}
            videos={stats.data.totalVideos}
            documents={stats.data.totalDocuments}
          />
          <Card className="min-w-0">
            <CardHeader>
              <h2 className="text-base font-semibold tracking-tight text-foreground">Quick actions</h2>
            </CardHeader>
            <CardBody padded={false} className="p-2">
              {[
                { href: '/media', label: 'Browse media', icon: ImageIcon },
                { href: '/documents', label: 'Browse documents', icon: FileText },
                { href: '/folders', label: 'Manage folders', icon: FolderClosed },
                { href: '/trash', label: 'Open trash', icon: Trash2 },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground-soft transition-colors hover:bg-surface-hover hover:text-foreground"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <action.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1">{action.label}</span>
                  <ArrowUpRight className="h-4 w-4 text-muted opacity-0 transition group-hover:opacity-100" />
                </Link>
              ))}
            </CardBody>
          </Card>
        </FadeUp>
      )}

      <FadeUp index={7} className="mt-6 sm:mt-8">
        <KidGamesDashboardCard />
      </FadeUp>

      <FadeUp as="section" index={8} className="mt-6 sm:mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Recent folders</h2>
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
      </FadeUp>

      <FadeUp index={9} className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent uploads</h2>
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
                  // Same colour the file's card carries in the gallery, so a tile does not
                  // change identity between here and there.
                  const iconTone = toneForMedia(media.fileType, media.mimeType).icon;
                  return (
                    <button
                      key={media.id}
                      type="button"
                      onClick={() => viewer.openAt(media.id)}
                      title={media.originalName}
                      aria-label={`Preview ${media.originalName}`}
                      className="group relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-hover transition duration-200 hover:border-border-strong hover:shadow-lift"
                    >
                      {media.fileType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={media.thumbnailUrl ?? media.viewUrl}
                          alt={media.originalName}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.06]"
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
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent activity</h2>
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
      </FadeUp>

      <MediaViewerModals viewer={viewer} />
      <FolderCrudModals crud={crud} />
    </div>
  );
}

/**
 * Used storage plus how the library is made up. There is no quota to measure against, so the
 * bar shows the share of files by kind rather than a fill level that would imply a limit.
 */
function StorageOverview({
  usedBytes,
  images,
  videos,
  documents,
}: {
  usedBytes: number;
  images: number;
  videos: number;
  documents: number;
}) {
  const total = images + videos + documents;
  const parts = [
    { label: 'Images', count: images, color: 'bg-sky-500', icon: ImageIcon },
    { label: 'Videos', count: videos, color: 'bg-amber-500', icon: Video },
    { label: 'Documents', count: documents, color: 'bg-emerald-500', icon: FileText },
  ];

  return (
    <Card className="min-w-0 xl:col-span-2">
      <CardHeader className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <HardDrive className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold tracking-tight text-foreground">Storage overview</h2>
      </CardHeader>
      <CardBody>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {formatBytes(usedBytes)}
            </p>
            <p className="text-xs text-muted">used across {total} {total === 1 ? 'file' : 'files'}</p>
          </div>
        </div>

        <div
          className="mt-5 flex h-2 w-full overflow-hidden rounded-full bg-surface-hover"
          role="img"
          aria-label={`Library composition: ${images} images, ${videos} videos, ${documents} documents`}
        >
          {total > 0 &&
            parts.map((part) => (
              <div
                key={part.label}
                className={cn('h-full transition-all duration-500', part.color)}
                style={{ width: `${(part.count / total) * 100}%` }}
              />
            ))}
        </div>

        <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {parts.map((part) => (
            <li key={part.label} className="flex items-center gap-2.5 rounded-xl bg-surface-hover/60 px-3 py-2.5">
              <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', part.color)} aria-hidden />
              <span className="flex-1 text-xs text-muted">{part.label}</span>
              <span className="text-sm font-semibold tabular-nums text-foreground">{part.count}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
