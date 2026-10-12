'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowDown, ArrowUp, CircleCheck, CircleOff, Eye, Lock, PencilLine, Search, X } from 'lucide-react';
import { adminContentApi, type AdminContentItem } from '@/lib/api/adminContent';
import { navItemsFor } from '@/components/marketing/nav';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import { ContentNav } from './ContentNav';
import { Field, fieldClass, fieldErrors } from './ContentFormDialog';
import type { ContentTypeInfo } from './contentTypes';

type Filter = 'all' | 'on' | 'off';
const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

/** Blocks / links that only appear while a feature (website section) is on. */
const NEEDS_FEATURE: Record<string, string> = { games: 'games', 'kid-games': 'kid-games' };
/** Header links that only appear while their home page section is on. */
const NAV_SECTION: Record<string, string> = { home: 'hero', features: 'features', games: 'games', 'kid-games': 'kid-games', faq: 'faq', pricing: 'pricing' };
const NAV_LABEL_MAX = 24;

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40';

/**
 * /admin/content/dashboard and /admin/content/navigation: lists defined by the app — the blocks
 * of the user dashboard, the public header's links — that an administrator switches on or off,
 * orders and (navigation) relabels. Nothing can be added or pointed elsewhere: each entry's
 * component or destination is fixed by code. Everything is saved on the server (admin-only API,
 * audit-logged); the preview beside the list is drawn from what is saved and changes nothing.
 */
