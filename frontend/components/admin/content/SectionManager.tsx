'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, CircleCheck, CircleOff, LayoutTemplate, PencilLine, Plus, Search, Sparkles, X } from 'lucide-react';
import { adminContentApi, type AdminContentItem } from '@/lib/api/adminContent';
import { APP_AREA_SECTIONS, CUSTOM_SECTION_EFFECT, SECTION_EFFECTS } from '@/lib/content/sections';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ContentNav } from './ContentNav';
import type { ContentTypeInfo } from './contentTypes';
import { ContentFormDialog } from './ContentFormDialog';

type Filter = 'all' | 'on' | 'off' | 'archived';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
  { value: 'archived', label: 'Archived' },
];

/** A section is ON when it is both enabled and visible; the page shows that one state. */
const isOn = (s: AdminContentItem) => s.isEnabled && s.isVisible;
const effectOf = (s: AdminContentItem) => (s.source === 'admin' ? CUSTOM_SECTION_EFFECT : (SECTION_EFFECTS[s.key] ?? CUSTOM_SECTION_EFFECT));

/** Sections whose OFF switch reaches past one home page block: turning them off is flagged as such. */
const WIDE_EFFECT = new Set(['hero', 'contact', ...Object.keys(APP_AREA_SECTIONS)]);
const closesAppArea = (s: AdminContentItem) => s.key in APP_AREA_SECTIONS;

function UpdatedBy({ item }: { item: AdminContentItem }) {
  if (!item.updatedBy) return <span className="text-subtle">App default</span>;
  return (
    <span className="block max-w-40 truncate" title={item.updatedBy.email ?? undefined}>
      {item.updatedBy.name || item.updatedBy.email || 'Administrator'}
    </span>
  );
}

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

/**
 * /admin/content/sections: every public website section with one ON/OFF switch, its display
 * order and who changed it last. Everything is read from and written to the server, which checks
 * the administrator role on each call and writes the audit log ("Section Enabled / Disabled /
 * Reordered"); the site reads the result on its next request — no rebuild, no browser storage.
 */
