'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  ArrowDown,
  ArrowUp,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileClock,
  GraduationCap,
  PencilLine,
  Plus,
  SearchX,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { ADMIN_CLASSES_KEY, adminClassesApi, type AdminClass } from '@/lib/api/adminClasses';
import { LIFECYCLE_KEY, lifecycleApi } from '@/lib/api/contentLifecycle';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { builtInSubtitle, classPicture, classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

/** One filter: All (not archived), Published (and visible), Draft, Hidden (published but not listed), Archived. */
type Filter = 'all' | 'published' | 'draft' | 'hidden' | 'archived';
type Sort = 'order' | 'number' | 'title' | 'updated' | 'created';

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: 'All', value: 'all' },
  { label: 'Published', value: 'published' },
  { label: 'Draft', value: 'draft' },
  { label: 'Hidden', value: 'hidden' },
  { label: 'Archived', value: 'archived' },
];
const SORTS: Array<{ label: string; value: Sort }> = [
  { label: 'Display order', value: 'order' },
  { label: 'Class number', value: 'number' },
  { label: 'Title', value: 'title' },
  { label: 'Recently updated', value: 'updated' },
  { label: 'Recently created', value: 'created' },
];

/** Where a class stands, as two separate facts: its status (draft / published / archived) and whether it is listed. */
const STATUS_BADGE = {
  published: {
    label: 'Published',
    className: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  },
  draft: {
    label: 'Draft',
    className: 'border-sky-400/30 bg-sky-500/12 text-sky-600 dark:text-sky-300',
  },
  archived: {
    label: 'Archived',
    className: 'border-border bg-surface-hover text-muted',
  },
} as const;
const statusOf = (c: AdminClass): keyof typeof STATUS_BADGE => (c.status === 'archived' ? 'archived' : c.status === 'draft' ? 'draft' : 'published');
/** Hidden: hidden in Manage Courses, or switched off elsewhere (Content). Drafts are listed as they will be once published. */
const isListed = (c: AdminClass) => c.isVisible && c.isEnabled;

/** The pending confirmation: which class, and what the administrator is about to do to it. */
type Pending = {
  action: 'hide' | 'show' | 'archive' | 'delete' | 'restore' | 'publish' | 'unpublish' | 'duplicate';
  cls: AdminClass;
} | null;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

/**
 * /admin/courses — Manage Courses: every class as a row of one table (cards on a phone), with its
 * subjects, chapters, status and visibility, searchable, filterable and sortable. Creating and
 * editing happen on their own page (ClassEditor); publishing, showing, hiding, reordering,
 * archiving and restoring happen here, each confirmed first. What is saved here is what the home
 * page, /classes, the user dashboard and /courses all read — courses never depend on Kid Games.
 */
