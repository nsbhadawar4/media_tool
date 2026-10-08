'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import {
  Activity,
  ArrowRight,
  FolderClosed,
  FolderPlus,
  Gamepad2,
  GraduationCap,
  Layers,
  HardDrive,
  Image as ImageIcon,
  FileText,
  Trash2,
  Upload,
  Video,
  type LucideIcon,
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
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { useMediaViewer } from '@/hooks/useMediaViewer';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useUploads } from '@/lib/upload/UploadContext';
import { useAuth } from '@/lib/auth/AuthContext';
import { dashboardApi } from '@/lib/api/dashboard';
import { foldersApi } from '@/lib/api/folders';
import { formatBytes, formatRelativeTime } from '@/utils/format';
import { iconForFileType, toneForMedia } from '@/utils/fileIcons';
import { cn } from '@/utils/cn';
import { formatPrice, planInfo } from '@/lib/billing/plans';

/** How many folders the overview strip shows before sending people to the full list. */
const RECENT_FOLDER_COUNT = 6;
/** Recent files shown as named tiles; the API returns up to 12, newest first. */
const RECENT_FILE_COUNT = 8;

interface QuickAction {
  label: string;
  hint: string;
  icon: LucideIcon;
  color: string;
  /** A destination, or an action run on click. */
  href?: string;
  onClick?: () => void;
}

/**
 * The signed-in user's home: their own library at a glance. Every figure and list here comes
 * from owner-scoped endpoints (/api/dashboard/*, /api/folders, /api/kid-games), which filter by
 * the session's account on the server — nothing on this page can show another user's data.
 */