export function SectionManager({ info }: { info: ContentTypeInfo }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AdminContentItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [turningOff, setTurningOff] = useState<AdminContentItem | null>(null);
  const [archiving, setArchiving] = useState<AdminContentItem | null>(null);

  // A website has a handful of sections: all of them at once, filtered here.
  const list = useQuery({
    queryKey: ['admin', 'content', 'items', { type: 'section', status: 'all', sort: 'order', limit: 100 }],
    queryFn: () => adminContentApi.list({ type: 'section', status: 'all', sort: 'order', page: 1, limit: 100 }),
  });
  const all = useMemo(() => list.data?.data ?? [], [list.data]);
  const live = all.filter((s) => !s.archivedAt);
  const counts = { total: live.length, on: live.filter(isOn).length, off: live.filter((s) => !isOn(s)).length, archived: all.length - live.length };

  const term = search.trim().toLowerCase();
  const rows = all
    .filter((s) => (filter === 'archived' ? s.archivedAt : !s.archivedAt))
    .filter((s) => filter === 'all' || filter === 'archived' || (filter === 'on') === isOn(s))
    .filter((s) => !term || s.title.toLowerCase().includes(term) || s.key.includes(term) || s.description.toLowerCase().includes(term));
  const filtered = Boolean(term) || filter !== 'all';
  // Positions are among all live sections, so they're only moved while all of them are in view.
  const canReorder = !filtered;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['content', 'catalog'] });
  };
  const onError = (err: Error) => toast.error(err.message);

  const setState = useMutation({
    mutationFn: ({ item, on }: { item: AdminContentItem; on: boolean }) =>
      adminContentApi.update(item.id, on ? { isEnabled: true, isVisible: true } : { isEnabled: false }),
    onSuccess: (res, { on }) => {
      toast.success(on ? `“${res.data.title}” is on — visitors see it on their next page load` : `“${res.data.title}” is off`);
      setTurningOff(null);
      refresh();
    },
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
  const busy = setState.isPending || move.isPending || archive.isPending || restore.isPending;

  const toggle = (item: AdminContentItem, on: boolean) => {
    if (on) setState.mutate({ item, on: true });
    else setTurningOff(item);
  };

  const position = (item: AdminContentItem) => live.findIndex((s) => s.id === item.id) + 1;
  const reorder = (item: AdminContentItem) => (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => move.mutate({ id: item.id, direction: 'up' })}
        disabled={!canReorder || busy || position(item) === 1}
        aria-label={`Move ${item.title} up`}
        title={canReorder ? 'Move up' : 'Clear the search and filter to reorder'}
        className={cn(iconButton, 'h-8 w-8')}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-xs font-semibold tabular-nums text-foreground-soft" title="Position on the site">
        {position(item)}
      </span>
      <button
        type="button"
        onClick={() => move.mutate({ id: item.id, direction: 'down' })}
        disabled={!canReorder || busy || position(item) === live.length}
        aria-label={`Move ${item.title} down`}
        title={canReorder ? 'Move down' : 'Clear the search and filter to reorder'}
        className={cn(iconButton, 'h-8 w-8')}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
  const status = (item: AdminContentItem) => (
    <label className="inline-flex items-center gap-2.5">
      <Toggle checked={isOn(item)} onChange={(v) => toggle(item, v)} label={`${item.title} on`} disabled={busy} />
      <span className={cn('text-xs font-semibold', isOn(item) ? 'text-success' : 'text-muted')}>{isOn(item) ? 'On' : 'Off'}</span>
    </label>
  );
  const actions = (item: AdminContentItem) =>
    item.archivedAt ? (
      <Button variant="secondary" size="sm" onClick={() => restore.mutate(item.id)} disabled={busy}>
        <ArchiveRestore className="h-3.5 w-3.5" />
        Restore
      </Button>
    ) : (
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={() => setEditing(item)} aria-label={`Edit ${item.title}`} title="Edit title and description" className={iconButton}>
          <PencilLine className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setArchiving(item)}
          aria-label={`Archive ${item.title}`}
          title="Archive"
          className={cn(iconButton, 'hover:bg-danger/10 hover:text-danger focus-visible:ring-danger/40')}
        >
          <Archive className="h-4 w-4" />
        </button>
      </div>
    );
  const name = (item: AdminContentItem) => (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
        {item.source === 'admin' && (
          <Badge variant="accent">
            <Sparkles className="h-3 w-3" aria-hidden />
            Added here
          </Badge>
        )}
        {item.archivedAt && <Badge>Archived</Badge>}
      </div>
      <code className="mt-0.5 inline-block rounded bg-surface-hover px-1 py-px font-mono text-[11px] text-muted">{item.key}</code>
    </div>
  );
  const updated = (item: AdminContentItem) => (
    <time dateTime={item.updatedAt} title={formatDate(item.updatedAt)}>
      {formatRelativeTime(item.updatedAt)}
    </time>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Content"
        icon={LayoutTemplate}
        title="Website sections"
        description="Switch each public section on or off and set the order they appear in. Changes reach the site on its next page load — no rebuild needed."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Add section
          </Button>
        }
      />
      <ContentNav />

      <section aria-label="Section figures" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {list.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={LayoutTemplate} label="Sections" value={counts.total.toLocaleString()} hint="On the public site" />
            <StatCard index={1} icon={CircleCheck} accent="success" label="On" value={counts.on.toLocaleString()} hint="Shown to visitors" />
            <StatCard index={2} icon={CircleOff} accent="warning" label="Off" value={counts.off.toLocaleString()} hint="Hidden everywhere" />
            <StatCard index={3} icon={Archive} color="var(--muted)" label="Archived" value={counts.archived.toLocaleString()} hint="Restorable" />
          </>
        )}
      </section>

      <section aria-label="Search and filters" className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sections…"
            aria-label="Search sections"
            className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <div role="radiogroup" aria-label="Status" className="flex rounded-xl border border-border bg-surface-elevated p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                filter === f.value ? 'bg-accent text-accent-foreground shadow-sm' : 'text-muted hover:text-foreground',
              )}
            >
              {f.label}
              {f.value !== 'all' && <span className="ml-1 tabular-nums opacity-70">{counts[f.value]}</span>}
            </button>
          ))}
        </div>
        {filtered && (
          <button
            type="button"
            onClick={() => (setSearch(''), setFilter('all'))}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </section>

      {list.isError ? (
        <ErrorState error={list.error} subject="sections" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-1/4 animate-pulse rounded bg-surface-hover" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
              </div>
              <div className="h-6 w-11 animate-pulse rounded-full bg-surface-hover" />
              <div className="h-6 w-16 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={LayoutTemplate}
          title={filtered ? 'No matching sections' : 'No sections yet'}
          description={filtered ? 'Try a different search or status.' : 'Add one with “Add section”.'}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
          {/* Table from md up */}
          <table className="hidden w-full text-left text-sm md:table">
            <thead className="border-b border-border bg-surface-hover/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
              <tr>
                <th scope="col" className="px-5 py-3">Section</th>
                <th scope="col" className="px-3 py-3">Description</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="px-3 py-3">Display order</th>
                <th scope="col" className="px-3 py-3">Last updated</th>
                <th scope="col" className="px-3 py-3">Updated by</th>
                <th scope="col" className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((item) => (
                <tr key={item.id} className={cn('align-middle transition-colors hover:bg-surface-hover/30', !item.archivedAt && !isOn(item) && 'bg-surface-hover/20')}>
                  <td className="max-w-56 px-5 py-3.5">{name(item)}</td>
                  <td className="max-w-80 px-3 py-3.5">
                    <p className="line-clamp-2 text-xs text-foreground-soft">{item.description || '—'}</p>
                    <p className="mt-0.5 text-[11px] text-subtle">Off hides: {effectOf(item)}</p>
                  </td>
                  <td className="px-3 py-3.5">{item.archivedAt ? <span className="text-xs text-subtle">—</span> : status(item)}</td>
                  <td className="px-3 py-3.5">{item.archivedAt ? <span className="text-xs text-subtle">—</span> : reorder(item)}</td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-xs text-muted">{updated(item)}</td>
                  <td className="px-3 py-3.5 text-xs text-muted">
                    <UpdatedBy item={item} />
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex justify-end">{actions(item)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Cards below md */}
          <ul className="divide-y divide-border md:hidden">
            {rows.map((item) => (
              <li key={item.id} className="flex flex-col gap-3 px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  {name(item)}
                  {!item.archivedAt && status(item)}
                </div>
                {item.description && <p className="text-xs text-foreground-soft">{item.description}</p>}
                <p className="text-[11px] text-subtle">Off hides: {effectOf(item)}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!item.archivedAt && reorder(item)}
                  <div className="flex items-center gap-1 text-[11px] text-muted">
                    {updated(item)}
                    <span aria-hidden>·</span>
                    <UpdatedBy item={item} />
                  </div>
                  {actions(item)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ContentFormDialog info={info} item={editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={refresh} />
      <ContentFormDialog info={info} item={null} open={creating} onClose={() => setCreating(false)} onSaved={refresh} />
      <ConfirmDialog
        isOpen={turningOff !== null}
        onClose={() => !setState.isPending && setTurningOff(null)}
        onConfirm={() => turningOff && setState.mutate({ item: turningOff, on: false })}
        title={`Turn “${turningOff?.title ?? ''}” off?`}
        description={
          turningOff
            ? `Visitors stop seeing it on their next page load. This hides: ${effectOf(turningOff)}.${closesAppArea(turningOff) ? ' Signed-in users lose access to it too.' : ''} You can turn it back on at any time.`
            : ''
        }
        confirmLabel="Turn off"
        isDangerous={turningOff ? WIDE_EFFECT.has(turningOff.key) : false}
        isLoading={setState.isPending}
      />
      <ConfirmDialog
        isOpen={archiving !== null}
        onClose={() => !archive.isPending && setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
        title={`Archive “${archiving?.title ?? ''}”?`}
        description="It disappears from the site, like a section switched off. Nothing is deleted: restore it from the Archived filter at any time."
        confirmLabel="Archive"
        isDangerous
        isLoading={archive.isPending}
      />
    </div>
  );
}
