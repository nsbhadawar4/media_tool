'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, ArrowDown, ArrowUp, Archive, BookOpenCheck, Code2, Eye, Grid3x3, Layers, PencilLine, Plus, Search, Star, X } from 'lucide-react';
import { adminContentApi, type AdminContentItem, type BulkPatch, type BulkTarget, type ContentSort, type ContentStatus } from '@/lib/api/adminContent';
import { isImplemented } from '@/lib/content/catalogManifest';
import { GAMES, GAME_CATEGORIES } from '@/components/games/games';
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
import { FeatureSurfaces } from './FeatureSurfaces';
import { GamePreview } from './GamePreview';
import { ClassCardsPreview } from '@/components/kid-games/cards/ClassCardsPreview';
import { useTaxonomy } from './useTaxonomy';

const PAGE_SIZE = 25;

const SORT_OPTIONS: Array<{ label: string; value: ContentSort }> = [
  { label: 'Display order', value: 'order' },
  { label: 'Title A–Z', value: 'title' },
  { label: 'Recently updated', value: 'updated' },
  { label: 'Recently added', value: 'created' },
];

/** One bulk change, as the bar and the "by class / subject" form offer it. */
const BULK_ACTIONS: Array<{ id: string; label: string; patch: BulkPatch; danger?: boolean }> = [
  { id: 'enable', label: 'Enable', patch: { isEnabled: true } },
  { id: 'disable', label: 'Disable', patch: { isEnabled: false }, danger: true },
  { id: 'dash-on', label: 'Show on dashboard', patch: { isVisible: true } },
  { id: 'dash-off', label: 'Hide from dashboard', patch: { isVisible: false }, danger: true },
  { id: 'land-on', label: 'Show on landing', patch: { showOnLanding: true } },
  { id: 'land-off', label: 'Hide from landing', patch: { showOnLanding: false } },
  { id: 'feature', label: 'Feature', patch: { featured: true } },
  { id: 'unfeature', label: 'Unfeature', patch: { featured: false } },
];

interface PendingBulk {
  target: BulkTarget;
  action: (typeof BULK_ACTIONS)[number];
  /** "3 games", "every Kid Game in Class 1 · Hindi". */
  what: string;
}

function StatusBadges({ item, feature }: { item: AdminContentItem; feature: boolean }) {
  if (item.archivedAt) return <Badge>Archived</Badge>;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.isEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="danger">Disabled</Badge>}
      {!item.isVisible && <Badge variant="warning">{feature ? 'Off dashboard' : 'Hidden'}</Badge>}
      {feature && item.featured && (
        <Badge variant="accent">
          <Star className="h-3 w-3" aria-hidden />
          Featured
        </Badge>
      )}
    </span>
  );
}

/**
 * The admin screen for one kind of catalog entry. Everything is read from and written to the
 * server (/api/admin/content/*), which checks the administrator role on every call; nothing here
 * decides permissions. Changes invalidate the cached catalog the rest of the app reads.
 *
 * Games and Kid Games also get: the feature's three switches (feature / landing block / dashboard
 * block), per-game Dashboard, Landing and Featured switches, filters for each, a preview, and bulk
 * changes — to the picked rows, or (Kid Games) to a whole class and/or subject.
 */
