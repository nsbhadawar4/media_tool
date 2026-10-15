'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArchiveRestore,
  Copy,
  FileClock,
  Send,
  Wand2,
  BookOpen,
  Eye,
  EyeOff,
  Gamepad2,
  GraduationCap,
  Layers,
  PencilLine,
  Plus,
  SearchX,
  Shapes,
  type LucideIcon,
} from 'lucide-react';
import { ADMIN_CLASSES_KEY, adminClassesApi, type AdminClass } from '@/lib/api/adminClasses';
import { CONTENT_CATALOG_KEY, useContentCatalog } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DangerConfirmDialog } from '@/components/ui/DangerConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { builtInSubtitle, classPicture, classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { formatRelativeTime } from '@/utils/format';
import { ThemedPlaceholder } from './ClassGenerator';
import { cn } from '@/utils/cn';

type Filter = 'all' | 'visible' | 'hidden' | 'draft' | 'archived';
type Sort = 'order' | 'number' | 'updated';

const SORTS: Array<{ label: string; value: Sort }> = [
  { label: 'Display order', value: 'order' },
  { label: 'Class number', value: 'number' },
  { label: 'Recently updated', value: 'updated' },
];

const STATUS_BADGE: Record<AdminClass['status'], { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-sky-300/50 bg-sky-600/85 text-white' },
  visible: { label: 'Visible', className: 'border-emerald-300/50 bg-emerald-500/85 text-white' },
  hidden: { label: 'Hidden', className: 'border-white/30 bg-slate-900/60 text-white' },
  off: { label: 'Switched off', className: 'border-amber-300/50 bg-amber-500/85 text-white' },
  archived: { label: 'Archived', className: 'border-white/30 bg-slate-700/80 text-white' },
};

/** The pending confirmation: which class, and what the administrator is about to do to it. */
type Pending = { action: 'hide' | 'show' | 'archive' | 'restore' | 'publish' | 'duplicate'; cls: AdminClass } | null;

/**
 * /admin/courses — Manage Courses: every class with its subjects, as cards. Creating and editing
 * happen on their own page (ClassEditor); showing, hiding, archiving and restoring happen here,
 * each confirmed first. Every change goes to the server, and the home page, the user dashboard and
 * the class pages all read the result from the same catalog.
 */
