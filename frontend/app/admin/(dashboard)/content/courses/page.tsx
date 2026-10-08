'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, BookOpenCheck, PencilLine, Plus, Search, X } from 'lucide-react';
import { adminContentApi, type ContentSort, type ContentStatus } from '@/lib/api/adminContent';
import type { Course } from '@/lib/api/content';
import { useToast } from '@/lib/toast/ToastContext';
import { useDebounce } from '@/hooks/useDebounce';
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
import { ContentNav } from '@/components/admin/content/ContentNav';
import { useTaxonomy } from '@/components/admin/content/useTaxonomy';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 20;
const STATUS_OPTIONS: Array<{ label: string; value: ContentStatus }> = [
  { label: 'All (not archived)', value: 'live' },
  { label: 'Published', value: 'active' },
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

/** /admin/content/courses: every course, with publish switches, ordering and archive. */
export default function AdminCoursesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ContentStatus>('live');
  const [sort, setSort] = useState<ContentSort>('order');
  const [page, setPage] = useState(1);
  const [classLevel, setClassLevel] = useState('');
  const [subject, setSubject] = useState('');
  const tax = useTaxonomy();
  const [archiving, setArchiving] = useState<Course | null>(null);
  const debounced = useDebounce(search, 300);

  const params = { search: debounced.trim() || undefined, status, sort, classLevel: classLevel ? Number(classLevel) : undefined, subject: subject || undefined, page, limit: PAGE_SIZE };
  const stats = useQuery({ queryKey: ['admin', 'content', 'stats'], queryFn: async () => (await adminContentApi.stats()).data });
  const list = useQuery({ queryKey: ['admin', 'content', 'courses', params], queryFn: () => adminContentApi.courses(params), placeholderData: keepPreviousData });
  const courses = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(params.search || status !== 'live' || classLevel || subject);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
    void queryClient.invalidateQueries({ queryKey: ['content', 'courses'] });
  };
  const onError = (err: Error) => toast.error(err.message);
  const update = useMutation({ mutationFn: ({ id, patch }: { id: string; patch: { isEnabled?: boolean; isVisible?: boolean } }) => adminContentApi.updateCourse(id, patch), onSuccess: refresh, onError });
  const move = useMutation({
    mutationFn: ({ id, direction }: { id: string; direction: 'up' | 'down' }) => adminContentApi.moveCourse(id, direction),
    onSuccess: (res) => {
      if (res.message?.startsWith('Already')) toast.info(res.message);
      refresh();
    },
    onError,
  });
  const archive = useMutation({
    mutationFn: (id: string) => adminContentApi.archiveCourse(id),
    onSuccess: (res) => {
      toast.success(`Archived “${res.data.title}”`);
      setArchiving(null);
      refresh();
    },
    onError,
  });
  const restore = useMutation({ mutationFn: (id: string) => adminContentApi.restoreCourse(id), onSuccess: (res) => (toast.success(`Restored “${res.data.title}”`), refresh()), onError });
  const busy = update.isPending || move.isPending || archive.isPending || restore.isPending;
  const canReorder = sort === 'order' && status !== 'archived';
  const s = stats.data?.course;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Content"
        icon={BookOpenCheck}
        title="Courses"
        description="Lessons written here, published to signed-in users on /courses."
        actions={
          <Link href="/admin/content/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-accent-foreground">
            <Plus className="h-4 w-4" />
            New course
          </Link>
        }
      />
      <ContentNav />

      <section aria-label="Course figures" className="grid grid-cols-3 gap-3 sm:gap-4">
        {!s ? (
          Array.from({ length: 3 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard index={0} icon={BookOpenCheck} label="Courses" value={s.total.toLocaleString()} hint="Not archived" />
            <StatCard index={1} icon={BookOpenCheck} accent="success" label="Published" value={s.active.toLocaleString()} hint="Enabled and listed" />
            <StatCard index={2} icon={Archive} color="var(--muted)" label="Archived" value={s.archived.toLocaleString()} hint="Restorable" />
          </>
        )}
      </section>

      <section aria-label="Search and filters" className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search courses…"
            aria-label="Search courses"
            className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
        <Select options={STATUS_OPTIONS} value={status} onChange={(e) => (setStatus(e.target.value as ContentStatus), setPage(1))} aria-label="Status" />
        <Select
          options={[{ label: 'All classes', value: '' }, ...tax.classes.map((c) => ({ label: c.title, value: String(c.classLevel) }))]}
          value={classLevel}
          onChange={(e) => (setClassLevel(e.target.value), setPage(1))}
          aria-label="Class"
        />
        <Select
          options={[{ label: 'All subjects', value: '' }, ...tax.subjects.map((s) => ({ label: s.title, value: s.key }))]}
          value={subject}
          onChange={(e) => (setSubject(e.target.value), setPage(1))}
          aria-label="Subject"
        />
        <Select options={SORT_OPTIONS} value={sort} onChange={(e) => (setSort(e.target.value as ContentSort), setPage(1))} aria-label="Sort" />
        {filtered && (
          <button type="button" onClick={() => (setSearch(''), setStatus('live'), setClassLevel(''), setSubject(''), setPage(1))} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground">
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </section>

      {list.isError ? (
        <ErrorState error={list.error} subject="courses" onRetry={() => list.refetch()} />
      ) : list.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading courses">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-surface-hover" />)}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          icon={BookOpenCheck}
          title={filtered ? 'No matching courses' : 'No courses yet'}
          description={filtered ? 'Try a different search or status.' : 'Write the first one — it appears on /courses once published.'}
          action={
            !filtered ? (
              <Link href="/admin/content/courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-accent-foreground">
                <Plus className="h-4 w-4" />
                New course
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className={cn('divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', list.isFetching && 'opacity-70')}>
          {courses.map((course) => (
            <li key={course.id} className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="flex shrink-0 flex-col items-center">
                  <button type="button" onClick={() => move.mutate({ id: course.id, direction: 'up' })} disabled={!canReorder || busy || Boolean(course.archivedAt)} aria-label={`Move ${course.title} up`} className="flex h-7 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover disabled:opacity-30">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] tabular-nums text-subtle">{course.archivedAt ? '—' : course.order}</span>
                  <button type="button" onClick={() => move.mutate({ id: course.id, direction: 'down' })} disabled={!canReorder || busy || Boolean(course.archivedAt)} aria-label={`Move ${course.title} down`} className="flex h-7 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover disabled:opacity-30">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <Link href={`/admin/content/courses/${course.id}`} className="truncate text-sm font-semibold text-foreground hover:text-accent">{course.title}</Link>
                    {course.archivedAt ? <Badge>Archived</Badge> : course.isEnabled ? <Badge variant="success">Enabled</Badge> : <Badge variant="danger">Disabled</Badge>}
                    {!course.archivedAt && !course.isVisible && <Badge variant="warning">Hidden</Badge>}
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted">
                    <code className="rounded bg-surface-hover px-1 font-mono text-[11px]">/courses/{course.slug}</code>
                    <span>{course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'}</span>
                    {course.classLevel != null && course.subject ? (
                      <span>
                        {tax.classTitle(course.classLevel)} · {tax.subjectTitle(course.subject)}
                      </span>
                    ) : (
                      <span className="text-warning">Needs a class and subject</span>
                    )}
                    {course.difficulty && <span>{course.difficulty}</span>}
                    <span className="text-subtle">Updated {formatRelativeTime(course.updatedAt)}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-11 lg:pl-0">
                {!course.archivedAt && (
                  <>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <Toggle checked={course.isEnabled} onChange={(v) => update.mutate({ id: course.id, patch: { isEnabled: v } })} label={`${course.title} enabled`} disabled={busy} />
                      Enabled
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <Toggle checked={course.isVisible} onChange={(v) => update.mutate({ id: course.id, patch: { isVisible: v } })} label={`${course.title} visible`} disabled={busy} />
                      Visible
                    </label>
                  </>
                )}
                {course.archivedAt ? (
                  <Button variant="secondary" size="sm" onClick={() => restore.mutate(course.id)} disabled={busy}>
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                ) : (
                  <div className="flex items-center gap-1">
                    <Link href={`/admin/content/courses/${course.id}`} aria-label={`Edit ${course.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground">
                      <PencilLine className="h-4 w-4" />
                    </Link>
                    <button type="button" onClick={() => setArchiving(course)} aria-label={`Archive ${course.title}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger">
                      <Archive className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {meta && meta.totalPages > 1 && <Pagination meta={meta} onPageChange={setPage} numbered />}

      <ConfirmDialog
        isOpen={archiving !== null}
        onClose={() => !archive.isPending && setArchiving(null)}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
        title={`Archive “${archiving?.title ?? ''}”?`}
        description="It disappears from /courses straight away. Nothing is deleted: restore it from the Archived filter at any time."
        confirmLabel="Archive"
        isDangerous
        isLoading={archive.isPending}
      />
    </div>
  );
}