export function SwitchboardManager({ info }: { info: ContentTypeInfo }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const isNav = info.type === 'nav_item';
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<AdminContentItem | null>(null);
  const [turningOff, setTurningOff] = useState<AdminContentItem | null>(null);

  const list = useQuery({
    queryKey: ['admin', 'content', 'items', { type: info.type, status: 'live', sort: 'order', limit: 100 }],
    queryFn: () => adminContentApi.list({ type: info.type, status: 'live', sort: 'order', page: 1, limit: 100 }),
  });
  // Which features and sections are on: some entries only show while theirs is.
  const sections = useQuery({
    queryKey: ['admin', 'content', 'items', { type: 'section', status: 'live', sort: 'order', limit: 100 }],
    queryFn: () => adminContentApi.list({ type: 'section', status: 'live', sort: 'order', page: 1, limit: 100 }),
  });
  const all = useMemo(() => list.data?.data ?? [], [list.data]);
  const sectionOn = (key: string) => {
    const s = sections.data?.data.find((x) => x.key === key);
    return s ? s.isEnabled && s.isVisible : true;
  };
  const dependency = (item: AdminContentItem): string | null => {
    const key = isNav ? NAV_SECTION[item.key] : NEEDS_FEATURE[item.key];
    if (!key || !sections.data || sectionOn(key)) return null;
    const title = sections.data.data.find((s) => s.key === key)?.title ?? key;
    return isNav ? `Hidden while the “${title}” section is off` : `Hidden while the ${title} feature is off`;
  };
  const counts = { total: all.length, on: all.filter((i) => i.isEnabled).length, off: all.filter((i) => !i.isEnabled).length };

  const term = search.trim().toLowerCase();
  const rows = all
    .filter((i) => filter === 'all' || (filter === 'on') === i.isEnabled)
    .filter((i) => !term || i.title.toLowerCase().includes(term) || i.key.includes(term) || i.description.toLowerCase().includes(term));
  const filtered = Boolean(term) || filter !== 'all';
  const canReorder = !filtered;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['content', 'catalog'] });
  };
  const onError = (err: Error) => toast.error(err.message);

  const setOn = useMutation({
    mutationFn: ({ item, on }: { item: AdminContentItem; on: boolean }) => adminContentApi.update(item.id, { isEnabled: on }),
    onSuccess: (res, { on }) => {
      toast.success(on ? `“${res.data.title}” is on` : `“${res.data.title}” is off`);
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
  const busy = setOn.isPending || move.isPending;

  const position = (item: AdminContentItem) => all.findIndex((i) => i.id === item.id) + 1;
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
      <span className="w-6 text-center text-xs font-semibold tabular-nums text-foreground-soft" title="Position">
        {position(item)}
      </span>
      <button
        type="button"
        onClick={() => move.mutate({ id: item.id, direction: 'down' })}
        disabled={!canReorder || busy || position(item) === all.length}
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
      <Toggle checked={item.isEnabled} onChange={(v) => (v ? setOn.mutate({ item, on: true }) : setTurningOff(item))} label={`${item.title} on`} disabled={busy} />
      <span className={cn('text-xs font-semibold', item.isEnabled ? 'text-success' : 'text-muted')}>{item.isEnabled ? 'On' : 'Off'}</span>
    </label>
  );
  const name = (item: AdminContentItem) => {
    const blocked = item.isEnabled ? dependency(item) : null;
    return (
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground">{item.title}</span>
          {item.isEnabled ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
        </div>
        <code className="mt-0.5 inline-block rounded bg-surface-hover px-1 py-px font-mono text-[11px] text-muted">{item.key}</code>
        {blocked && (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
            <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
            {blocked}
          </p>
        )}
      </div>
    );
  };
  const updated = (item: AdminContentItem) => (
    <span className="text-xs text-muted">
      <time dateTime={item.updatedAt} title={formatDate(item.updatedAt)}>
        {formatRelativeTime(item.updatedAt)}
      </time>
      <span className="block max-w-40 truncate text-subtle" title={item.updatedBy?.email ?? undefined}>
        {item.updatedBy ? item.updatedBy.name || item.updatedBy.email || 'Administrator' : 'App default'}
      </span>
    </span>
  );
  const edit = (item: AdminContentItem) => (
    <button type="button" onClick={() => setEditing(item)} aria-label={`Edit ${item.title}`} title={isNav ? 'Edit label' : 'Edit title and description'} className={iconButton}>
      <PencilLine className="h-4 w-4" />
    </button>
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader eyebrow="Content" icon={info.icon} title={info.label} description={info.description} />
      <ContentNav />

      <section aria-label={`${info.label} figures`} className="grid grid-cols-3 gap-3 sm:gap-4">
        {list.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={info.icon} label={isNav ? 'Links' : 'Blocks'} value={counts.total.toLocaleString()} hint="From the app" />
            <StatCard index={1} icon={CircleCheck} accent="success" label="On" value={counts.on.toLocaleString()} hint={isNav ? 'In the header' : 'On every dashboard'} />
            <StatCard index={2} icon={CircleOff} accent="warning" label="Off" value={counts.off.toLocaleString()} hint="Not shown" />
          </>
        )}
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <section aria-label="Search and filters" className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 sm:p-4">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${info.label.toLowerCase()}…`}
                aria-label={`Search ${info.label}`}
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
            <ErrorState error={list.error} subject={info.label.toLowerCase()} onRetry={() => list.refetch()} />
          ) : list.isLoading ? (
            <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-b-0">
                  <div className="h-6 w-16 animate-pulse rounded bg-surface-hover" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/4 animate-pulse rounded bg-surface-hover" />
                    <div className="h-2.5 w-1/3 animate-pulse rounded bg-surface-hover" />
                  </div>
                  <div className="h-6 w-11 animate-pulse rounded-full bg-surface-hover" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState icon={info.icon} title={filtered ? `No matching ${info.label.toLowerCase()}` : 'Nothing here yet'} description={filtered ? 'Try a different search or status.' : undefined} />
          ) : (
            <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
              <table className="hidden w-full text-left text-sm md:table">
                <thead className="border-b border-border bg-surface-hover/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                  <tr>
                    <th scope="col" className="px-4 py-3">Order</th>
                    <th scope="col" className="px-3 py-3">{isNav ? 'Link' : 'Block'}</th>
                    <th scope="col" className="px-3 py-3">Status</th>
                    <th scope="col" className="px-3 py-3">Last updated</th>
                    <th scope="col" className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((item) => (
                    <tr key={item.id} className={cn('align-middle transition-colors hover:bg-surface-hover/30', !item.isEnabled && 'bg-surface-hover/20')}>
                      <td className="px-4 py-3.5">{reorder(item)}</td>
                      <td className="max-w-80 px-3 py-3.5">
                        {name(item)}
                        <p className="mt-1 line-clamp-2 text-xs text-foreground-soft">{item.description}</p>
                      </td>
                      <td className="px-3 py-3.5">{status(item)}</td>
                      <td className="whitespace-nowrap px-3 py-3.5">{updated(item)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end">{edit(item)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <ul className="divide-y divide-border md:hidden">
                {rows.map((item) => (
                  <li key={item.id} className="flex flex-col gap-3 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      {name(item)}
                      {status(item)}
                    </div>
                    <p className="text-xs text-foreground-soft">{item.description}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {reorder(item)}
                      {updated(item)}
                      {edit(item)}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside aria-label="Preview" className="h-fit rounded-2xl border border-border bg-surface p-4 shadow-card xl:sticky xl:top-20">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Eye className="h-4 w-4 text-accent" aria-hidden />
            Preview
          </h2>
          <p className="mt-1 text-xs text-muted">{isNav ? 'The header as visitors see it, from what is saved.' : 'The dashboard’s layout, top to bottom, from what is saved.'}</p>
          {isNav ? <HeaderPreview items={all} sectionOn={sectionOn} /> : <DashboardPreview items={all} blocked={(i) => dependency(i) !== null} />}
        </aside>
      </div>

      <LabelDialog item={editing} isNav={isNav} onClose={() => setEditing(null)} onSaved={refresh} />
      <ConfirmDialog
        isOpen={turningOff !== null}
        onClose={() => !setOn.isPending && setTurningOff(null)}
        onConfirm={() => turningOff && setOn.mutate({ item: turningOff, on: false })}
        title={`Turn “${turningOff?.title ?? ''}” off?`}
        description={
          isNav
            ? 'Visitors stop seeing this link in the header and the mobile menu on their next page load. You can turn it back on at any time.'
            : 'Signed-in users stop seeing this block on their dashboard. Nothing they own is affected, and you can turn it back on at any time.'
        }
        confirmLabel="Turn off"
        isLoading={setOn.isPending}
      />
    </div>
  );
}

/** The public header's links and buttons, as a visitor would get them (no clicks: a picture). */
function HeaderPreview({ items, sectionOn }: { items: AdminContentItem[]; sectionOn: (key: string) => boolean }) {
  const shown = navItemsFor({ sections: [], classes: [], subjects: [], classSubjects: [], kidGames: [], games: [], courses: [], navItems: items.map((i) => ({ ...i })) }).filter(
    (l) => !l.section || sectionOn(l.section),
  );
  const links = shown.filter((l) => !l.button);
  const buttons = shown.filter((l) => l.button);
  return (
    <div className="mt-4 rounded-xl border border-border bg-background p-3" aria-hidden>
      <div className="flex flex-wrap items-center gap-1.5">
        {links.length === 0 && <span className="text-xs text-subtle">No links</span>}
        {links.map((l) => (
          <span key={l.key} className="inline-flex items-center gap-1 rounded-full bg-surface-hover/60 px-2.5 py-1 text-[11px] font-medium text-foreground-soft">
            {l.label}
            {l.app && <Lock className="h-2.5 w-2.5 text-subtle" />}
          </span>
        ))}
      </div>
      {buttons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {buttons.map((b) => (
            <span
              key={b.key}
              className={cn('rounded-lg px-2.5 py-1 text-[11px] font-semibold', b.key === 'get-started' ? 'bg-accent text-accent-foreground' : 'border border-border text-foreground-soft')}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
      <p className="mt-3 text-[10px] text-subtle">A lock: visitors go through sign-in first.</p>
    </div>
  );
}

/** The dashboard's enabled blocks in order, as stacked placeholders. */
function DashboardPreview({ items, blocked }: { items: AdminContentItem[]; blocked: (item: AdminContentItem) => boolean }) {
  const shown = items.filter((i) => i.isEnabled);
  return (
    <ol className="mt-4 space-y-1.5" aria-label="Dashboard layout">
      {shown.length === 0 && <li className="text-xs text-subtle">No blocks are on.</li>}
      {shown.map((i, index) => (
        <li
          key={i.id}
          className={cn(
            'flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-xs text-foreground-soft',
            blocked(i) && 'opacity-50',
            i.key === 'welcome' && 'py-3',
          )}
        >
          <span className="w-4 text-right tabular-nums text-subtle">{index + 1}</span>
          <span className="truncate font-medium">{i.title}</span>
          {blocked(i) && <span className="ml-auto shrink-0 text-[10px] text-warning">feature off</span>}
        </li>
      ))}
    </ol>
  );
}

/** Edit a nav link's label, or a dashboard block's title and note. */
function LabelDialog({ item, isNav, onClose, onSaved }: { item: AdminContentItem | null; isNav: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (item && loadedFor !== item.id) {
    setLoadedFor(item.id);
    setTitle(item.title);
    setDescription(item.description);
    setErrors({});
  }
  const save = useMutation({
    mutationFn: () => adminContentApi.update(item!.id, { title: title.trim(), description: description.trim() }),
    onSuccess: (res) => {
      toast.success(`Saved “${res.data.title}”`);
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setErrors(fieldErrors(err));
      toast.error(err.message);
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = title.trim();
    if (!label) return setErrors({ title: isNav ? 'Enter a label' : 'Enter a title' });
    if (isNav && label.length > NAV_LABEL_MAX) return setErrors({ title: `Keep it to ${NAV_LABEL_MAX} characters` });
    save.mutate();
  };
  return (
    <Modal isOpen={item !== null} onClose={() => !save.isPending && onClose()} title={isNav ? `Edit “${item?.title ?? ''}” link` : `Edit “${item?.title ?? ''}” block`}>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field id="sb-title" label={isNav ? 'Label' : 'Title'} hint={isNav ? `What the header shows (max ${NAV_LABEL_MAX}). Where it goes is fixed by the app.` : 'Shown here in the admin panel.'} error={errors.title}>
          <input id="sb-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={isNav ? NAV_LABEL_MAX : 120} className={fieldClass} autoFocus />
        </Field>
        <Field id="sb-description" label="Note" hint="For administrators: what this is for." error={errors.description}>
          <textarea id="sb-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={3} className={fieldClass} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button type="submit" isLoading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
