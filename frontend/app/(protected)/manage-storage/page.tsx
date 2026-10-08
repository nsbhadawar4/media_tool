'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Download,
  ExternalLink,
  FileText,
  Files,
  FolderClosed,
  HardDrive,
  Image as ImageIcon,
  Infinity as InfinityIcon,
  Package,
  Trash2,
  UploadCloud,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { dashboardApi } from '@/lib/api/dashboard';
import { mediaApi } from '@/lib/api/media';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState, InlineErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { formatBytes, formatDateShort } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { FileType, Media, SortOption, StorageSummary } from '@/types/api';

const STORAGE_KEY = ['dashboard', 'storage'] as const;
const FILES_PAGE_SIZE = 10;

type Kind = 'image' | 'video' | 'document' | 'other';

/** Same colours as the dashboard's storage overview, so a kind of file looks the same everywhere. */
const KINDS: Array<{ key: Kind; label: string; icon: LucideIcon; bar: string; dot: string; href?: string }> = [
  { key: 'image', label: 'Images', icon: ImageIcon, bar: 'bg-sky-500', dot: 'bg-sky-500', href: '/media' },
  { key: 'video', label: 'Videos', icon: Video, bar: 'bg-amber-500', dot: 'bg-amber-500', href: '/media' },
  { key: 'document', label: 'Documents', icon: FileText, bar: 'bg-emerald-500', dot: 'bg-emerald-500', href: '/documents' },
  { key: 'other', label: 'Other files', icon: Package, bar: 'bg-violet-500', dot: 'bg-violet-500' },
];

const SORTS: Array<{ label: string; value: SortOption }> = [
  { label: 'Largest first', value: 'size_desc' },
  { label: 'Smallest first', value: 'size_asc' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
];

/** "1 folder", "3 folders". */
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const pctLabel = (part: number, whole: number) => {
  const p = pct(part, whole);
  return p === 0 ? '0%' : p < 1 ? '<1%' : `${Math.round(p)}%`;
};

/**
 * /manage-storage: the signed-in user's own storage — what it adds up to, what takes up the
 * space, what Trash still holds, and their files from largest down (or newest / oldest), with
 * open, download and move-to-Trash. Every figure comes from the server for the session's
 * account; nothing here can ask about anyone else's.
 *
 * There is no per-account storage limit, so none is shown as if there were: the limit reads
 * "No limit", and the bar shows what makes up the space used rather than a fill level.
 */
export default function ManageStoragePage() {
  const query = useQuery({ queryKey: STORAGE_KEY, queryFn: async () => (await dashboardApi.storage()).data });
  const summary = query.data;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Account"
        icon={HardDrive}
        title="Manage storage"
        description="See what's using your space, find your largest files and tidy up. Only you can see this."
      />

      {query.isError ? (
        <ErrorState error={query.error} subject="your storage" onRetry={() => query.refetch()} />
      ) : (
        <>
          <Overview summary={summary} />
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-5">
            <Breakdown summary={summary} className="xl:col-span-3" />
            <QuickActions summary={summary} className="xl:col-span-2" />
          </div>
          <FilesPanel />
        </>
      )}
    </div>
  );
}

function Overview({ summary }: { summary: StorageSummary | undefined }) {
  if (!summary) {
    return (
      <section aria-label="Storage overview" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </section>
    );
  }
  const limited = summary.limitBytes !== null;
  const available = limited ? Math.max(0, summary.limitBytes! - summary.usedBytes) : null;
  return (
    <section aria-label="Storage overview" className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard index={0} icon={HardDrive} label="Used storage" value={formatBytes(summary.usedBytes)} hint={summary.trash.bytes ? `${formatBytes(summary.trash.bytes)} of it in Trash` : 'Library only — Trash is empty'} />
        <StatCard
          index={1}
          icon={InfinityIcon}
          color="var(--accent-2)"
          label="Storage limit"
          value={limited ? formatBytes(summary.limitBytes!) : 'No limit'}
          hint={limited ? 'Your plan’s allowance' : 'Your account has no storage cap'}
        />
        <StatCard
          index={2}
          icon={UploadCloud}
          accent="success"
          label="Available"
          value={available !== null ? formatBytes(available) : 'Unlimited'}
          hint={limited ? `${pctLabel(summary.usedBytes, summary.limitBytes!)} used` : 'Upload as much as you need'}
        />
        <StatCard index={3} icon={Files} accent="warning" label="Largest upload" value={formatBytes(summary.maxUploadBytes)} hint="Per file" />
      </div>
    </section>
  );
}

