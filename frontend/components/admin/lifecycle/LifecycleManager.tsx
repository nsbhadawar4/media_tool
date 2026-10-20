'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, BookOpen, Eye, GraduationCap, Layers, Library, Puzzle, SearchX, Trash2, X, type LucideIcon } from 'lucide-react';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { ADMIN_CLASSES_KEY } from '@/lib/api/adminClasses';
import {
  KIND_LABEL,
  LIFECYCLE_KEY,
  lifecycleApi,
  type LifecycleBin,
  type LifecycleBlocker,
  type LifecycleItem,
  type LifecycleKind,
  type LifecycleListQuery,
  type LifecycleOutcome,
  type LifecycleSort,
} from '@/lib/api/contentLifecycle';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DangerConfirmDialog } from '@/components/ui/DangerConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { ALL_TIME, DateRangeFilter, rangeToBounds, type DateRange } from '@/components/admin/DateRangeFilter';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 20;

const TYPE_OPTIONS: Array<{ label: string; value: LifecycleKind | 'all' }> = [
  { label: 'All types', value: 'all' },
  { label: 'Classes', value: 'class' },
  { label: 'Subjects', value: 'subject' },
  { label: 'Courses', value: 'course' },
  { label: 'Chapters', value: 'chapter' },
  { label: 'Kid Games', value: 'kid_game' },
  { label: 'Games', value: 'game' },
  { label: 'Sections', value: 'section' },
];

/** A subtle tint per kind, so a mixed list reads at a glance. */
const KIND_TINT: Record<LifecycleKind, string> = {
  class: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  subject: 'border-violet-400/30 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  course: 'border-sky-400/30 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  chapter: 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  kid_game: 'border-pink-400/30 bg-pink-500/10 text-pink-700 dark:text-pink-300',
  game: 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300',
  section: 'border-border bg-surface-hover text-foreground-soft',
};

/** What differs between Archive and Trash / Deleted: words, columns, filters and actions. */
interface BinCopy {
  icon: LucideIcon;
  title: string;
  description: string;
  total: string;
  verb: string; // "Archived" / "Deleted"
  empty: [string, string];
  /** The second action (beside Restore): Archive → Trash, Trash → gone. */
  onward: string;
  onwardSelected: string;
  restoreTitle: (one: boolean, n: number) => string;
}
const COPY: Record<LifecycleBin, BinCopy> = {
  archive: {
    icon: Archive,
    title: 'Archive',
    description: 'Manage content that has been intentionally archived.',
    total: 'Total archived',
    verb: 'Archived',
    empty: ['Archive is empty', 'Intentionally archived content will appear here.'],
    onward: 'Move to Trash',
    onwardSelected: 'Move Selected to Trash',
    restoreTitle: (one, n) => (one ? 'Restore this item?' : `Restore ${n} items?`),
  },
  trash: {
    icon: Trash2,
    title: 'Trash / Deleted',
    description: 'Deleted content is temporarily stored here until it is restored or permanently removed.',
    total: 'Total deleted',
    verb: 'Deleted',
    empty: ['Trash is empty', 'Deleted content will appear here until it is restored or permanently deleted.'],
    onward: 'Forever Delete',
    onwardSelected: 'Forever Delete Selected',
    restoreTitle: (one, n) => (one ? 'Restore deleted item?' : `Restore ${n} deleted items?`),
  },
};

const refKey = (r: { kind: LifecycleKind; id: string }) => `${r.kind}:${r.id}`;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Something went wrong');

type Pending = { action: 'restore' | 'onward'; items: LifecycleItem[] } | null;

/**
 * /admin/archive and /admin/trash: what was intentionally archived, and what was deleted — two
 * separate places. Search, filter, sort, select; Restore from either (parents first when they are
 * away too); Archive → Move to Trash; Trash → Forever Delete (typed DELETE; built-in entries never).
 */
