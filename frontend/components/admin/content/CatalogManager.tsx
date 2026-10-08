'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ArrowDown, ArrowUp, Archive, BookOpenCheck, Code2, Grid3x3, PencilLine, Plus, Search, X } from 'lucide-react';
import { adminContentApi, type AdminContentItem, type ContentSort, type ContentStatus } from '@/lib/api/adminContent';
import { isImplemented } from '@/lib/content/catalogManifest';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Pagination } from '@/components/ui/Pagination';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { useDebounce } from '@/hooks/useDebounce';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ContentNav } from './ContentNav';
import type { ContentTypeInfo } from './contentTypes';
import { ContentFormDialog } from './ContentFormDialog';
import { ClassSubjectMatrix } from './ClassSubjectMatrix';
import { useTaxonomy } from './useTaxonomy';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: Array<{ label: string; value: ContentStatus }> = [
  { label: 'All (not archived)', value: 'live' },
  { label: 'Active', value: 'active' },
  { label: 'Disabled', value: 'disabled' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Archived', value: 'archived' },
];
const SORT_OPTIONS: Array<{ label: string; value: ContentSort }> = [
  { label: 'Display order', value: 'order' },
  { label: 'Title A–Z', value: 'title' },
  { label: 'Recently updated', value: 'updated' },
  { label: 'Recently added', value: 'created' },
];


function StatusBadges({ item }: { item: AdminContentItem }) {
  if (item.archivedAt) return <Badge>Archived</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.isEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="danger">Disabled</Badge>}
      {!item.isVisible && <Badge variant="warning">Hidden</Badge>}
    </span>
  );
}

/**
 * The admin screen for one kind of catalog entry. Everything is read from and written to the
 * server (/api/admin/content/*), which checks the administrator role on every call; nothing here
 * decides permissions. Changes invalidate the cached catalog the rest of the app reads.
 */
