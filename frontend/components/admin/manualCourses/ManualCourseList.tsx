'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDeferredValue, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveRestore, BookOpen, Copy, Eye, EyeOff, FileClock, NotebookPen, PencilLine, Plus, SearchX, Send, Trash2, Undo2 } from 'lucide-react';
import { MANUAL_COURSES_KEY, manualCoursesApi, type ManualCourseListQuery, type ManualCourseRow } from '@/lib/api/manualCourses';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatCard, StatCardSkeleton } from '@/components/admin/StatCard';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

const PAGE_SIZE = 20;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const errorText = (err: unknown) => (err instanceof Error && err.message ? err.message : 'Something went wrong');

type Pending = { action: 'trash' | 'forever'; row: ManualCourseRow } | null;

/**
 * /admin/manual-courses and /admin/manual-courses/trash: manual courses only (never the generated
 * ones). The list: search, class / subject / status / visibility filters, and per course Edit,
 * Preview, Duplicate, Publish / Unpublish and Delete (→ Trash). Trash: Restore and Permanent delete.
 */
export function ManualCourseList({ mode }: { mode: 'list' | 'trash' }) {
  const isTrash = mode === 'trash';
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [classLevel, setClassLevel] = useState('');
  const [subject, setSubject] = useState('');
  const [status, setStatus] = useState<ManualCourseListQuery['status']>('all');
  const [visibility, setVisibility] = useState<ManualCourseListQuery['visibility']>('all');
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<Pending>(null);

  const options = useQuery({ queryKey: [...MANUAL_COURSES_KEY, 'options'], queryFn: async ({ signal }) => (await manualCoursesApi.options(signal)).data });
  const stats = useQuery({ queryKey: [...MANUAL_COURSES_KEY, 'stats'], queryFn: async ({ signal }) => (await manualCoursesApi.stats(signal)).data });
  const params: ManualCourseListQuery = {
    q: deferredSearch,
    classLevel: classLevel ? Number(classLevel) : undefined,
    subject: subject || undefined,
    status: isTrash ? 'all' : status,
    visibility: isTrash ? 'all' : visibility,
    sort: 'recent',
    page,
    limit: PAGE_SIZE,
  };
  const list = useQuery({
    queryKey: [...MANUAL_COURSES_KEY, mode, params],
    queryFn: async ({ signal }) => (isTrash ? manualCoursesApi.trash(params, signal) : manualCoursesApi.list(params, signal)),
    placeholderData: (prev) => prev,
  });
  const rows = list.data?.data ?? [];
  const filtered = Boolean(deferredSearch || classLevel || subject || status !== 'all' || visibility !== 'all');

  // Subjects follow the chosen class (only its own); without a class, every subject any class offers.
  const subjectOptions = useMemo(() => {
    const classes = options.data?.classes ?? [];
    const pool = classLevel ? classes.filter((c) => String(c.level) === classLevel) : classes;
    const seen = new Map<string, string>();
    for (const c of pool) for (const s of c.subjects) if (!seen.has(s.key)) seen.set(s.key, s.title);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [options.data, classLevel]);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: MANUAL_COURSES_KEY });
  const onError = (err: unknown) => toast.error(errorText(err));

  const publish = useMutation({
    mutationFn: (row: ManualCourseRow) => (row.status === 'published' ? manualCoursesApi.unpublish(row.id) : manualCoursesApi.publish(row.id)),
    onSuccess: (res) => (toast.success(res.data.status === 'published' ? `“${res.data.title}” is published.` : `“${res.data.title}” is a draft again.`), refresh()),
    onError,
  });
  const duplicate = useMutation({
    mutationFn: (row: ManualCourseRow) => manualCoursesApi.duplicate(row.id),
    onSuccess: (res) => (toast.success(`Duplicated as “${res.data.title}” (draft).`), refresh()),
    onError,
  });
  const trash = useMutation({
    mutationFn: (row: ManualCourseRow) => manualCoursesApi.trashOne(row.id),
    onSuccess: () => (toast.success('Course moved to Trash.'), setPending(null), refresh()),
    onError,
  });
  const restore = useMutation({
    mutationFn: (row: ManualCourseRow) => manualCoursesApi.restore(row.id),
    onSuccess: (res) => (toast.success(`“${res.data.title}” restored.`), refresh()),
    onError,
  });
  const forever = useMutation({
    mutationFn: (row: ManualCourseRow) => manualCoursesApi.deleteForever(row.id, 'DELETE'),
    onSuccess: () => (toast.success('Course permanently deleted.'), setPending(null), refresh()),
    onError,
  });
  const toggleVisible = useMutation({
    mutationFn: (row: ManualCourseRow) => manualCoursesApi.setVisibility(row.id, !row.isVisible),
    onSuccess: (res) => (toast.success(res.data.isVisible ? `“${res.data.title}” is visible to learners.` : `“${res.data.title}” is hidden from learners.`), refresh()),
    onError,
  });
  const busy = publish.isPending || duplicate.isPending || trash.isPending || restore.isPending || forever.isPending || toggleVisible.isPending;

  const menuFor = (row: ManualCourseRow): DropdownMenuItem[] =>
    isTrash
      ? [
          { label: 'Preview', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/admin/manual-courses/${row.id}/preview`) },
          { label: 'Restore', icon: <ArchiveRestore className="h-4 w-4" />, onClick: () => restore.mutate(row) },
          { label: 'Delete permanently', icon: <Trash2 className="h-4 w-4" />, onClick: () => setPending({ action: 'forever', row }), danger: true, divider: true },
        ]
      : [
          { label: 'Edit', icon: <PencilLine className="h-4 w-4" />, onClick: () => router.push(`/admin/manual-courses/${row.id}/edit`) },
          { label: 'Preview', icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/admin/manual-courses/${row.id}/preview`) },
          { label: 'Duplicate', icon: <Copy className="h-4 w-4" />, onClick: () => duplicate.mutate(row) },
          row.status === 'published'
            ? { label: 'Unpublish', icon: <Undo2 className="h-4 w-4" />, onClick: () => publish.mutate(row) }
            : { label: 'Publish', icon: <Send className="h-4 w-4" />, onClick: () => publish.mutate(row) },
          row.isVisible
            ? { label: 'Hide', icon: <EyeOff className="h-4 w-4" />, onClick: () => toggleVisible.mutate(row) }
            : { label: 'Show', icon: <Eye className="h-4 w-4" />, onClick: () => toggleVisible.mutate(row) },
          { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => setPending({ action: 'trash', row }), danger: true, divider: true },
        ];

  const s = stats.data;
  return (
    <div className="space-y-6">
      <PageHeader
        icon={isTrash ? Trash2 : NotebookPen}
        title={isTrash ? 'Manual Courses — Trash' : 'Manual Courses'}
        description={
          isTrash
            ? 'Deleted manual courses. Restore one to bring it back as it was, or delete it permanently.'
            : 'Courses written manually — chapters, lessons and questions. Separate from the AI Course Generator.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {isTrash ? (
              <Link
                href="/admin/manual-courses"
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                <NotebookPen aria-hidden className="h-4 w-4" />
                All manual courses
              </Link>
            ) : (
              <>
                <Link
                  href="/admin/manual-courses/trash"
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover"
                >
                  <Trash2 aria-hidden className="h-4 w-4" />
                  Trash{s?.trashed ? ` (${s.trashed})` : ''}
                </Link>
                <Link href="/admin/manual-courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
                  <Plus aria-hidden className="h-4 w-4" />
                  Add Manual Course
                </Link>
              </>
            )}
          </div>
        }
      />

      {!isTrash && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {!s ? (
            Array.from({ length: 4 }, (_, i) => <StatCardSkeleton key={i} />)
          ) : (
            <>
              <StatCard index={0} icon={NotebookPen} label="Manual courses" value={String(s.total)} hint="Not in Trash" />
              <StatCard index={1} icon={Send} label="Published" value={String(s.published)} hint="Learners can open them" accent="success" />
              <StatCard index={2} icon={FileClock} label="Drafts" value={String(s.drafts)} hint="Not shown to learners" accent="warning" />
              <StatCard index={3} icon={EyeOff} label="Hidden" value={String(s.hidden)} hint="Visibility off" color="#64748b" />
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3 shadow-card sm:p-4 lg:flex-row lg:items-center">
        <SearchInput value={search} onChange={(v) => (setSearch(v), setPage(1))} placeholder="Search manual courses by title" className="lg:max-w-sm lg:flex-1" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap lg:ml-auto">
          <Select
            aria-label="Class"
            value={classLevel}
            onChange={(e) => (setClassLevel(e.target.value), setSubject(''), setPage(1))}
            options={[{ label: 'All classes', value: '' }, ...(options.data?.classes ?? []).map((c) => ({ label: c.title, value: String(c.level) }))]}
            className="sm:w-36"
          />
          <Select
            aria-label="Subject"
            value={subject}
            onChange={(e) => (setSubject(e.target.value), setPage(1))}
            options={[{ label: 'All subjects', value: '' }, ...subjectOptions]}
            className="sm:w-40"
          />
          {!isTrash && (
            <>
              <Select
                aria-label="Status"
                value={status}
                onChange={(e) => (setStatus(e.target.value as ManualCourseListQuery['status']), setPage(1))}
                options={[
                  { label: 'Any status', value: 'all' },
                  { label: 'Published', value: 'published' },
                  { label: 'Draft', value: 'draft' },
                ]}
                className="sm:w-36"
              />
              <Select
                aria-label="Visibility"
                value={visibility}
                onChange={(e) => (setVisibility(e.target.value as ManualCourseListQuery['visibility']), setPage(1))}
                options={[
                  { label: 'Any visibility', value: 'all' },
                  { label: 'Visible', value: 'visible' },
                  { label: 'Hidden', value: 'hidden' },
                ]}
                className="sm:w-36"
              />
            </>
          )}
        </div>
      </div>

      {list.isError && !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} subject={isTrash ? 'the trash' : 'manual courses'} />
      ) : list.isLoading ? (
        <div className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-card" aria-busy="true" aria-label="Loading">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchX} title="Nothing matches" description="Try another search or filter." />
        ) : isTrash ? (
          <EmptyState icon={Trash2} title="Trash is empty" description="Deleted manual courses appear here, ready to restore." />
        ) : (
          <EmptyState
            icon={NotebookPen}
            title="No manual courses yet"
            description="Write a course by hand: pick a class and subject, then add chapters, lessons and questions."
            action={
              <Link href="/admin/manual-courses/new" className="btn-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
                <Plus aria-hidden className="h-4 w-4" />
                Add Manual Course
              </Link>
            }
          />
        )
      ) : (
        <div className={cn('overflow-hidden rounded-2xl border border-border bg-surface shadow-card transition-opacity', (list.isFetching || busy) && 'opacity-70')}>
          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[960px] text-left text-sm">
              <thead className="border-b border-border bg-surface-hover/40 text-[11px] font-semibold uppercase tracking-[0.08em] text-subtle">
                <tr>
                  <th scope="col" className="py-3 pl-5 pr-3">
                    Title
                  </th>
                  <th scope="col" className="w-24 px-3 py-3">
                    Class
                  </th>
                  <th scope="col" className="w-32 px-3 py-3">
                    Subject
                  </th>
                  <th scope="col" className="w-20 px-3 py-3 text-right">
                    Chapters
                  </th>
                  <th scope="col" className="w-20 px-3 py-3 text-right">
                    Lessons
                  </th>
                  <th scope="col" className="w-24 px-3 py-3 text-right">
                    Questions
                  </th>
                  {!isTrash && (
                    <>
                      <th scope="col" className="w-28 px-3 py-3">
                        Status
                      </th>
                      <th scope="col" className="w-28 px-3 py-3">
                        Visibility
                      </th>
                    </>
                  )}
                  <th scope="col" className="w-32 px-3 py-3">
                    {isTrash ? 'Deleted' : 'Updated'}
                  </th>
                  <th scope="col" className="w-16 py-3 pl-3 pr-5 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((row) => (
                  <tr key={row.id} className="align-middle transition-colors hover:bg-surface-hover/40">
                    <td className="py-3 pl-5 pr-3">
                      <TitleCell row={row} isTrash={isTrash} />
                    </td>
                    <td className="px-3 py-3 text-foreground-soft">{row.classTitle}</td>
                    <td className="px-3 py-3 text-foreground-soft">{row.subjectTitle}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.counts.chapters}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.counts.lessons}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.counts.questions}</td>
                    {!isTrash && (
                      <>
                        <td className="px-3 py-3">
                          <StatusBadge status={row.status} pending={row.pendingChanges} />
                        </td>
                        <td className="px-3 py-3">
                          <VisibilityBadge visible={row.isVisible} />
                        </td>
                      </>
                    )}
                    <td className="whitespace-nowrap px-3 py-3">
                      <WhenCell iso={isTrash ? row.deletedAt : row.updatedAt} />
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right">
                      <DropdownMenu items={menuFor(row)} triggerLabel={`Actions for ${row.title}`} sheetTitle={row.title} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="divide-y divide-border/70 lg:hidden">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <TitleCell row={row} isTrash={isTrash} />
                    <p className="mt-1 text-xs text-foreground-soft">
                      {row.classTitle} · {row.subjectTitle}
                    </p>
                  </div>
                  <DropdownMenu items={menuFor(row)} triggerLabel={`Actions for ${row.title}`} sheetTitle={row.title} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!isTrash && <StatusBadge status={row.status} pending={row.pendingChanges} />}
                  {!isTrash && <VisibilityBadge visible={row.isVisible} />}
                  <span className="text-xs text-muted">
                    {row.counts.chapters} ch · {row.counts.lessons} lessons · {row.counts.questions} questions
                  </span>
                </div>
                <p className="text-[11px] text-subtle">
                  {isTrash ? 'Deleted' : 'Updated'} {day(isTrash ? row.deletedAt : row.updatedAt)}
                </p>
                {isTrash && (
                  <Button type="button" size="sm" variant="secondary" className="gap-1.5 self-start" disabled={busy} onClick={() => restore.mutate(row)}>
                    <ArchiveRestore aria-hidden className="h-4 w-4" />
                    Restore
                  </Button>
                )}
              </li>
            ))}
          </ul>

          {list.data?.meta && list.data.meta.totalPages > 1 && (
            <div className="border-t border-border px-4 py-3">
              <Pagination meta={list.data.meta} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={pending?.action === 'trash'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && trash.mutate(pending.row)}
        title="Delete this manual course?"
        description="This course will be moved to Trash and can be restored later."
        confirmLabel="Move to Trash"
        isLoading={trash.isPending}
      />
      <ConfirmDialog
        isOpen={pending?.action === 'forever'}
        onClose={() => setPending(null)}
        onConfirm={() => pending && forever.mutate(pending.row)}
        title="Delete permanently?"
        description="This course will be permanently removed and cannot be restored."
        confirmLabel="Delete Permanently"
        isLoading={forever.isPending}
      />
    </div>
  );
}