export function LifecycleManager({ bin }: { bin: LifecycleBin }) {
  const copy = COPY[bin];
  const isTrash = bin === 'trash';
  const toast = useToast();
  const queryClient = useQueryClient();
  const [type, setType] = useState<LifecycleKind | 'all'>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [range, setRange] = useState<DateRange>(ALL_TIME);
  const [deletedBy, setDeletedBy] = useState('');
  const [sort, setSort] = useState<LifecycleSort>('recent');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [parentPrompt, setParentPrompt] = useState<{ items: LifecycleItem[]; blockers: LifecycleBlocker[] } | null>(null);
  const [viewing, setViewing] = useState<LifecycleItem | null>(null);

  /** Any change of what is shown starts again at page 1 with nothing selected. */
  const reset = () => {
    setPage(1);
    setSelected(new Set());
  };

  const bounds = rangeToBounds(range);
  const params: LifecycleListQuery = { type, q: deferredSearch, from: bounds.from, to: bounds.to, by: isTrash ? deletedBy : undefined, sort, page, limit: PAGE_SIZE };
  const list = useQuery({
    queryKey: [...LIFECYCLE_KEY, bin, params],
    queryFn: async ({ signal }) => (await lifecycleApi.list(bin, params, signal)).data,
    placeholderData: (prev) => prev,
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const counts = list.data?.counts;
  const selectedItems = items.filter((i) => selected.has(refKey(i)));
  const allPicked = items.length > 0 && items.every((i) => selected.has(refKey(i)));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: LIFECYCLE_KEY });
    void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
    void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
  };

  /** One toast for a result: what worked, and the first reason anything didn't. */
  const report = (results: LifecycleOutcome[], many: string) => {
    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);
    if (ok.length === 1 && !failed.length) toast.success(ok[0]!.message);
    else if (ok.length) toast.success(`${plural(ok.length, 'item')} ${many}.`);
    if (failed.length) toast.error(failed.length === 1 ? failed[0]!.message : `${plural(failed.length, 'item')} could not be changed: ${failed[0]!.message}`);
  };

  const done = () => {
    setPending(null);
    setSelected(new Set());
    refresh();
  };

  const restore = useMutation({
    mutationFn: ({ items: targets, withParents }: { items: LifecycleItem[]; withParents: boolean }) =>
      lifecycleApi.restore(
        bin,
        targets.map(({ kind, id }) => ({ kind, id })),
        withParents,
      ),
    onSuccess: (res, { items: targets, withParents }) => {
      const results = res.data.results;
      const needParent = results.filter((r) => r.code === 'PARENT_ARCHIVED');
      // A parent is away too: ask once, then restore the parent and the item together.
      if (needParent.length && !withParents) {
        setParentPrompt({ items: targets.filter((t) => needParent.some((r) => r.kind === t.kind && r.id === t.id)), blockers: needParent.flatMap((r) => r.blockers ?? []) });
        report(
          results.filter((r) => r.code !== 'PARENT_ARCHIVED'),
          'restored',
        );
      } else {
        setParentPrompt(null);
        report(results, 'restored');
      }
      done();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const moveToTrash = useMutation({
    mutationFn: (targets: LifecycleItem[]) => lifecycleApi.moveToTrash(targets.map(({ kind, id }) => ({ kind, id }))),
    onSuccess: (res) => {
      report(res.data.results, 'moved to Trash');
      done();
    },
    onError: (err) => toast.error(errorText(err)),
  });

  const foreverDelete = useMutation({
    mutationFn: (targets: LifecycleItem[]) =>
      lifecycleApi.foreverDelete(
        targets.map(({ kind, id }) => ({ kind, id })),
        'DELETE',
      ),
    onSuccess: (res) => {
      report(res.data.results, 'permanently deleted');
      done();
    },
  });

  const busy = restore.isPending || moveToTrash.isPending || foreverDelete.isPending;
  const pick = (item: LifecycleItem, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(refKey(item));
      else next.delete(refKey(item));
      return next;
    });

  const filtered = type !== 'all' || deferredSearch !== '' || range.preset !== 'all' || deletedBy !== '';
  const target = pending?.items ?? [];
  const one = target.length === 1 ? target[0]! : null;
  const deletable = target.filter((i) => !i.deleteBlock);
  const contained = deletable.flatMap((i) => i.contains);
  const rowProps = (item: LifecycleItem) => ({
    item,
    bin,
    busy,
    onRestore: () => setPending({ action: 'restore', items: [item] }),
    onOnward: () => setPending({ action: 'onward', items: [item] }),
    onView: () => setViewing(item),
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Content management" icon={copy.icon} title={copy.title} description={copy.description} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {!counts ? (
          Array.from({ length: 6 }, (_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={copy.icon} label={copy.total} value={String(counts.all)} hint="Restorable" color="#64748b" />
            <StatCard index={1} icon={GraduationCap} label="Classes" value={String(counts.class)} hint="Manage Courses" />
            <StatCard index={2} icon={Library} label="Subjects" value={String(counts.subject)} hint="Content → Subjects" color="#7c3aed" />
            <StatCard index={3} icon={Layers} label="Courses" value={String(counts.course)} hint="A subject in a class" color="#0284c7" />
            <StatCard index={4} icon={BookOpen} label="Chapters" value={String(counts.chapter)} hint="With their lessons" accent="warning" />
            <StatCard index={5} icon={Puzzle} label="Games & sections" value={String(counts.kid_game + counts.game + counts.section)} hint="Kid Games, games, sections" color="#db2777" />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 p-3 shadow-card sm:p-4 lg:flex-row lg:items-center">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            reset();
          }}
          placeholder="Search by name, title or id…"
          className="lg:max-w-sm lg:flex-1"
        />
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <Select aria-label="Content type" value={type} onChange={(e) => (setType(e.target.value as LifecycleKind | 'all'), reset())} options={TYPE_OPTIONS} className="w-36" />
          <DateRangeFilter value={range} onChange={(r) => (setRange(r), reset())} label={`${copy.verb} date`} />
          {isTrash && (
            <Select
              aria-label="Deleted by"
              value={deletedBy}
              onChange={(e) => (setDeletedBy(e.target.value), reset())}
              options={[{ label: 'Deleted by anyone', value: '' }, ...(list.data?.deleters ?? []).map((d) => ({ label: d.name, value: d.id }))]}
              className="w-44"
            />
          )}
          <Select
            aria-label="Sort"
            value={sort}
            onChange={(e) => (setSort(e.target.value as LifecycleSort), reset())}
            options={[
              { label: `Recently ${copy.verb.toLowerCase()}`, value: 'recent' },
              { label: `Oldest ${copy.verb.toLowerCase()}`, value: 'oldest' },
              { label: 'Name A–Z', value: 'name' },
              { label: 'Name Z–A', value: 'name_desc' },
            ]}
            className="w-44"
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="anim-rise sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-surface-elevated/95 px-4 py-3 shadow-pop backdrop-blur"
        >
          <span className="text-sm font-semibold text-foreground">Selected: {selected.size}</span>
          <button type="button" onClick={() => setSelected(new Set())} className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
            <X aria-hidden className="h-3.5 w-3.5" />
            Clear
          </button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" className="gap-1.5" disabled={busy} onClick={() => setPending({ action: 'restore', items: selectedItems })}>
              <ArchiveRestore aria-hidden className="h-4 w-4" />
              Restore Selected
            </Button>
            <Button type="button" size="sm" variant="danger" className="gap-1.5" disabled={busy} onClick={() => setPending({ action: 'onward', items: selectedItems })}>
              <Trash2 aria-hidden className="h-4 w-4" />
              {copy.onwardSelected}
            </Button>
          </div>
        </div>
      )}

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} subject={isTrash ? 'the trash' : 'the archive'} />
      ) : list.isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchX} title="Nothing matches" description="Try another search, type, date or filter." />
        ) : (
          <EmptyState icon={copy.icon} title={copy.empty[0]} description={copy.empty[1]} />
        )
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', (list.isFetching || busy) && 'opacity-70')}>
          <label className="flex items-center gap-2.5 border-b border-border bg-surface-hover/30 px-4 py-2.5 text-xs font-medium text-muted sm:px-5">
            <input
              type="checkbox"
              checked={allPicked}
              onChange={(e) => setSelected(e.target.checked ? new Set(items.map(refKey)) : new Set())}
              className="h-4 w-4 rounded border-border accent-[var(--accent)]"
            />
            Select all on this page ({items.length})
          </label>

          {/* Table from lg up (compact on tablets); cards below. */}
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-surface-hover/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                <tr>
                  <th scope="col" className="w-10 py-3 pl-5 pr-2">
                    <span className="sr-only">Select</span>
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Name
                  </th>
                  <th scope="col" className="w-28 px-3 py-3">
                    Type
                  </th>
                  <th scope="col" className="w-40 px-3 py-3">
                    Parent
                  </th>
                  <th scope="col" className="w-40 px-3 py-3">
                    {copy.verb} by
                  </th>
                  <th scope="col" className="w-36 px-3 py-3">
                    {copy.verb} date
                  </th>
                  {!isTrash && (
                    <th scope="col" className="w-28 px-3 py-3">
                      Status
                    </th>
                  )}
                  <th scope="col" className="w-36 py-3 pl-3 pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {items.map((item) => (
                  <tr key={refKey(item)} className={cn('align-middle transition-colors hover:bg-surface-hover/40', selected.has(refKey(item)) && 'bg-accent/5')}>
                    <td className="py-3 pl-5 pr-2">
                      <RowCheck item={item} checked={selected.has(refKey(item))} onChange={(on) => pick(item, on)} />
                    </td>
                    <td className="px-3 py-3">
                      <NameCell item={item} />
                    </td>
                    <td className="px-3 py-3">
                      <KindBadge kind={item.kind} />
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground-soft" title={item.location}>
                      {item.parent ?? <span className="text-subtle">{item.location.split(' → ')[0]}</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-foreground-soft">{item.by ?? <span className="text-subtle">—</span>}</td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <p className="text-xs font-medium text-foreground-soft" title={new Date(item.at).toLocaleString()}>
                        {day(item.at)}
                      </p>
                      <p className="text-[11px] text-subtle">{formatRelativeTime(item.at)}</p>
                    </td>
                    {!isTrash && (
                      <td className="px-3 py-3">
                        <StateBadge state={item.state} />
                      </td>
                    )}
                    <td className="py-3 pl-3 pr-5">
                      <RowActions {...rowProps(item)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/70 lg:hidden">
            {items.map((item) => (
              <li key={refKey(item)} className={cn('flex flex-col gap-3 p-4', selected.has(refKey(item)) && 'bg-accent/5')}>
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <RowCheck item={item} checked={selected.has(refKey(item))} onChange={(on) => pick(item, on)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <NameCell item={item} />
                  </div>
                  <RowActions {...rowProps(item)} compact />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={item.kind} />
                  <StateBadge state={item.state} />
                  {item.parent && <span className="text-xs text-foreground-soft">{item.parent}</span>}
                </div>
                <p className="text-[11px] text-subtle">
                  {copy.verb} {day(item.at)}
                  {item.by ? ` by ${item.by}` : ''} · {item.location}
                </p>
                <Button type="button" size="sm" variant="secondary" className="gap-1.5 self-start" disabled={busy} onClick={() => setPending({ action: 'restore', items: [item] })}>
                  <ArchiveRestore aria-hidden className="h-4 w-4" />
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {list.data && list.data.pages > 1 && (
        <Pagination meta={{ page: list.data.page, limit: list.data.limit, total: list.data.total, totalPages: list.data.pages }} onPageChange={(p) => (setPage(p), setSelected(new Set()))} numbered />
      )}

      <ConfirmDialog
        isOpen={pending?.action === 'restore'}
        onClose={() => !busy && setPending(null)}
        onConfirm={() => pending && restore.mutate({ items: pending.items, withParents: false })}
        isLoading={restore.isPending}
        isDangerous={false}
        title={copy.restoreTitle(Boolean(one), target.length)}
        description={one ? `The item will be returned to its previous location (${one.location}).` : 'The items will be returned to their previous locations, with everything in them.'}
        confirmLabel="Restore"
      />

      <ConfirmDialog
        isOpen={parentPrompt !== null}
        onClose={() => !busy && setParentPrompt(null)}
        onConfirm={() => parentPrompt && restore.mutate({ items: parentPrompt.items, withParents: true })}
        isLoading={restore.isPending}
        isDangerous={false}
        title="Restore the parent first?"
        description={`Parent content is currently ${(parentPrompt?.blockers ?? []).some((b) => b.reason === 'trashed') ? 'in Trash' : 'archived'} (${[
          ...new Set((parentPrompt?.blockers ?? []).map((b) => `${KIND_LABEL[b.kind]} ${b.title}`)),
        ].join(', ')}). It will be restored first, then ${parentPrompt && parentPrompt.items.length === 1 ? parentPrompt.items[0]!.title : 'the items'}.`}
        confirmLabel="Restore parent and item"
      />

      {/* Archive → Trash: still restorable from Trash. */}
      {!isTrash && (
        <ConfirmDialog
          isOpen={pending?.action === 'onward'}
          onClose={() => !busy && setPending(null)}
          onConfirm={() => pending && moveToTrash.mutate(pending.items)}
          isLoading={moveToTrash.isPending}
          isDangerous
          title={one ? 'Move to Trash?' : `Move ${plural(target.length, 'item')} to Trash?`}
          description={one ? 'This archived item will be moved to Trash. You can still restore it from Trash.' : 'These archived items will be moved to Trash. You can still restore them from Trash.'}
          confirmLabel="Move to Trash"
        />
      )}

      {/* Trash → gone: the only permanent action. Typed DELETE; built-in entries skipped. */}
      {isTrash && (
        <DangerConfirmDialog
          isOpen={pending?.action === 'onward'}
          onClose={() => !busy && setPending(null)}
          onConfirm={async () => {
            if (pending) await foreverDelete.mutateAsync(pending.items);
          }}
          isLoading={foreverDelete.isPending}
          title={one ? 'Permanently delete this item?' : `Forever delete ${plural(target.length, 'item')}?`}
          confirmationPhrase="DELETE"
          confirmLabel="Forever Delete"
          warning="This action cannot be undone. All associated data may also be permanently removed."
          consequences={
            <div className="space-y-2">
              {deletable.length === 0 ? (
                <p>{one?.deleteBlock ?? 'None of the selected items can be deleted for good.'}</p>
              ) : (
                <p>
                  {one ? `${one.title} (${KIND_LABEL[one.kind].toLowerCase()})` : plural(deletable.length, 'item')} will be removed from the database for good
                  {contained.length ? `, with everything in ${one ? 'it' : 'them'}: ${contained.join(', ')}` : ''}. Learner progress on that content goes too.
                </p>
              )}
              {target.length > deletable.length && deletable.length > 0 && (
                <p className="text-xs text-muted">
                  {plural(target.length - deletable.length, 'item')} will be skipped: {target.find((i) => i.deleteBlock)!.deleteBlock}
                </p>
              )}
              <p className="text-xs text-muted">Type DELETE to confirm.</p>
            </div>
          }
        />
      )}

      <ViewDialog item={viewing} bin={bin} onClose={() => setViewing(null)} />
    </div>
  );
}

function RowCheck({ item, checked, onChange }: { item: LifecycleItem; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      aria-label={`Select ${item.title}`}
      className="h-4 w-4 shrink-0 rounded border-border accent-[var(--accent)]"
    />
  );
}

function NameCell({ item }: { item: LifecycleItem }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2">
        <span className="truncate font-semibold text-foreground">{item.title}</span>
        {item.builtIn && <span className="shrink-0 rounded-md border border-border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider text-subtle">Built-in</span>}
      </p>
      <p className="truncate text-[11px] text-subtle">
        {item.contains.length ? item.contains.join(' · ') : 'Nothing inside'}
        <span className="mx-1.5">·</span>
        <span className="font-mono">{item.id.slice(-8)}</span>
      </p>
    </div>
  );
}

function KindBadge({ kind }: { kind: LifecycleKind }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', KIND_TINT[kind])}>{KIND_LABEL[kind]}</span>;
}

function StateBadge({ state }: { state: LifecycleItem['state'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        state === 'archived' ? 'border-amber-400/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-danger/30 bg-danger/10 text-danger',
      )}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {state === 'archived' ? 'Archived' : 'Deleted'}
    </span>
  );
}

/** Restore (the everyday action) as a button; View and the onward move (Move to Trash / Forever Delete) in the menu, apart. */
function RowActions({
  item,
  bin,
  busy,
  compact = false,
  onRestore,
  onOnward,
  onView,
}: {
  item: LifecycleItem;
  bin: LifecycleBin;
  busy: boolean;
  compact?: boolean;
  onRestore: () => void;
  onOnward: () => void;
  onView: () => void;
}) {
  const menu: DropdownMenuItem[] = [
    { label: 'View details', icon: <Eye className="h-4 w-4" />, onClick: onView },
    ...(bin === 'archive'
      ? [{ label: 'Move to Trash', icon: <Trash2 className="h-4 w-4" />, onClick: onOnward, danger: true, divider: true }]
      : item.deleteBlock
        ? []
        : [{ label: 'Forever Delete', icon: <Trash2 className="h-4 w-4" />, onClick: onOnward, danger: true, divider: true }]),
  ];
  return (
    <div className="flex shrink-0 items-center justify-end gap-1.5">
      {!compact && (
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" disabled={busy} onClick={onRestore} aria-label={`Restore ${item.title}`}>
          <ArchiveRestore aria-hidden className="h-4 w-4" />
          Restore
        </Button>
      )}
      <DropdownMenu items={menu} align="right" triggerLabel={`More actions for ${item.title}`} sheetTitle={item.title} width={210} />
    </div>
  );
}

function ViewDialog({ item, bin, onClose }: { item: LifecycleItem | null; bin: LifecycleBin; onClose: () => void }) {
  const verb = COPY[bin].verb;
  const rows: Array<[string, string]> = item
    ? [
        ['Type', KIND_LABEL[item.kind]],
        ['Parent', item.parent ?? '—'],
        ['Original location', item.location],
        ['Contains', item.contains.length ? item.contains.join(', ') : 'Nothing inside'],
        [verb, `${day(item.at)}${item.by ? ` by ${item.by}` : ''}`],
        ...(bin === 'trash' && item.archivedBy ? ([['Archived first', `${day(item.archivedAt)} by ${item.archivedBy}`]] as Array<[string, string]>) : []),
        ['Id', item.id],
      ]
    : [];
  return (
    <Modal isOpen={item !== null} onClose={onClose} title={item?.title ?? ''} size="md">
      {item && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <KindBadge kind={item.kind} />
            <StateBadge state={item.state} />
            {item.builtIn && <span className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-subtle">Built-in</span>}
          </div>
          <dl className="divide-y divide-border/70 rounded-xl border border-border">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
                <dt className="text-muted">{k}</dt>
                <dd className={cn('min-w-0 break-words text-foreground', k === 'Id' && 'font-mono text-xs')}>{v}</dd>
              </div>
            ))}
          </dl>
          {item.restoreBlockedBy.length > 0 && (
            <p className="rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-2.5 text-sm text-foreground">
              {item.restoreBlockedBy.some((b) => b.reason === 'missing')
                ? `Can't be restored: ${item.restoreBlockedBy
                    .filter((b) => b.reason === 'missing')
                    .map((b) => b.title)
                    .join(', ')} no longer exists.`
                : `Its parent is ${item.restoreBlockedBy.some((b) => b.reason === 'trashed') ? 'in Trash' : 'archived'} (${item.restoreBlockedBy.map((b) => `${KIND_LABEL[b.kind]} ${b.title}`).join(', ')}) — restoring offers to bring that back first.`}
            </p>
          )}
          {bin === 'trash' && item.deleteBlock && (
            <p className="rounded-xl border border-border bg-surface-elevated/60 px-3.5 py-2.5 text-sm text-muted">Can&apos;t be deleted forever: {item.deleteBlock}</p>
          )}
        </div>
      )}
    </Modal>
  );
}