function Breakdown({ summary, className }: { summary: StorageSummary | undefined; className?: string }) {
  const used = summary?.usedBytes ?? 0;
  const rows = summary
    ? [
        ...KINDS.map((k) => ({ ...k, ...summary.byType[k.key] })),
        { key: 'trash', label: 'Trash', icon: Trash2, bar: 'bg-slate-400', dot: 'bg-slate-400', href: '/trash', ...summary.trash },
      ]
    : [];

  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <HardDrive className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">What&apos;s using your space</h2>
          <p className="text-xs text-muted">Share of your {formatBytes(used)} by kind of file</p>
        </div>
      </CardHeader>
      <CardBody>
        {!summary ? (
          <div className="space-y-4" role="status" aria-label="Loading">
            <div className="h-3 w-full animate-pulse rounded-full bg-surface-hover" />
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-hover" />)}
          </div>
        ) : (
          <>
            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-surface-hover"
              role="img"
              aria-label={rows.filter((r) => r.bytes > 0).map((r) => `${r.label} ${pctLabel(r.bytes, used)}`).join(', ') || 'Nothing stored yet'}
            >
              {rows.map((r) =>
                r.bytes > 0 ? (
                  <div key={r.key} className={cn('h-full transition-[width] duration-700 ease-out first:rounded-l-full last:rounded-r-full', r.bar)} style={{ width: `${pct(r.bytes, used)}%` }} />
                ) : null,
              )}
            </div>

            <ul className="mt-5 divide-y divide-border">
              {rows.map((r) => {
                const Icon = r.icon;
                const inner = (
                  <>
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', r.dot)} aria-hidden />
                    <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">{r.label}</span>
                      <span className="block text-xs text-muted">
                        {r.count.toLocaleString()} {r.count === 1 ? 'file' : 'files'}
                        {r.key === 'trash' && r.count > 0 ? ' · still taking up space' : ''}
                        {r.key === 'other' && r.count === 0 ? ' · only images, videos and documents can be uploaded' : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular-nums text-foreground">{formatBytes(r.bytes)}</span>
                      <span className="block text-xs tabular-nums text-subtle">{pctLabel(r.bytes, used)}</span>
                    </span>
                  </>
                );
                return (
                  <li key={r.key}>
                    {r.href ? (
                      <Link href={r.href} className="-mx-2 flex min-h-12 items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                        {inner}
                      </Link>
                    ) : (
                      <div className="flex min-h-12 items-center gap-3 py-2.5">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function QuickActions({ summary, className }: { summary: StorageSummary | undefined; className?: string }) {
  const actions: Array<{ href: string; label: string; detail: string; icon: LucideIcon }> = [
    { href: '/media', label: 'Open Media', detail: summary ? plural(summary.byType.image.count + summary.byType.video.count, 'photo or video', 'photos & videos') : '…', icon: ImageIcon },
    { href: '/documents', label: 'Open Documents', detail: summary ? plural(summary.byType.document.count, 'document', 'documents') : '…', icon: FileText },
    { href: '/folders', label: 'Open Folders', detail: summary ? plural(summary.totalFolders, 'folder', 'folders') : '…', icon: FolderClosed },
    {
      href: '/trash',
      label: 'Review Trash',
      detail: summary ? (summary.trash.count ? `Free up ${formatBytes(summary.trash.bytes)}` : 'Empty') : '…',
      icon: Trash2,
    },
  ];
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader className="flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
          <Files className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">Your library</h2>
          <p className="text-xs text-muted">
            {summary ? `${plural(summary.totalFiles, 'file', 'files')} · ${plural(summary.totalFolders, 'folder', 'folders')} · ${formatBytes(summary.libraryBytes)}` : 'Loading…'}
          </p>
        </div>
      </CardHeader>
      <CardBody>
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <li key={a.href}>
                <Link
                  href={a.href}
                  className="group flex min-h-14 items-center gap-3 rounded-xl border border-border bg-surface-elevated/50 px-3 py-2.5 transition hover:border-accent/40 hover:bg-accent/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{a.label}</span>
                    <span className="block truncate text-xs text-muted">{a.detail}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-subtle transition group-hover:text-accent" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}

/**
 * The user's files, largest first by default, from the same owner-scoped /api/media the library
 * uses — so sorting, paging and permissions are the existing ones. "Move to Trash" is the
 * library's own delete: recoverable from Trash until it is emptied.
 */
function FilesPanel() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<'all' | FileType>('all');
  const [sort, setSort] = useState<SortOption>('size_desc');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<Media | null>(null);

  const params = { fileType: kind === 'all' ? undefined : kind, sort, page, limit: FILES_PAGE_SIZE };
  const files = useQuery({
    queryKey: ['media', 'storage', params],
    queryFn: () => mediaApi.list(params),
    placeholderData: keepPreviousData,
  });
  const items = files.data?.data ?? [];
  const meta = files.data?.meta;
  const largest = items.reduce((max, m) => Math.max(max, m.size), 0);

  const remove = useMutation({
    mutationFn: (id: string) => mediaApi.remove(id),
    onSuccess: (_r, id) => {
      const name = items.find((m) => m.id === id)?.originalName ?? 'File';
      toast.success(`${name} moved to Trash`);
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['media'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tabs = [
    { value: 'all' as const, label: 'All' },
    { value: 'image' as const, label: 'Images' },
    { value: 'video' as const, label: 'Videos' },
    { value: 'document' as const, label: 'Documents' },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
            <Files className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-foreground">Your files</h2>
            <p className="text-xs text-muted">{sort === 'size_desc' ? 'Largest first — the quickest way to free up space' : 'Sorted your way'}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Tabs
            tabs={tabs}
            value={kind}
            onChange={(v) => {
              setKind(v);
              setPage(1);
            }}
            aria-label="Kind of file"
          />
          <Select
            options={SORTS}
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortOption);
              setPage(1);
            }}
            aria-label="Sort files"
          />
        </div>
      </CardHeader>

      {files.isError ? (
        <InlineErrorState error={files.error} onRetry={() => files.refetch()} subject="your files" />
      ) : files.isLoading ? (
        <ul className="divide-y divide-border" role="status" aria-label="Loading files">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-lg bg-surface-hover" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
                <div className="h-2 w-1/2 animate-pulse rounded bg-surface-hover" />
              </div>
              <div className="h-3 w-14 animate-pulse rounded bg-surface-hover" />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Files}
          title={kind === 'all' ? 'No files yet' : 'Nothing of this kind'}
          description={kind === 'all' ? 'Files you upload will appear here, largest first.' : 'Try another kind of file.'}
          className="border-0"
        />
      ) : (
        <ul className={cn('divide-y divide-border transition-opacity', files.isFetching && 'opacity-70')}>
          {items.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
              <MediaThumbnail media={m} className="h-11 w-11 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground" title={m.originalName}>{m.originalName}</p>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-surface-hover" aria-hidden>
                    <div
                      className={cn('h-full rounded-full', KINDS.find((k) => k.key === m.fileType)?.bar ?? 'bg-accent')}
                      style={{ width: `${Math.max(3, pct(m.size, largest))}%` }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-subtle">{formatDateShort(m.createdAt)}</span>
                </div>
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{formatBytes(m.size)}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <a
                  href={m.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open ${m.originalName}`}
                  title="Open"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <a
                  href={m.downloadUrl}
                  aria-label={`Download ${m.originalName}`}
                  title="Download"
                  className="hidden h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:flex"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setPendingDelete(m)}
                  aria-label={`Move ${m.originalName} to Trash`}
                  title="Move to Trash"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="border-t border-border px-4 py-3 sm:px-5">
          <Pagination meta={meta} onPageChange={setPage} />
        </div>
      )}

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => !remove.isPending && setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        title={`Move ${pendingDelete?.originalName ?? 'this file'} to Trash?`}
        description={`It stays in Trash, still using ${pendingDelete ? formatBytes(pendingDelete.size) : 'its space'}, until you empty Trash — you can restore it from there until then.`}
        confirmLabel="Move to Trash"
        isDangerous
        isLoading={remove.isPending}
      />
    </Card>
  );
}