export function ClassManager() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('order');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>(null);

  const query = useQuery({
    queryKey: [...ADMIN_CLASSES_KEY, 'all'],
    queryFn: async () => (await adminClassesApi.list('all')).data,
  });
  // A class in Trash / Deleted is listed there only (Manage Courses shows active and archived classes).
  const all = useMemo(() => (query.data ?? []).filter((c) => c.status !== 'trashed'), [query.data]);
  const live = all.filter((c) => c.status !== 'archived');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
    // Archive and Trash / Deleted (their lists and sidebar counts) follow every archive, delete and restore.
    void queryClient.invalidateQueries({ queryKey: LIFECYCLE_KEY });
  };

  const act = useMutation({
    mutationFn: async ({ action, cls }: NonNullable<Pending>) => {
      if (action === 'hide' || action === 'show') return adminClassesApi.setVisibility(cls.classLevel, action === 'show');
      // Archive → /admin/archive; Delete → /admin/trash (restorable). Nothing here deletes for good.
      if (action === 'archive') return lifecycleApi.archive({ kind: 'class', id: cls.id });
      if (action === 'delete') return lifecycleApi.trash({ kind: 'class', id: cls.id });
      if (action === 'publish') return adminClassesApi.setStatus(cls.classLevel, 'published');
      if (action === 'unpublish') return adminClassesApi.setStatus(cls.classLevel, 'draft');
      if (action === 'duplicate') return adminClassesApi.duplicate(cls.classLevel);
      return adminClassesApi.restore(cls.classLevel);
    },
    onSuccess: (res, { action, cls }) => {
      if (action === 'duplicate') {
        toast.success(`Draft Class ${(res.data as AdminClass).classLevel} created — review it before publishing`);
      } else {
        const done = {
          hide: 'is now hidden',
          show: 'is visible again',
          archive: 'was archived — find it in Archive',
          delete: 'was moved to Trash — restore it from Trash / Deleted',
          restore: 'was restored',
          unpublish: 'is a draft again',
          publish: 'is published',
        }[action];
        toast.success(`${cls.title} ${done}`);
      }
      setPending(null);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'),
  });

  const move = useMutation({
    mutationFn: ({ cls, position }: { cls: AdminClass; position: number }) => adminClassesApi.setPosition(cls.classLevel, position),
    onSuccess: (_res, { cls, position }) => {
      toast.success(`${cls.title} moved to position ${position}`);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not move the class'),
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = all.filter((c) => {
      const st = statusOf(c);
      // Archived classes show only when asked for.
      const matches: Record<Filter, boolean> = {
        all: st !== 'archived',
        published: st === 'published' && isListed(c),
        draft: st === 'draft',
        hidden: st === 'published' && !isListed(c),
        archived: st === 'archived',
      };
      if (!matches[filter]) return false;
      if (!q) return true;
      return (
        String(c.classLevel) === q.replace(/^class\s*/, '') || c.title.toLowerCase().includes(q) || c.subtitle.toLowerCase().includes(q) || c.subjects.some((s) => s.title.toLowerCase().includes(q))
      );
    });
    const by: Record<Sort, (a: AdminClass, b: AdminClass) => number> = {
      order: (a, b) => (a.position ?? 999) - (b.position ?? 999) || a.classLevel - b.classLevel,
      number: (a, b) => a.classLevel - b.classLevel,
      title: (a, b) => a.title.localeCompare(b.title),
      updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      created: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
    };
    return [...rows].sort(by[sort]);
  }, [all, filter, search, sort]);

  const counts = {
    total: all.length,
    published: live.filter((c) => c.status !== 'draft').length,
    hidden: live.filter((c) => !isListed(c)).length,
    draft: live.filter((c) => c.status === 'draft').length,
    archived: all.length - live.length,
  };
  // Moving is only meaningful in display order with nothing filtered out.
  const canReorder = sort === 'order' && filter === 'all' && !search.trim();
  const onAction = (cls: AdminClass) => (action: NonNullable<Pending>['action']) => setPending({ action, cls });
  const onMove = (cls: AdminClass) => (delta: -1 | 1) => cls.position && move.mutate({ cls, position: cls.position + delta });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        icon={GraduationCap}
        title="Manage Courses"
        description="Classes, their subjects and chapters — what the website, /classes, the user dashboard and Courses show."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
              <Plus aria-hidden className="h-4 w-4" />
              Add Class
            </Link>
            <Link
              href="/admin/courses/generate"
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
            >
              <Sparkles aria-hidden className="h-4 w-4 text-accent" />
              AI Course Generator
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        {query.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={GraduationCap} label="Total classes" value={String(counts.total)} hint="Including archived" />
            <StatCard index={1} icon={Send} label="Published" value={String(counts.published)} hint="Not drafts or archived" accent="success" />
            <StatCard index={2} icon={EyeOff} label="Hidden" value={String(counts.hidden)} hint="Only you can see these" accent="warning" />
            <StatCard index={3} icon={FileClock} label="Draft" value={String(counts.draft)} hint="Not published yet" color="#0284c7" />
            <StatCard index={4} icon={Archive} label="Archived" value={String(counts.archived)} hint="Restorable" color="#64748b" />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 p-3 shadow-card sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by class number, title or subject…" className="lg:max-w-sm" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select aria-label="Filter classes" value={filter} onChange={(e) => setFilter(e.target.value as Filter)} options={FILTERS} className="sm:w-44" />
          <Select aria-label="Sort classes" value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={SORTS} className="sm:w-44" />
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} subject="the classes" />
      ) : query.isLoading ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card" role="status" aria-label="Loading classes">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 border-b border-border px-5 py-4 last:border-0">
              <div className="h-10 w-10 animate-pulse rounded-xl bg-surface-hover" />
              <div className="h-4 flex-1 animate-pulse rounded-lg bg-surface-hover" />
              <div className="hidden h-4 w-40 animate-pulse rounded-lg bg-surface-hover md:block" />
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes yet"
          description="Add the first class to show it on the website, /classes and the user dashboard."
          action={
            <Link href="/admin/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
              <Plus aria-hidden className="h-4 w-4" />
              Add Class
            </Link>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={filter === 'archived' && !search ? 'No archived classes' : 'No classes match'}
          description={search ? 'Try another class number, title or subject.' : 'Pick another filter to see more classes.'}
        />
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', (query.isFetching || move.isPending) && 'opacity-70')}>
          {/* Table from xl up (beside the admin sidebar it needs the room); scrolls rather than clips if it must */}
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-border bg-surface-hover/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">
                    Class
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center">
                    Subjects
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center">
                    Chapters
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center">
                    Lessons
                  </th>
                  <th scope="col" className="w-20 px-2 py-3 text-center">
                    Questions
                  </th>
                  <th scope="col" className="w-28 px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="w-28 px-3 py-3">
                    Visibility
                  </th>
                  <th scope="col" className="w-36 px-3 py-3">
                    Updated
                  </th>
                  <th scope="col" className="w-14 py-3 pl-3 pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {shown.map((cls) => (
                  <tr key={cls.id} style={classVars(cls.classLevel)} className={cn('group align-middle transition-colors hover:bg-surface-hover/40', cls.status === 'archived' && 'opacity-70')}>
                    <td className="py-3 pl-5 pr-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ClassThumb cls={cls} />
                        <TitleCell cls={cls} />
                      </div>
                    </td>
                    <td className="px-2 py-3 text-center" title={`${cls.counts.visibleSubjects} shown in this class`}>
                      <Count n={cls.counts.subjects} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Count n={cls.counts.chapters} />
                      {cls.counts.draftChapters > 0 && <span className="block text-[10px] font-medium text-sky-600 dark:text-sky-300">+{cls.counts.draftChapters} draft</span>}
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Count n={cls.counts.lessons} />
                    </td>
                    <td className="px-2 py-3 text-center">
                      <Count n={cls.counts.questions} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge cls={cls} />
                    </td>
                    <td className="px-3 py-3">
                      <VisibilityBadge cls={cls} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <p className="text-xs font-medium text-foreground-soft" title={new Date(cls.updatedAt).toLocaleString()}>
                        {formatRelativeTime(cls.updatedAt)}
                      </p>
                      <p className="text-[11px] text-subtle">Created {shortDate(cls.createdAt)}</p>
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right">
                      <Actions cls={cls} onAction={onAction(cls)} onMove={canReorder ? onMove(cls) : undefined} liveCount={live.length} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards below xl */}
          <ul className="divide-y divide-border/70 xl:hidden">
            {shown.map((cls) => (
              <li key={cls.id} style={classVars(cls.classLevel)} className={cn('flex flex-col gap-3 p-4', cls.status === 'archived' && 'opacity-70')}>
                <div className="flex items-start gap-3">
                  <ClassThumb cls={cls} />
                  <div className="min-w-0 flex-1">
                    <TitleCell cls={cls} />
                  </div>
                  <Actions cls={cls} onAction={onAction(cls)} onMove={canReorder ? onMove(cls) : undefined} liveCount={live.length} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge cls={cls} />
                  <VisibilityBadge cls={cls} />
                </div>
                <dl className="grid grid-cols-4 gap-2 rounded-xl border border-border/70 bg-surface-elevated/40 p-2 text-center">
                  {(
                    [
                      ['Subjects', cls.counts.subjects],
                      ['Chapters', cls.counts.chapters],
                      ['Lessons', cls.counts.lessons],
                      ['Questions', cls.counts.questions],
                    ] as const
                  ).map(([label, n]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-subtle">{label}</dt>
                      <dd>
                        <Count n={n} />
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="text-[11px] text-subtle">
                  Updated {formatRelativeTime(cls.updatedAt)} · Created {shortDate(cls.createdAt)}
                  {cls.counts.draftChapters > 0 && <span className="text-sky-600 dark:text-sky-300"> · {cls.counts.draftChapters} draft chapters</span>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        isOpen={pending?.action === 'hide'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Hide this class?"
        description="It leaves the landing page, /classes, the user dashboard and Courses, and its pages stop opening for visitors. Its data stays safe, and you can still preview and edit it."
        confirmLabel="Hide Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'show'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Show this class again?"
        description="It appears again on the landing page, /classes, the user dashboard and Courses."
        confirmLabel="Show Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'publish'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title={pending?.cls.status === 'draft' ? 'Publish this class?' : 'Publish the draft chapters?'}
        description={
          pending?.cls.status === 'draft'
            ? 'It appears on the landing page, /classes, the user dashboard and Courses (unless it is hidden), with its draft chapters. Every visible subject needs at least one chapter.'
            : 'The generated draft chapters replace each subject’s earlier generated chapters, which are archived (not deleted). Chapters written by hand stay.'
        }
        confirmLabel="Publish"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'unpublish'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Unpublish this class?"
        description="It becomes a draft: it leaves the landing page, /classes, the user dashboard and Courses, and its pages stop opening for learners. Its subjects and chapters stay; publish it again to bring it back."
        confirmLabel="Unpublish"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'duplicate'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Duplicate this class?"
        description="A copy is created as a draft under the next free class number, with its subjects and chapters. It is not published until you review and publish it."
        confirmLabel="Duplicate Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'restore'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Restore this class?"
        description="It comes back at the end of the list, with its subjects and chapters. You can then show or hide it."
        confirmLabel="Restore Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'archive'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        isDangerous={false}
        title={`Archive ${pending?.cls.title ?? 'this class'}?`}
        description={`It leaves the landing page, /classes, the user dashboard, Courses and Kid Games${
          pending ? ` (${pending.cls.counts.subjects} ${pending.cls.counts.subjects === 1 ? 'subject' : 'subjects'}, ${pending.cls.counts.chapters} ${pending.cls.counts.chapters === 1 ? 'chapter' : 'chapters'})` : ''
        } and goes to Archive. Nothing is erased — restore it from Archive at any time.`}
        confirmLabel="Archive"
      />
      <ConfirmDialog
        isOpen={pending?.action === 'delete'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title={`Delete ${pending?.cls.title ?? 'this class'}?`}
        description="It is removed from every list and moved to Trash / Deleted, with its subjects and chapters. It is not deleted for good — you can restore it from Trash until you delete it forever there."
        confirmLabel="Move to Trash"
      />
    </div>
  );
}

function ClassThumb({ cls }: { cls: AdminClass }) {
  const picture = classPicture(cls.classLevel, cls.image, cls.title, cls.builtIn);
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-linear-to-br from-(--kg) to-(--kg-2) text-base font-bold text-white shadow-card">
      {picture &&
        (picture.local ? (
          <Image src={picture.src} alt="" fill sizes="44px" className="object-cover opacity-70" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- an uploaded or linked picture
          <img src={picture.src} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" loading="lazy" referrerPolicy="no-referrer" />
        ))}
      <span className="relative [text-shadow:0_1px_3px_rgba(0,0,0,0.6)]">{cls.classLevel}</span>
    </span>
  );
}

function TitleCell({ cls }: { cls: AdminClass }) {
  const subtitle = cls.subtitle || (cls.builtIn ? builtInSubtitle(cls.classLevel) : '');
  const editable = cls.status !== 'archived';
  return (
    <div className="min-w-0">
      <p className="flex items-baseline gap-2 truncate">
        {editable ? (
          <Link href={`/admin/courses/${cls.classLevel}`} className="truncate font-semibold text-foreground underline-offset-4 hover:underline">
            {cls.title}
          </Link>
        ) : (
          <span className="truncate font-semibold text-foreground">{cls.title}</span>
        )}
        {cls.position !== null && <span className="shrink-0 text-[11px] font-medium text-subtle">#{cls.position}</span>}
      </p>
      {subtitle && <p className="truncate text-xs font-medium text-[color-mix(in_srgb,var(--kg)_68%,var(--foreground))]">{subtitle}</p>}
      {cls.subjects.length > 0 ? (
        <ul className="mt-1.5 flex flex-nowrap gap-1 overflow-hidden" aria-label="Subjects">
          {cls.subjects.map((s) => (
            <li
              key={s.key}
              className={cn('shrink-0 whitespace-nowrap rounded-md border border-border/80 bg-surface-elevated px-1.5 py-px text-[11px] font-medium text-foreground-soft', !s.isVisible && 'opacity-60')}
              title={s.isVisible ? undefined : 'Hidden in this class'}
            >
              {s.title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted">No subjects yet</p>
      )}
    </div>
  );
}

/** A count; zero is muted, so empty classes stand out at a glance. */
function Count({ n }: { n: number }) {
  return <span className={cn('tabular-nums', n > 0 ? 'font-semibold text-foreground' : 'text-subtle')}>{n}</span>;
}

function StatusBadge({ cls }: { cls: AdminClass }) {
  const badge = STATUS_BADGE[statusOf(cls)];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', badge.className)}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      {badge.label}
    </span>
  );
}

function VisibilityBadge({ cls }: { cls: AdminClass }) {
  if (cls.status === 'archived') return <span className="text-xs text-subtle">—</span>;
  const listed = isListed(cls);
  return (
    <span
      title={cls.status === 'off' ? 'Switched off in Content → Classes' : undefined}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
        listed ? 'border-emerald-400/30 text-emerald-600 dark:text-emerald-300' : 'border-amber-400/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
      )}
    >
      {listed ? <Eye aria-hidden className="h-3 w-3" /> : <EyeOff aria-hidden className="h-3 w-3" />}
      {listed ? 'Visible' : cls.status === 'off' ? 'Switched off' : 'Hidden'}
    </span>
  );
}

/** A row's actions, all in one ⋮ menu: the everyday ones first (edit, preview, show/hide), then the rest. */
function Actions({ cls, onAction, onMove, liveCount }: { cls: AdminClass; onAction: (action: NonNullable<Pending>['action']) => void; onMove?: (delta: -1 | 1) => void; liveCount: number }) {
  const router = useRouter();
  const icon = 'h-4 w-4';
  const items: DropdownMenuItem[] =
    cls.status === 'archived'
      ? [{ label: 'Restore', icon: <ArchiveRestore className={icon} />, onClick: () => onAction('restore') }]
      : [
          { label: 'Edit', icon: <PencilLine className={icon} />, onClick: () => router.push(`/admin/courses/${cls.classLevel}`) },
          { label: 'Preview', icon: <Eye className={icon} />, onClick: () => router.push(`/admin/courses/${cls.classLevel}/preview`) },
          cls.status === 'draft'
            ? { label: 'Publish', icon: <Send className={icon} />, onClick: () => onAction('publish') }
            : isListed(cls)
              ? { label: 'Hide', icon: <EyeOff className={icon} />, onClick: () => onAction('hide') }
              : { label: 'Show', icon: <Eye className={icon} />, onClick: () => onAction('show') },
          ...(cls.status === 'visible'
            ? [{ label: 'View public page', icon: <ExternalLink className={icon} />, onClick: () => window.open(`/classes/${cls.slug}`, '_blank', 'noopener'), divider: true }]
            : []),
          { label: 'Generate content', icon: <Sparkles className={icon} />, onClick: () => router.push(`/admin/courses/generate?class=${cls.classLevel}`), divider: cls.status !== 'visible' },
          ...(cls.counts.draftChapters > 0 && cls.status !== 'draft'
            ? [{ label: `Publish ${cls.counts.draftChapters} draft chapters`, icon: <Send className={icon} />, onClick: () => onAction('publish') }]
            : []),
          ...(cls.status !== 'draft' ? [{ label: 'Unpublish (back to draft)', icon: <FileClock className={icon} />, onClick: () => onAction('unpublish') }] : []),
          ...(onMove && cls.position !== null && cls.position > 1 ? [{ label: 'Move up', icon: <ArrowUp className={icon} />, onClick: () => onMove(-1), divider: true }] : []),
          ...(onMove && cls.position !== null && cls.position < liveCount
            ? [{ label: 'Move down', icon: <ArrowDown className={icon} />, onClick: () => onMove(1), divider: !(cls.position > 1) }]
            : []),
          { label: 'Duplicate', icon: <Copy className={icon} />, onClick: () => onAction('duplicate'), divider: true },
          { label: 'Archive', icon: <Archive className={icon} />, onClick: () => onAction('archive'), divider: true },
          { label: 'Delete', icon: <Trash2 className={icon} />, onClick: () => onAction('delete'), danger: true },
        ];
  return (
    <div className="flex shrink-0 justify-end">
      <DropdownMenu items={items} align="right" triggerLabel={`Actions for ${cls.title}`} sheetTitle={cls.title} width={230} />
    </div>
  );
}
