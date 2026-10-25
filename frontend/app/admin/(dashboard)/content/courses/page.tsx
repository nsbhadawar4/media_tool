'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, BookOpenCheck, CalendarClock, CalendarDays, PencilLine, Plus, Search, Users, X } from 'lucide-react';
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
import { ScheduleFields, valueToSchedule, type ScheduleValue } from '@/components/admin/content/ScheduleFields';
import { MONTHS, academicYearChoices, monthName, scheduleLabel } from '@/lib/content/academicCalendar';
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
  // Academic year ("" = any, "unscheduled" = the courses still needing a year and month) and a month in it.
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<ScheduleValue>({ academicYear: '', month: '' });
  const tax = useTaxonomy();
  const [archiving, setArchiving] = useState<Course | null>(null);
  const debounced = useDebounce(search, 300);

  const when = year === 'unscheduled' ? { schedule: 'unscheduled' as const } : year ? { academicYear: year, ...(month ? { month: Number(month) } : {}) } : {};
  const params = { search: debounced.trim() || undefined, status, sort, classLevel: classLevel ? Number(classLevel) : undefined, subject: subject || undefined, ...when, page, limit: PAGE_SIZE };
  const learners = useQuery({
    queryKey: ['admin', 'content', 'courseStats', { classLevel, subject, when }],
    queryFn: async () => (await adminContentApi.courseStats({ classLevel: classLevel ? Number(classLevel) : undefined, subject: subject || undefined, ...when })).data,
  });
  const statOf = new Map((learners.data?.courses ?? []).map((c) => [c.id, c]));
  const stats = useQuery({ queryKey: ['admin', 'content', 'stats'], queryFn: async () => (await adminContentApi.stats()).data });
  const list = useQuery({ queryKey: ['admin', 'content', 'courses', params], queryFn: () => adminContentApi.courses(params), placeholderData: keepPreviousData });
  const courses = list.data?.data ?? [];
  const meta = list.data?.meta;
  const filtered = Boolean(params.search || status !== 'live' || classLevel || subject || year);

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
  const schedule = useMutation({
    mutationFn: (ids: string[]) => {
      const { academicYear, month: m } = valueToSchedule(bulk);
      return adminContentApi.scheduleCourses(ids, academicYear, m);
    },
    onSuccess: (res) => {
      toast.success(res.message ?? 'Schedule saved');
      setPicked(new Set());
      refresh();
    },
    onError,
  });
  const busy = update.isPending || move.isPending || archive.isPending || restore.isPending || schedule.isPending;
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set([...p, id])));
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
        <Select
          options={[{ label: 'All years', value: '' }, ...academicYearChoices(new Date(), courses.map((c) => c.academicYear)).map((y) => ({ label: y, value: y })), { label: 'Needs year/month', value: 'unscheduled' }]}
          value={year}
          onChange={(e) => (setYear(e.target.value), setMonth(''), setPicked(new Set()), setPage(1))}
          aria-label="Academic year"
        />
        <Select
          options={[{ label: 'All months', value: '' }, ...MONTHS.map((m) => ({ label: m.long, value: String(m.n) }))]}
          value={month}
          onChange={(e) => (setMonth(e.target.value), setPage(1))}
          disabled={!year || year === 'unscheduled'}
          aria-label="Month"
        />
        <Select options={SORT_OPTIONS} value={sort} onChange={(e) => (setSort(e.target.value as ContentSort), setPage(1))} aria-label="Sort" />
        {filtered && (
          <button type="button" onClick={() => (setSearch(''), setStatus('live'), setClassLevel(''), setSubject(''), setYear(''), setMonth(''), setPage(1))} className="inline-flex h-10 items-center gap-1 rounded-xl px-3 text-xs font-medium text-muted transition hover:bg-surface-hover hover:text-foreground">
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </section>

      {(learners.data?.unscheduled ?? 0) > 0 && year !== 'unscheduled' && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-2 text-foreground">
            <CalendarClock aria-hidden className="h-4 w-4 shrink-0 text-warning" />
            <span>
              <strong className="font-semibold">{learners.data!.unscheduled}</strong> {learners.data!.unscheduled === 1 ? 'course needs' : 'courses need'} a year and month. Learners find {learners.data!.unscheduled === 1 ? 'it' : 'them'} under “Anytime” until you map {learners.data!.unscheduled === 1 ? 'it' : 'them'}.
            </span>
          </span>
          <Button variant="secondary" size="sm" onClick={() => (setYear('unscheduled'), setMonth(''), setPage(1))}>
            Show them
          </Button>
        </div>
      )}

      {learners.data && learners.data.totals.courses > 0 && (
        <section aria-label="Learning statistics" className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-5">
          {[
            { label: 'Started', value: learners.data.totals.started.toLocaleString() },
            { label: 'In progress', value: learners.data.totals.inProgress.toLocaleString() },
            { label: 'Completed', value: learners.data.totals.completed.toLocaleString() },
            { label: 'Average progress', value: `${learners.data.totals.averageProgress}%` },
            { label: 'Average score', value: learners.data.totals.averageScore === null ? '—' : `${learners.data.totals.averageScore}%` },
          ].map((t) => (
            <div key={t.label}>
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t.label === 'Started' && <Users aria-hidden className="h-3 w-3" />}
                {t.label}
              </p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{t.value}</p>
            </div>
          ))}
          <p className="col-span-2 text-[11px] text-subtle sm:col-span-5">
            Learners per course for {year === 'unscheduled' ? 'courses without a schedule' : year ? scheduleLabel({ year, month: month ? Number(month) : null }) : 'every course'}
            {classLevel ? ` · ${tax.classTitle(Number(classLevel))}` : ''}
            {subject ? ` · ${tax.subjectTitle(subject)}` : ''}. Counted from learners’ saved progress.
          </p>
        </section>
      )}

      {picked.size > 0 && (
        <section aria-label="Schedule the selected courses" className="sticky top-2 z-10 flex flex-col gap-3 rounded-2xl border border-accent/40 bg-surface p-4 shadow-lift lg:flex-row lg:items-end">
          <p className="text-sm font-semibold text-foreground lg:pb-2.5">{picked.size} selected</p>
          <div className="min-w-0 flex-1">
            <ScheduleFields value={bulk} onChange={setBulk} compact />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => schedule.mutate([...picked])} isLoading={schedule.isPending} disabled={!bulk.academicYear}>
              <CalendarDays className="h-4 w-4" />
              Apply schedule
            </Button>
            <Button variant="secondary" onClick={() => (setBulk({ academicYear: '', month: '' }), schedule.mutate([...picked]))} disabled={schedule.isPending} title="Take the selected courses out of the calendar">
              Clear schedule
            </Button>
            <Button variant="secondary" onClick={() => setPicked(new Set())} disabled={schedule.isPending}>
              Cancel
            </Button>
          </div>
        </section>
      )}

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
                {!course.archivedAt && (
                  <input type="checkbox" checked={picked.has(course.id)} onChange={() => toggle(course.id)} aria-label={`Select ${course.title}`} className="mt-2 h-4 w-4 shrink-0 accent-[var(--accent)]" />
                )}
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
                    {!course.archivedAt &&
                      (course.academicYear ? (
                        <Badge>{course.month ? `${monthName(course.month, 'short')} ${course.academicYear}` : course.academicYear}</Badge>
                      ) : (
                        <Badge variant="warning">Year/Month needs mapping</Badge>
                      ))}
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
                    {(() => {
                      const st = statOf.get(course.id);
                      return st ? (
                        <span className="text-foreground-soft" title="From learners’ saved progress">
                          {st.started} {st.started === 1 ? 'learner' : 'learners'}
                          {st.started > 0 ? ` · ${st.completed} completed · ${st.averageProgress}% avg` : ''}
                        </span>
                      ) : null;
                    })()}
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