function TitleCell({ row, isTrash }: { row: ManualCourseRow; isTrash: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <BookOpen className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        {isTrash ? (
          <p className="truncate font-semibold text-foreground">{row.title}</p>
        ) : (
          <Link href={`/admin/manual-courses/${row.id}/edit`} className="block truncate font-semibold text-foreground hover:text-accent">
            {row.title}
          </Link>
        )}
        <p className="text-[11px] uppercase tracking-[0.08em] text-subtle">Manual</p>
      </div>
    </div>
  );
}

const StatusBadge = ({ status, pending }: { status: ManualCourseRow['status']; pending?: boolean }) => (
  <span className="inline-flex flex-wrap items-center gap-1">
    <Badge variant={status === 'published' ? 'success' : 'warning'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
    {pending && <Badge variant="warning">Changes not published</Badge>}
  </span>
);
const VisibilityBadge = ({ visible }: { visible: boolean }) => <Badge variant={visible ? 'accent' : 'default'}>{visible ? 'Visible' : 'Hidden'}</Badge>;

function WhenCell({ iso }: { iso: string | null }) {
  return (
    <>
      <p className="text-xs font-medium text-foreground-soft" title={iso ? new Date(iso).toLocaleString() : undefined}>
        {day(iso)}
      </p>
      {iso && <p className="text-[11px] text-subtle">{formatRelativeTime(iso)}</p>}
    </>
  );
}