export default function DashboardPage() {
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
  const recentFiles = recentUploads.slice(0, RECENT_FILE_COUNT);
  const recentActivity = recentQuery.data?.data.recentActivity ?? [];
  const recentFolders = (recentFoldersQuery.data?.data.folders ?? []).slice(0, RECENT_FOLDER_COUNT);
  const viewer = useMediaViewer(recentFiles);
  const firstName = user?.name.trim().split(/\s+/)[0];
  // Games and Kid Games come and go with their website sections (/admin/content/sections).
  const catalog = useContentCatalog();

  const quickActions: QuickAction[] = [
    { label: 'Browse media', hint: 'Photos & videos', icon: ImageIcon, color: '#38bdf8', href: '/media' },
    { label: 'Upload files', hint: 'Add to your library', icon: Upload, color: 'var(--accent)', onClick: () => requestUpload(null) },
    { label: 'Create folder', hint: 'Organise your files', icon: FolderPlus, color: 'var(--accent-2)', onClick: () => crud.setIsCreateOpen(true) },
    { label: 'Browse documents', hint: 'PDF, Word, Excel', icon: FileText, color: '#34d399', href: '/documents' },
    ...(catalog.isSectionOn('games') ? [{ label: 'Play games', hint: 'Ludo, Snake & more', icon: Gamepad2, color: '#f472b6', href: '/games' }] : []),
    ...(catalog.isSectionOn('kid-games') ? [{ label: 'Kid Games', hint: 'Learn with Classes 1–5', icon: GraduationCap, color: '#fbbf24', href: '/kid-games' }] : []),
  ];

  return (
    <div className="min-w-0">
      {/* Welcome */}
      <section className="gradient-border relative mb-6 overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-card sm:mb-8 sm:p-8">
        {/* Aurora wash: two soft accent blobs, static, clipped to the card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_120%_at_100%_0%,color-mix(in_srgb,var(--accent)_26%,transparent),transparent_60%),radial-gradient(40%_90%_at_0%_100%,color-mix(in_srgb,var(--accent-2)_12%,transparent),transparent_70%)]"
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-accent-2">My library</p>
            <h1 className="bg-linear-to-b from-foreground to-foreground/85 bg-clip-text text-3xl font-semibold leading-tight tracking-tight text-transparent sm:text-[40px]">
              {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted sm:text-[15px]">
              Your photos, videos, documents and games — everything you keep, in one private place.
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

      {/* A paid plan chosen at onboarding stays pending until real payment exists — say so plainly. */}
      {user?.plan && user.subscriptionStatus === 'pending' && (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3.5 text-sm sm:mb-8">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden />
          <p className="text-foreground-soft">
            <span className="font-semibold text-foreground">Your {planInfo(user.plan).name} plan ({formatPrice(planInfo(user.plan).price)}/month) is waiting for payment.</span>{' '}
            Online payments aren’t available yet, so nothing has been charged — you have full access to the Free plan until then.
          </p>
        </div>
      )}

      {/* Library at a glance */}
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
                value={(stats.data.totalImages + stats.data.totalVideos + stats.data.totalDocuments).toLocaleString()}
                hint="Across your library"
              />
              <StatCard index={1} icon={ImageIcon} label="Images" value={stats.data.totalImages.toLocaleString()} hint="Photos & graphics" color="#38bdf8" />
              <StatCard index={2} icon={Video} label="Videos" value={stats.data.totalVideos.toLocaleString()} hint="Clips & recordings" color="#fbbf24" />
              <StatCard index={3} icon={FileText} label="Documents" value={stats.data.totalDocuments.toLocaleString()} hint="PDF, Word, Excel, text" color="#34d399" />
              <StatCard index={4} icon={FolderClosed} label="Folders" value={stats.data.totalFolders.toLocaleString()} hint="Top-level & nested" color="var(--accent-2)" />
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

      {/* Quick actions */}
      <FadeUp index={6} className="mt-6 sm:mt-8">
        <section aria-labelledby="quick-actions-title">
          <h2 id="quick-actions-title" className="mb-3 text-base font-semibold tracking-tight text-foreground">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
            {quickActions.map((action) => (
              <QuickActionTile key={action.label} action={action} />
            ))}
          </div>
        </section>
      </FadeUp>

      {/* Recent files + recent activity */}
      <FadeUp index={7} className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 xl:grid-cols-3">
        <Card className="min-w-0 xl:col-span-2">
          <CardHeader className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent files</h2>
            <Link href="/media" className="shrink-0 rounded-lg px-1 text-xs font-medium text-accent transition hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardBody>
            {recentQuery.isError ? (
              <InlineErrorState error={recentQuery.error} onRetry={() => recentQuery.refetch()} subject="recent files" />
            ) : recentQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {Array.from({ length: RECENT_FILE_COUNT }).map((_, index) => (
                  <div key={index} className="space-y-2">
                    <div className="aspect-square animate-pulse rounded-xl bg-surface-hover" />
                    <div className="h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
                  </div>
                ))}
              </div>
            ) : recentFiles.length === 0 ? (
              <EmptyState
                icon={Upload}
                title="No files yet"
                description="Upload photos, videos or documents and your newest ones will appear here."
                action={
                  <Button onClick={() => requestUpload(null)}>
                    <Upload className="h-4 w-4" />
                    Upload files
                  </Button>
                }
              />
            ) : (
              <ul className="app-content-enter grid grid-cols-2 gap-3 sm:grid-cols-4">
                {recentFiles.map((media) => {
                  const Icon = iconForFileType(media.fileType, media.mimeType);
                  // Same colour the file's card carries in the gallery, so a tile does not
                  // change identity between here and there.
                  const iconTone = toneForMedia(media.fileType, media.mimeType).icon;
                  return (
                    <li key={media.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => viewer.openAt(media.id)}
                        aria-label={`Preview ${media.originalName}`}
                        className="group block w-full min-w-0 text-left"
                      >
                        <span className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-hover transition duration-200 group-hover:border-border-strong group-hover:shadow-lift">
                          {media.fileType === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={media.thumbnailUrl ?? media.viewUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.06]"
                            />
                          ) : (
                            <Icon className={cn('h-8 w-8', iconTone)} />
                          )}
                          {media.fileType === 'video' && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                              Video
                            </span>
                          )}
                        </span>
                        <span className="mt-2 block truncate text-xs font-medium text-foreground" title={media.originalName}>
                          {media.originalName}
                        </span>
                        <span className="block truncate text-[11px] text-muted">
                          {formatBytes(media.size)} · {formatRelativeTime(media.createdAt)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card className="flex min-w-0 flex-col">
          <CardHeader className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Recent activity</h2>
            <Link href="/activity" className="shrink-0 rounded-lg px-1 text-xs font-medium text-accent transition hover:underline">
              View all
            </Link>
          </CardHeader>
          {/* padded={false} rather than a p-0 override — see CardBody for why. */}
          <CardBody padded={false} className="max-h-[28rem] min-h-0 flex-1 overflow-y-auto">
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
                <div key={log._id} className="app-content-enter flex items-start gap-3 border-b border-border px-5 py-3 last:border-b-0">
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

      {/* Storage + Kid Games. Side by side only from 2xl: the Kid Games card lays its subjects
          out in a row, which needs more than half the content width at xl. */}
      {stats && (
        <FadeUp index={8} className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:gap-6 2xl:grid-cols-2">
          <StorageOverview
            usedBytes={stats.data.storageUsedBytes}
            images={stats.data.totalImages}
            videos={stats.data.totalVideos}
            documents={stats.data.totalDocuments}
            trashItems={stats.data.trashItems}
          />
          {catalog.isSectionOn('kid-games') && <KidGamesDashboardCard />}
        </FadeUp>
      )}

      {/* Recent folders */}
      <FadeUp as="section" index={9} className="mt-6 sm:mt-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Recent folders</h2>
          <Link href="/folders" className="shrink-0 rounded-lg px-1 text-xs font-medium text-accent transition hover:underline">
            View all
          </Link>
        </div>

        {recentFoldersQuery.isError ? (
          <InlineErrorState error={recentFoldersQuery.error} onRetry={() => recentFoldersQuery.refetch()} subject="your folders" />
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

      <MediaViewerModals viewer={viewer} />
      <FolderCrudModals crud={crud} />
    </div>
  );
}

/** One quick action: a coloured tile that is a link or a button, depending on what it does. */
function QuickActionTile({ action }: { action: QuickAction }) {
  const Icon = action.icon;
  const style = { '--tile': action.color } as CSSProperties;
  const className =
    'card-interactive group relative flex min-w-0 flex-col items-start gap-3 overflow-hidden rounded-2xl border border-border bg-surface p-4 text-left';
  const content = (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
        style={{ backgroundColor: `color-mix(in srgb, ${action.color} 35%, transparent)` }}
      />
      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl border transition-transform duration-200 group-hover:scale-105"
        style={{
          color: action.color,
          backgroundColor: `color-mix(in srgb, ${action.color} 14%, transparent)`,
          borderColor: `color-mix(in srgb, ${action.color} 28%, transparent)`,
        }}
      >
        <Icon className="h-5 w-5" strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-sm font-semibold text-foreground">
          <span className="truncate">{action.label}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
        </span>
        <span className="block truncate text-xs text-muted">{action.hint}</span>
      </span>
    </>
  );

  return action.href ? (
    <Link href={action.href} style={style} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={action.onClick} style={style} className={className}>
      {content}
    </button>
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
  trashItems,
}: {
  usedBytes: number;
  images: number;
  videos: number;
  documents: number;
  trashItems: number;
}) {
  const total = images + videos + documents;
  const parts = [
    { label: 'Images', count: images, color: 'bg-sky-500' },
    { label: 'Videos', count: videos, color: 'bg-amber-500' },
    { label: 'Documents', count: documents, color: 'bg-emerald-500' },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <HardDrive className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Storage overview</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Trash's way in now that it has left the sidebar. */}
          <Link
            href="/trash"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Trash{trashItems > 0 ? ` (${trashItems})` : ''}
          </Link>
          <Link
            href="/manage-storage"
            className="inline-flex items-center rounded-lg px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/10"
          >
            Manage
          </Link>
        </div>
      </CardHeader>
      <CardBody>
        <p className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{formatBytes(usedBytes)}</p>
        <p className="text-xs text-muted">used across {total} {total === 1 ? 'file' : 'files'}</p>

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