export function ClassManager() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('order');
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<Pending>(null);
  // Classes belong to Kid Games: with that feature switched off they are hidden on every page.
  const catalog = useContentCatalog();
  const kidGamesOff = catalog.fromServer && !catalog.isSectionOn('kid-games');

  const query = useQuery({
    queryKey: [...ADMIN_CLASSES_KEY, 'all'],
    queryFn: async () => (await adminClassesApi.list('all')).data,
  });
  const all = useMemo(() => query.data ?? [], [query.data]);
  const live = all.filter((c) => c.status !== 'archived');

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
  };

  const act = useMutation({
    mutationFn: async ({ action, cls }: NonNullable<Pending>) => {
      if (action === 'hide' || action === 'show') return adminClassesApi.setVisibility(cls.classLevel, action === 'show');
      if (action === 'archive') return adminClassesApi.archive(cls.classLevel);
      if (action === 'publish') return adminClassesApi.setStatus(cls.classLevel, 'published');
      if (action === 'duplicate') return adminClassesApi.duplicate(cls.classLevel);
      return adminClassesApi.restore(cls.classLevel);
    },
    onSuccess: (res, { action, cls }) => {
      if (action === 'duplicate') {
        toast.success(`Draft Class ${res.data.classLevel} created — review it before publishing`);
      } else {
        const done = { hide: 'is now hidden', show: 'is visible again', archive: 'was archived', restore: 'was restored', publish: 'is published' }[action];
        toast.success(`${cls.title} ${done}`);
      }
      setPending(null);
      refresh();
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'),
  });

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = all.filter((c) => {
      if (filter === 'archived' ? c.status !== 'archived' : c.status === 'archived') return false;
      if (filter === 'visible' && c.status !== 'visible') return false;
      if (filter === 'hidden' && c.status !== 'hidden' && c.status !== 'off') return false;
      if (filter === 'draft' && c.status !== 'draft') return false;
      if (!q) return true;
      return (
        String(c.classLevel) === q.replace(/^class\s*/, '') ||
        c.title.toLowerCase().includes(q) ||
        c.subtitle.toLowerCase().includes(q) ||
        c.subjects.some((s) => s.title.toLowerCase().includes(q))
      );
    });
    const by: Record<Sort, (a: AdminClass, b: AdminClass) => number> = {
      order: (a, b) => (a.position ?? 999) - (b.position ?? 999) || a.classLevel - b.classLevel,
      number: (a, b) => a.classLevel - b.classLevel,
      updated: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
    };
    return [...rows].sort(by[sort]);
  }, [all, filter, search, sort]);

  const subjectKeys = new Set(live.flatMap((c) => c.subjects.map((s) => s.key)));
  const counts = {
    all: live.length,
    visible: live.filter((c) => c.status === 'visible').length,
    hidden: live.filter((c) => c.status === 'hidden' || c.status === 'off').length,
    draft: live.filter((c) => c.status === 'draft').length,
    archived: all.length - live.length,
  };
  const chapterTotal = live.reduce((n, c) => n + c.counts.chapters, 0);
  const lessonTotal = live.reduce((n, c) => n + c.counts.lessons, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        icon={GraduationCap}
        title="Manage Courses"
        description="Create, edit and control the classes available across the platform."
        actions={
          <Link href="/admin/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
            <Plus aria-hidden className="h-4 w-4" />
            Create Class
          </Link>
        }
      />

      {kidGamesOff && (
        <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            <strong>Kid Games is switched off.</strong> Visible classes still show on the website and their class pages, but signed-in users can&apos;t
            open them in Kid Games or see them on their dashboard until it is on again.
          </p>
          <Link href="/admin/content/sections" className="inline-flex h-9 shrink-0 items-center rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover">
            Open Landing page settings
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        {query.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={GraduationCap} label="Total classes" value={String(counts.all)} hint="Not archived" />
            <StatCard index={1} icon={Eye} label="Visible" value={String(counts.visible)} hint="On the website and dashboard" accent="success" />
            <StatCard index={2} icon={EyeOff} label="Hidden" value={String(counts.hidden)} hint="Only you can see these" accent="warning" />
            <StatCard index={3} icon={FileClock} label="Drafts" value={String(counts.draft)} hint="Not published yet" color="#0284c7" />
            <StatCard index={4} icon={BookOpen} label="Subjects" value={String(subjectKeys.size)} hint="Across all classes" color="#06b6d4" />
            <StatCard index={5} icon={Layers} label="Chapters" value={String(chapterTotal)} hint={`${lessonTotal} lessons · ${live.reduce((n, c) => n + c.counts.games, 0)} games`} color="#f59e0b" />
          </>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 p-3 shadow-card sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={search} onChange={setSearch} placeholder="Search by class number, title or subject…" className="sm:max-w-sm" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Tabs
            aria-label="Show classes"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'visible', label: 'Visible', count: counts.visible },
              { value: 'hidden', label: 'Hidden', count: counts.hidden },
              { value: 'draft', label: 'Drafts', count: counts.draft },
              { value: 'archived', label: 'Archived', count: counts.archived },
            ]}
          />
          <Select aria-label="Sort classes" value={sort} onChange={(e) => setSort(e.target.value as Sort)} options={SORTS} className="sm:w-48" />
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} subject="the classes" />
      ) : query.isLoading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
              <div className="aspect-[16/10] animate-pulse bg-surface-hover" />
              <div className="space-y-3 p-5">
                <div className="h-5 w-2/3 animate-pulse rounded-lg bg-surface-hover" />
                <div className="h-4 w-full animate-pulse rounded-lg bg-surface-hover" />
                <div className="h-8 w-1/2 animate-pulse rounded-lg bg-surface-hover" />
              </div>
            </div>
          ))}
        </div>
      ) : all.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No classes yet"
          description="Create the first class to show it on the website and the user dashboard."
          action={
            <Link href="/admin/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
              <Plus aria-hidden className="h-4 w-4" />
              Create Class
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
        <ul className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((cls, i) => (
            <li key={cls.id}>
              <ClassAdminCard cls={cls} index={i} onAction={(action) => setPending({ action, cls })} />
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        isOpen={pending?.action === 'hide'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Hide this class?"
        description="This class will no longer appear on the public landing page or user dashboard. Existing data will remain safe."
        confirmLabel="Hide Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'show'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Show this class again?"
        description="It will appear again on the public landing page and the user dashboard."
        confirmLabel="Show Class"
        isDangerous={false}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'publish'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && act.mutate(pending)}
        isLoading={act.isPending}
        title="Publish this class?"
        description="It will appear on the public landing page, its class page and the user dashboard (unless it is hidden). Every subject needs at least one chapter."
        confirmLabel="Publish Class"
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
        description="It comes back at the end of the list, with its subjects. You can then show or hide it."
        confirmLabel="Restore Class"
        isDangerous={false}
      />
      <DangerConfirmDialog
        isOpen={pending?.action === 'archive'}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          if (pending) await act.mutateAsync(pending);
        }}
        isLoading={act.isPending}
        title="Delete Class?"
        consequences={
          pending ? (
            <>
              This action can affect subjects, games and learning content connected to this class: <strong>{pending.cls.title}</strong> will disappear from the
              website, the user dashboard and Kid Games ({pending.cls.counts.subjects} {pending.cls.counts.subjects === 1 ? 'subject' : 'subjects'},{' '}
              {pending.cls.counts.games} learning {pending.cls.counts.games === 1 ? 'game' : 'games'}). Nothing is erased: learners keep their progress, and you can restore
              the class from <em>Archived</em> at any time.
            </>
          ) : null
        }
        confirmationPhrase={pending?.cls.title ?? ''}
        confirmLabel="Delete Class"
        warning="It is archived, not erased — but learners lose access to it until you restore it."
      />
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-foreground-soft">
      <Icon aria-hidden className="h-3.5 w-3.5 text-muted" />
      {children}
    </span>
  );
}