export function CatalogManager({ info }: { info: ContentTypeInfo }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isKid = info.type === 'kid_game';
  const isArcade = info.type === 'game';
  const feature = Boolean(info.feature);
  // Classes, subjects and courses as the database has them — never a hard-coded list.
  const tax = useTaxonomy();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus>('live');
  const [sort, setSort] = useState<ContentSort>('order');
  const [classLevel, setClassLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [landing, setLanding] = useState<'' | 'on' | 'off'>('');
  const [featured, setFeatured] = useState<'' | 'yes' | 'no'>('');
  const [category, setCategory] = useState('All');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminContentItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [archiving, setArchiving] = useState<AdminContentItem | null>(null);
  const [previewing, setPreviewing] = useState<AdminContentItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<PendingBulk | null>(null);
  const [scopeClass, setScopeClass] = useState('');
  const [scopeSubject, setScopeSubject] = useState('');
  const [scopeAction, setScopeAction] = useState('disable');
  const debounced = useDebounce(search, 300);

  const statusOptions: Array<{ label: string; value: ContentStatus }> = [
    { label: 'All (not archived)', value: 'live' },
    { label: 'Active', value: 'active' },
    { label: 'Disabled', value: 'disabled' },
    { label: feature ? 'Hidden from dashboard' : 'Hidden', value: 'hidden' },
    { label: 'Archived', value: 'archived' },
  ];

  const params = {
    type: info.type,
    search: debounced.trim() || undefined,
    status,
    sort,
    classLevel: classLevel ? Number(classLevel) : undefined,
    subject: subject || undefined,
    landing: landing || undefined,
    featured: featured || undefined,
    page,
    limit: PAGE_SIZE,
  };
  const stats = useQuery({ queryKey: ['admin', 'content', 'stats'], queryFn: async () => (await adminContentApi.stats()).data });
  const list = useQuery({ queryKey: ['admin', 'content', 'items', params], queryFn: () => adminContentApi.list(params), placeholderData: keepPreviousData });
  // Category is the app's own (not stored): filtered here, over the page — there are a handful of games.
  const categoryOf = (item: AdminContentItem) => GAMES.find((g) => g.slug === item.key)?.category;
  const items = (list.data?.data ?? []).filter((i) => !isArcade || category === 'All' || categoryOf(i) === category);
  const meta = list.data?.meta;
  const typeStats = stats.data?.[info.type];
  const filtered = Boolean(params.search || status !== 'live' || params.classLevel || params.subject || landing || featured || category !== 'All');

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
  const bulk = useMutation({
    mutationFn: ({ target, action }: PendingBulk) => adminContentApi.bulk(target, action.patch),
    onSuccess: (res, { action, what }) => {
      const { matched, changed } = res.data;
      toast.success(changed === matched ? `${action.label}: ${changed} updated` : `${action.label}: ${changed} of ${matched} changed (the rest already were) — ${what}`);
      setPendingBulk(null);
      setSelected(new Set());
      refresh();
    },
    onError,
  });
  const busy = update.isPending || move.isPending || archive.isPending || restore.isPending || bulk.isPending;
  // Reordering only makes sense while looking at the display order.
  const canReorder = sort === 'order' && status !== 'archived';

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
    setSelected(new Set());
  };

  const liveOnPage = items.filter((i) => !i.archivedAt);
  const allPicked = liveOnPage.length > 0 && liveOnPage.every((i) => selected.has(i.id));
  const pick = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const noun = (n: number) => `${n} ${isKid ? (n === 1 ? 'Kid Game' : 'Kid Games') : n === 1 ? 'game' : 'games'}`;
  const askBulk = (actionId: string) => {
    const action = BULK_ACTIONS.find((a) => a.id === actionId)!;
    setPendingBulk({ target: { ids: [...selected] }, action, what: noun(selected.size) });
  };
  const askScope = () => {
    const action = BULK_ACTIONS.find((a) => a.id === scopeAction)!;
    const level = scopeClass ? Number(scopeClass) : undefined;
    const where = [level !== undefined ? tax.classTitle(level) : null, scopeSubject ? tax.subjectTitle(scopeSubject) : null].filter(Boolean).join(' · ');
    setPendingBulk({
      target: { scope: { type: 'kid_game', ...(level !== undefined ? { classLevel: level } : {}), ...(scopeSubject ? { subject: scopeSubject } : {}) } },
      action,
      what: where ? `every Kid Game in ${where}` : 'every Kid Game',
    });
  };

  /** Kid Games: the level above that switches this game off for users, if any. */
  const blockedBy = (item: AdminContentItem): string | null => {
    if (!isKid || item.classLevel == null || !item.subject) return null;
    const cls = tax.classes.find((c) => c.classLevel === item.classLevel);
    const subj = tax.subjects.find((s) => s.key === item.subject);
    const link = tax.links.find((l) => l.classLevel === item.classLevel && l.subject === item.subject);
    if (cls && !cls.isEnabled) return `${cls.title} is off`;
    if (subj && !subj.isEnabled) return `${subj.title} is off`;
    if (link && !link.isEnabled) return `${link.title} is off`;
    return null;
  };

  const toggles = (item: AdminContentItem) => (
    <>
      <label className="flex items-center gap-2 text-xs text-muted" title={info.enabledHint}>
        <Toggle checked={item.isEnabled} onChange={(v) => update.mutate({ id: item.id, patch: { isEnabled: v } })} label={`${item.title} enabled`} disabled={busy} />
        Enabled
      </label>
      <label className="flex items-center gap-2 text-xs text-muted" title={info.visibleHint}>
        <Toggle checked={item.isVisible} onChange={(v) => update.mutate({ id: item.id, patch: { isVisible: v } })} label={`${item.title} ${info.visibleLabel ?? 'visible'}`} disabled={busy} />
        {info.visibleLabel ?? 'Visible'}
      </label>
      {feature && (
        <>
          <label className="flex items-center gap-2 text-xs text-muted" title="Part of the Games / Kid Games block on the public home page (while that block is on)">
            <Toggle checked={item.showOnLanding} onChange={(v) => update.mutate({ id: item.id, patch: { showOnLanding: v } })} label={`${item.title} on landing page`} disabled={busy} />
            Landing
          </label>
          <label className="flex items-center gap-2 text-xs text-muted" title="Listed first, with a star">
            <Toggle checked={item.featured} onChange={(v) => update.mutate({ id: item.id, patch: { featured: v } })} label={`${item.title} featured`} disabled={busy} />
            Featured
          </label>
        </>
      )}
    </>
  );

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

      {info.feature && <FeatureSurfaces feature={info.feature} label={info.label} />}

      <section aria-label={`${info.label} figures`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
        {!typeStats ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={info.icon} label="Total" value={typeStats.total.toLocaleString()} hint={typeStats.custom ? `${typeStats.custom} added here` : 'From the app'} />
            <StatCard index={1} icon={info.icon} accent="success" label="Active" value={typeStats.active.toLocaleString()} hint={feature ? 'Enabled and on the dashboard' : 'Enabled and listed'} />
            <StatCard index={2} icon={info.icon} accent="danger" label="Disabled" value={typeStats.disabled.toLocaleString()} hint="Can't be used" />
            <StatCard index={3} icon={info.icon} accent="warning" label={feature ? 'Off dashboard' : 'Hidden'} value={typeStats.hidden.toLocaleString()} hint="Not listed" />
            <StatCard index={4} icon={Archive} color="var(--muted)" label="Archived" value={typeStats.archived.toLocaleString()} hint="Restorable" />
          </>
        )}
      </section>

      {info.type === 'class' && <ClassCardsPreviewPanel />}

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

      {isKid && (
        <section aria-labelledby="bulk-scope" className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <Layers className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="bulk-scope" className="text-sm font-semibold text-foreground">Change a whole class or subject</h2>
              <p className="text-xs text-muted">Applies to every Kid Game in it, e.g. “Class 1 → Disable” or “Hindi → Show on landing”. To switch a class or subject itself off, use Classes or Subjects.</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select
              options={[{ label: 'Every class', value: '' }, ...tax.classes.map((c) => ({ label: c.title, value: String(c.classLevel) }))]}
              value={scopeClass}
              onChange={(e) => setScopeClass(e.target.value)}
              aria-label="Class to change"
            />
            <Select
              options={[{ label: 'Every subject', value: '' }, ...tax.subjects.map((s) => ({ label: s.title, value: s.key }))]}
              value={scopeSubject}
              onChange={(e) => setScopeSubject(e.target.value)}
              aria-label="Subject to change"
            />
            <Select options={BULK_ACTIONS.map((a) => ({ label: a.label, value: a.id }))} value={scopeAction} onChange={(e) => setScopeAction(e.target.value)} aria-label="Change to apply" />
            <Button variant="secondary" onClick={askScope} disabled={busy}>
              Apply…
            </Button>
          </div>
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
        <Select options={statusOptions} value={status} onChange={(e) => reset(() => setStatus(e.target.value as ContentStatus))} aria-label="Status" />
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
        {isArcade && (
          <Select options={GAME_CATEGORIES.map((c) => ({ label: c === 'All' ? 'All categories' : c, value: c }))} value={category} onChange={(e) => reset(() => setCategory(e.target.value))} aria-label="Category" />
        )}
        {feature && (
          <>
            <Select
              options={[
                { label: 'Landing: any', value: '' },
                { label: 'On landing', value: 'on' },
                { label: 'Not on landing', value: 'off' },
              ]}
              value={landing}
              onChange={(e) => reset(() => setLanding(e.target.value as '' | 'on' | 'off'))}
              aria-label="Landing page"
            />
            <Select
              options={[
                { label: 'Featured: any', value: '' },
                { label: 'Featured', value: 'yes' },
                { label: 'Not featured', value: 'no' },
              ]}
              value={featured}
              onChange={(e) => reset(() => setFeatured(e.target.value as '' | 'yes' | 'no'))}
              aria-label="Featured"
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
                setLanding('');
                setFeatured('');
                setCategory('All');
              })
            }
            className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </section>

      {/* Bulk bar: sticks to the top while rows are picked. */}
      {feature && selected.size > 0 && (
        <section
          aria-label="Bulk changes"
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-accent/40 bg-surface-elevated/95 p-3 shadow-lift backdrop-blur"
        >
          <span className="mr-1 text-sm font-semibold text-foreground">{noun(selected.size)} selected</span>
          {BULK_ACTIONS.map((a) => (
            <Button key={a.id} size="sm" variant={a.danger ? 'danger' : 'secondary'} onClick={() => askBulk(a.id)} disabled={busy}>
              {a.label}
            </Button>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <X className="h-3.5 w-3.5" />
            Clear selection
          </button>
        </section>
      )}

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
          description={filtered ? 'Try a different search or filter.' : `Add one with “Add ${info.singular}”.`}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
          {feature && liveOnPage.length > 0 && (
            <label className="flex items-center gap-2.5 border-b border-border bg-surface-hover/30 px-4 py-2.5 text-xs font-medium text-muted sm:px-5">
              <input
                type="checkbox"
                checked={allPicked}
                onChange={(e) => setSelected(e.target.checked ? new Set(liveOnPage.map((i) => i.id)) : new Set())}
                className="h-4 w-4 rounded border-border accent-[var(--accent)]"
              />
              Select all on this page ({liveOnPage.length})
            </label>
          )}
          <ul className="divide-y divide-border">
            {items.map((item) => {
              const missingCode = !isImplemented(item.type, item.key);
              const blocked = blockedBy(item);
              return (
                <li key={item.id} className={cn('flex flex-col gap-3 px-4 py-3.5 transition-colors sm:px-5 lg:flex-row lg:items-center', selected.has(item.id) && 'bg-accent/5')}>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {feature && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={(e) => pick(item.id, e.target.checked)}
                        disabled={Boolean(item.archivedAt)}
                        aria-label={`Select ${item.title}`}
                        className="mt-2.5 h-4 w-4 shrink-0 rounded border-border accent-[var(--accent)] disabled:opacity-30"
                      />
                    )}
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
                    {isArcade && <ArcadeIcon slug={item.key} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-foreground" lang={item.subject === 'hindi' ? 'hi' : undefined}>{item.title}</span>
                        <StatusBadges item={item} feature={feature} />
                        {blocked && <Badge variant="warning">Not shown: {blocked}</Badge>}
                        {missingCode && (
                          <Badge variant="warning">
                            <Code2 className="h-3 w-3" aria-hidden />
                            Needs code
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <code className="rounded bg-surface-hover px-1 py-px font-mono text-[11px]">{item.key}</code>
                        {isArcade && categoryOf(item) && <span>{categoryOf(item)}</span>}
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
                        <span className="text-subtle">
                          Updated {formatRelativeTime(item.updatedAt)}
                          {item.updatedBy ? ` by ${item.updatedBy.name || item.updatedBy.email || 'an administrator'}` : ''}
                        </span>
                      </p>
                      {item.description && <p className="mt-1 line-clamp-1 text-xs text-foreground-soft" lang={item.subject === 'hindi' ? 'hi' : undefined}>{item.description}</p>}
                    </div>
                  </div>

                  <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-2 lg:pl-0', feature ? 'pl-[4.75rem]' : 'pl-11')}>
                    {!item.archivedAt && toggles(item)}
                    <div className="flex items-center gap-1">
                      {item.archivedAt ? (
                        <Button variant="secondary" size="sm" onClick={() => restore.mutate(item.id)} disabled={busy}>
                          <ArchiveRestore className="h-3.5 w-3.5" />
                          Restore
                        </Button>
                      ) : (
                        <>
                          {feature && (
                            <button
                              type="button"
                              onClick={() => setPreviewing(item)}
                              aria-label={`Preview ${item.title}`}
                              title="Preview the card"
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                          )}
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

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={(p) => (setPage(p), setSelected(new Set()))} numbered />}

      <ContentFormDialog info={info} item={editing} open={editing !== null} onClose={() => setEditing(null)} onSaved={refresh} />
      <ContentFormDialog info={info} item={null} open={creating} onClose={() => setCreating(false)} onSaved={refresh} />
      <GamePreview item={previewing} classTitle={tax.classTitle(previewing?.classLevel ?? null)} subjectTitle={tax.subjectTitle(previewing?.subject ?? null)} onClose={() => setPreviewing(null)} />
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
      <ConfirmDialog
        isOpen={pendingBulk !== null}
        onClose={() => !bulk.isPending && setPendingBulk(null)}
        onConfirm={() => pendingBulk && bulk.mutate(pendingBulk)}
        title={pendingBulk ? `${pendingBulk.action.label}: ${pendingBulk.what}?` : ''}
        description="Applied on the server to every one of them at once and written to the activity log. You can change them back the same way."
        confirmLabel={pendingBulk?.action.label ?? 'Apply'}
        isDangerous={pendingBulk?.action.danger ?? false}
        isLoading={bulk.isPending}
      />
    </div>
  );
}

/** The game's own icon and colours, so rows read like the cards users see. */
function ArcadeIcon({ slug }: { slug: string }) {
  const game = GAMES.find((g) => g.slug === slug);
  if (!game) return null;
  const Icon = game.icon;
  return (
    <span
      aria-hidden
      className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-card"
      style={{ backgroundImage: `linear-gradient(135deg, ${game.colors[0]}, ${game.colors[1]})` }}
    >
      <Icon className="h-5 w-5" strokeWidth={1.8} />
    </span>
  );
}

/** The class cards as users get them — the shared preview, under this page's heading. */
function ClassCardsPreviewPanel() {
  return (
    <section aria-labelledby="class-cards-preview" className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
      <h2 id="class-cards-preview" className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Eye className="h-4 w-4 text-accent" aria-hidden />
        Preview: class cards as users see them
      </h2>
      <ClassCardsPreview />
    </section>
  );
}