export function CatalogManager({ info }: { info: ContentTypeInfo }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isKid = info.type === 'kid_game';
  // Classes, subjects and courses as the database has them — never a hard-coded list.
  const tax = useTaxonomy();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus>('live');
  const [sort, setSort] = useState<ContentSort>('order');
  const [classLevel, setClassLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminContentItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<AdminContentItem | null>(null);
  const debounced = useDebounce(search, 300);

  const params = {
    type: info.type,
    search: debounced.trim() || undefined,
    status,
    sort,
    classLevel: classLevel ? Number(classLevel) : undefined,
    subject: subject || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const stats = useQuery({ queryKey: ['admin', 'content', 'stats'], queryFn: async () => (await adminContentApi.stats()).data });
  const list = useQuery({ queryKey: ['admin', 'content', 'items', params], queryFn: () => adminContentApi.list(params), placeholderData: keepPreviousData });
  const items = list.data?.data ?? [];
  const meta = list.data?.meta;
  const typeStats = stats.data?.[info.type];
  const filtered = Boolean(params.search || status !== 'live' || params.classLevel || params.subject);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['content', 'catalog'] });
  };
  const onError = (err: Error) => toast.error(err.message);

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof adminContentApi.update>[1] }) => adminContentApi.update(id, patch),
    onSuccess: () => refresh(),
    onError,
  });
  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => adminContentApi.move(id, direction),
    onSuccess: (res) => {
      if (res.message?.startsWith('Already')) toast.info(res.message);
      refresh();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: (id: string) => adminContentApi.archive(id),
    onSuccess: (res) => {
      toast.success(`Archived “${res.data.title}” — restore it any time from Archived`);
      setArchiving(null);
      refresh();
    },
    onError,
  });
  const restore = useMutation({
    mutationFn: (id: string) => adminContentApi.restore(id),
    onSuccess: (res) => {
      toast.success(`Restored “${res.data.title}”`);
      refresh();
    },
    onError,
  });
  const busy = update.isPending || move.isPending || archive.isPending || restore.isPending;
  // Reordering only makes sense while looking at the display order.
  const canReorder = sort === 'order' && status !== 'archived';

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Content"
        icon={info.icon}
        title={info.label}
        description={info.description}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add {info.singular}
          </Button>
        }
      />
      <ContentNav />

      <section aria-label={`${info.label} figures`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {!typeStats ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={info.icon} label="Total" value={typeStats.total.toLocaleString()} hint={typeStats.custom ? `${typeStats.custom} added here` : 'From the app'} />
            <StatCard index={1} icon={info.icon} accent="success" label="Active" value={typeStats.active.toLocaleString()} hint="Enabled and listed" />
            <StatCard index={2} icon={info.icon} accent="danger" label="Disabled" value={typeStats.disabled.toLocaleString()} hint="Can't be used" />
            <StatCard index={3} icon={info.icon} accent="warning" label="Hidden" value={typeStats.hidden.toLocaleString()} hint="Not listed" />
            <StatCard index={4} icon={Archive} color="var(--muted)" label="Archived" value={typeStats.archived.toLocaleString()} hint="Restorable" />
          </>
        )}
      </section>

      {info.type === 'subject' && (
        <section aria-labelledby="class-subjects" className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Grid3x3 className="h-4 w-4" />
            </span>
            <div>
              <h2 id="class-subjects" className="text-sm font-semibold text-foreground">Subjects by class</h2>
              <p className="text-xs text-muted">Offer a subject in a class, or switch one class&apos;s subject off without touching the others.</p>
            </div>
          </div>
          <ClassSubjectMatrix />
        </section>
      )}

      <section aria-label="Search and filters" className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => reset(() => setSearch(e.target.value))}
            placeholder={`Search ${info.label.toLowerCase()} by title or key…`}
            aria-label={`Search ${info.label}`}
            className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => reset(() => setStatus(e.target.value as ContentStatus))} aria-label="Status" />
        {isKid && (
          <>
            <Select
              options={[{ label: 'All classes', value: '' }, ...tax.classes.map((c) => ({ label: c.title, value: String(c.classLevel) }))]}
              value={classLevel}
              onChange={(e) => reset(() => setClassLevel(e.target.value))}
              aria-label="Class"
            />
            <Select
              options={[{ label: 'All subjects', value: '' }, ...tax.subjects.map((s) => ({ label: s.title, value: s.key }))]}
              value={subject}
              onChange={(e) => reset(() => setSubject(e.target.value))}
              aria-label="Subject"
            />
          </>
        )}
        <Select options={SORT_OPTIONS} value={sort} onChange={(e) => reset(() => setSort(e.target.value as ContentSort))} aria-label="Sort" />
        {filtered && (
          <button
            type="button"
            onClick={() =>
              reset(() => {
                setSearch('');
                setStatus('live');
                setClassLevel('');
                setSubject('');
              })
            }
            className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </section>

      {list.isError ? (
        <ErrorState error={list.error} subject={info.label.toLowerCase()} onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-3.5 last:border-b-0">
              <div className="h-8 w-14 animate-pulse rounded-lg bg-surface-hover" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/3 animate-pulse rounded bg-surface-hover" />
                <div className="h-2.5 w-1/4 animate-pulse rounded bg-surface-hover" />
              </div>
              <div className="h-6 w-11 animate-pulse rounded-full bg-surface-hover" />
              <div className="h-6 w-11 animate-pulse rounded-full bg-surface-hover" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={info.icon}
          title={filtered ? `No matching ${info.label.toLowerCase()}` : `No ${info.label.toLowerCase()} yet`}
          description={filtered ? 'Try a different search or status.' : `Add one with “Add ${info.singular}”.`}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const missingCode = !isImplemented(item.type, item.key);
              return (
                <li key={item.id} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {/* Position controls */}
                    <div className="flex shrink-0 flex-col items-center">
                      <button
                        type="button"
                        onClick={() => move.mutate({ id: item.id, direction: 'up' })}
                        disabled={!canReorder || busy || Boolean(item.archivedAt)}
                        aria-label={`Move ${item.title} up`}
                        title={canReorder ? 'Move up' : 'Sort by display order to reorder'}
                        className="flex h-7 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <span className="text-[10px] tabular-nums text-subtle" title="Display position">{item.archivedAt ? '—' : item.order}</span>
                      <button
                        type="button"
                        onClick={() => move.mutate({ id: item.id, direction: 'down' })}
                        disabled={!canReorder || busy || Boolean(item.archivedAt)}
                        aria-label={`Move ${item.title} down`}
                        title={canReorder ? 'Move down' : 'Sort by display order to reorder'}
                        className="flex h-7 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground" lang={item.subject === 'hindi' ? 'hi' : undefined}>{item.title}</span>
                        <StatusBadges item={item} />
                        {missingCode && (
                          <Badge variant="warning">
                            <Code2 className="h-3 w-3" aria-hidden />
                            Needs code
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <code className="rounded bg-surface-hover px-1 py-px font-mono text-[11px]">{item.key}</code>
                        {isKid && (
                          <span>
                            {tax.classTitle(item.classLevel)} · {tax.subjectTitle(item.subject)}
                            {item.difficulty && ` · ${item.difficulty}`}
                            {item.gameType && ` · ${item.gameType}`}
                          </span>
                        )}
                        {isKid && item.courseId && (
                          <span className="inline-flex items-center gap-1 text-accent">
                            <BookOpenCheck className="h-3 w-3" aria-hidden />
                            {tax.courseTitle(item.courseId)}
                          </span>
                        )}
                        {info.type === 'subject' && item.glyph && <span>{item.glyph}</span>}
                        <span className="text-subtle">Updated {formatRelativeTime(item.updatedAt)}</span>
                      </p>
                      {item.description && <p className="mt-1 line-clamp-1 text-xs text-foreground-soft" lang={item.subject === 'hindi' ? 'hi' : undefined}>{item.description}</p>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-11 lg:pl-0">
                    {!item.archivedAt && (
                      <>
                        <label className="flex items-center gap-2 text-xs text-muted" title={info.enabledHint}>
                          <Toggle checked={item.isEnabled} onChange={(v) => update.mutate({ id: item.id, patch: { isEnabled: v } })} label={`${item.title} enabled`} disabled={busy} />
                          Enabled
                        </label>
                        <label className="flex items-center gap-2 text-xs text-muted" title={info.visibleHint}>
                          <Toggle checked={item.isVisible} onChange={(v) => update.mutate({ id: item.id, patch: { isVisible: v } })} label={`${item.title} visible`} disabled={busy} />
                          Visible
                        </label>
                      </>
                    )}
                    <div className="flex items-center gap-1">
                      {item.archivedAt ? (
                        <Button variant="secondary" size="sm" onClick={() => restore.mutate(item.id)} disabled={busy}>
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(item)}
                            aria-label={`Edit ${item.title}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                          >
                            <PencilLine className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setArchiving(item)}
                            aria-label={`Archive ${item.title}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                          >
                            <Archive className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} numbered />}

      <ContentFormDialog info={info} item={editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={refresh} />
      <ContentFormDialog info={info} item={null} open={creating} onClose={() => setCreating(false)} onSaved={refresh} />
      <ConfirmDialog
        isOpen={archiving !== null}
        onClose={() => !archive.isPending && setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
        title={`Archive “${archiving?.title ?? ''}”?`}
        description={`It disappears for users${info.type === 'class' || info.type === 'subject' ? ', and so does everything in it — courses and games' : ''}. Nothing is deleted: you can restore it from the Archived filter at any time.`}
        confirmLabel="Archive"
        isDangerous
        isLoading={archive.isPending}
      />
    </div>
  );
}