/** One class as a card: picture, status, title, subjects, figures and its actions. */
function ClassAdminCard({ cls, index, onAction }: { cls: AdminClass; index: number; onAction: (action: NonNullable<Pending>['action']) => void }) {
  const picture = classPicture(cls.classLevel, cls.image, cls.title, cls.builtIn);
  const badge = STATUS_BADGE[cls.status];
  const archived = cls.status === 'archived';
  const subtitle = cls.subtitle || (cls.builtIn ? builtInSubtitle(cls.classLevel) : '');
  return (
    <article
      style={{ ...classVars(cls.classLevel), '--i': index } as React.CSSProperties}
      className={cn('kg-course-card group flex h-full flex-col overflow-hidden rounded-3xl border border-border shadow-card', archived && 'opacity-80')}
    >
      <div className="relative aspect-[16/10] shrink-0 overflow-hidden">
        {picture ? (
          picture.local ? (
            <Image src={picture.src} alt={picture.alt} fill sizes="(min-width: 1280px) 380px, (min-width: 768px) 50vw, 100vw" className="kg-course-art object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- an uploaded or linked picture
            <img src={picture.src} alt={picture.alt} className="kg-course-art absolute inset-0 h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
          )
        ) : (
          <div className="kg-course-art absolute inset-0">
            <ThemedPlaceholder level={cls.classLevel} marks={cls.subjects.map((s) => s.glyph ?? '').filter(Boolean).slice(0, 4)} />
          </div>
        )}
        <span aria-hidden className="kg-photo-veil pointer-events-none absolute inset-0" />
        <span className="absolute left-4 top-4 flex h-10 min-w-10 items-center justify-center rounded-xl bg-linear-to-br from-(--kg) to-(--kg-2) px-2 text-base font-bold text-white shadow-[0_8px_18px_-8px_rgba(0,0,0,0.5)]">
          {cls.classLevel}
        </span>
        <span className={cn('absolute right-4 top-4 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider backdrop-blur-md', badge.className)}>{badge.label}</span>
        {cls.position !== null && (
          <span className="absolute bottom-3 right-4 rounded-full bg-black/35 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm" title="Display order">
            #{cls.position}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold tracking-tight text-foreground">{cls.title}</h3>
          {subtitle && <p className="truncate text-sm font-medium text-[color-mix(in_srgb,var(--kg)_68%,var(--foreground))]">{subtitle}</p>}
          {cls.description && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{cls.description}</p>}
        </div>

        {cls.subjects.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Subjects">
            {cls.subjects.map((s) => (
              <li
                key={s.key}
                title={!s.isVisible ? 'Hidden in this class' : !s.isAvailable ? 'Switched off for every class' : undefined}
                className={cn(
                  'rounded-full border border-border bg-surface-hover/60 px-2.5 py-0.5 text-xs font-medium text-foreground-soft',
                  (!s.isVisible || !s.isAvailable) && 'border-dashed opacity-60 line-through decoration-muted/60',
                )}
              >
                {s.title}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted">No subjects yet</p>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          <Fact icon={Layers}>
            {cls.counts.subjects} {cls.counts.subjects === 1 ? 'subject' : 'subjects'}
          </Fact>
          <Fact icon={Shapes}>
            {cls.counts.chapters} {cls.counts.chapters === 1 ? 'chapter' : 'chapters'}
          </Fact>
          <Fact icon={BookOpen}>
            {cls.counts.lessons} {cls.counts.lessons === 1 ? 'lesson' : 'lessons'}
          </Fact>
          {cls.counts.games > 0 && (
            <Fact icon={Gamepad2}>
              {cls.counts.games} {cls.counts.games === 1 ? 'game' : 'games'}
            </Fact>
          )}
        </div>

        <p className="text-xs text-muted">
          Updated {formatRelativeTime(cls.updatedAt)} · Created {new Date(cls.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>

        <div aria-hidden className="flex-1" />
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {archived ? (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => onAction('restore')}>
              <ArchiveRestore aria-hidden className="h-4 w-4" />
              Restore
            </Button>
          ) : (
            <>
              <Link
                href={`/admin/courses/${cls.classLevel}`}
                className="btn-primary inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-accent-foreground"
                aria-label={`Edit ${cls.title}`}
              >
                <PencilLine aria-hidden className="h-4 w-4" />
                Edit
              </Link>
              <Link
                href={`/admin/courses/${cls.classLevel}/preview`}
                title="See the class as visitors will — it doesn't change visibility"
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                aria-label={`Preview ${cls.title}`}
              >
                <Eye aria-hidden className="h-4 w-4" />
                Preview
              </Link>
              {cls.status === 'draft' ? (
                <Button variant="ghost" size="sm" className="gap-1.5 text-accent" onClick={() => onAction('publish')} aria-label={`Publish ${cls.title}`}>
                  <Send aria-hidden className="h-4 w-4" />
                  Publish
                </Button>
              ) : cls.status === 'visible' ? (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onAction('hide')} aria-label={`Hide ${cls.title}`}>
                  <EyeOff aria-hidden className="h-4 w-4" />
                  Hide
                </Button>
              ) : (
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onAction('show')} aria-label={`Show ${cls.title}`}>
                  <Eye aria-hidden className="h-4 w-4" />
                  Show
                </Button>
              )}
              <div className="flex w-full flex-wrap gap-1 border-t border-border/60 pt-2">
                <Link
                  href={`/admin/courses/${cls.classLevel}/generate`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-foreground-soft transition-colors hover:bg-surface-hover hover:text-foreground"
                  aria-label={`Generate curriculum for ${cls.title}`}
                >
                  <Wand2 aria-hidden className="h-3.5 w-3.5" />
                  Generate Curriculum
                </Link>
                <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => onAction('duplicate')} aria-label={`Duplicate ${cls.title}`}>
                  <Copy aria-hidden className="h-3.5 w-3.5" />
                  Duplicate
                </Button>
                <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-danger hover:text-danger" onClick={() => onAction('archive')} aria-label={`Delete ${cls.title}`} title="Archive — can be restored">
                  <Archive aria-hidden className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </article>
  );
}
