'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ClipboardPaste, Copy, Eye, FileClock, NotebookPen, Plus, Save, Send, Undo2 } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import { MANUAL_COURSES_KEY, manualCoursesApi, type ManualChapter, type ManualCourse, type ManualCourseDraft, type ManualStatus } from '@/lib/api/manualCourses';
import { STEPS, countsOf, emptyChapter, emptyDraft, pasted, publishErrors, saveErrors, serverErrors, stepsDone, type FieldErrors } from '@/lib/manualCourses/builder';
import { useManualClipboard } from '@/lib/manualCourses/useManualClipboard';
import { useToast } from '@/lib/toast/ToastContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/utils/cn';
import { ManualContentEditor } from './ManualContentEditor';

export const manualCourseKey = (id: string) => [...MANUAL_COURSES_KEY, 'course', id] as const;

/**
 * /admin/manual-courses/new and /admin/manual-courses/[id]/edit — the Manual Course builder. Loads the
 * course (when editing), then hands it to the form; the form is keyed by course so a newly created
 * course opens on its edit page without a reload of what was just typed.
 */
export function ManualCourseBuilder({ id }: { id?: string }) {
  const course = useQuery({
    queryKey: manualCourseKey(id ?? 'new'),
    queryFn: async ({ signal }) => (await manualCoursesApi.get(id!, signal)).data,
    enabled: Boolean(id),
    // The builder owns the draft once loaded: a background refetch must not replace what is being typed.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (id && course.isError) return <ErrorState error={course.error} onRetry={() => void course.refetch()} subject="this course" />;
  if (id && !course.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-16 w-2/3 rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }
  if (course.data?.deletedAt) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">This course is in Trash.</p>
        <p className="mt-1 text-sm text-muted">Restore it from Manual Courses → Trash to edit it.</p>
        <Link href="/admin/manual-courses/trash" className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-border px-4 text-sm font-medium hover:bg-surface-hover">
          Open Trash
        </Link>
      </div>
    );
  }
  return <BuilderForm key={id ?? 'new'} initial={course.data ?? null} />;
}

type Action = 'draft' | 'save' | 'publish' | 'unpublish' | 'preview';
interface Meta {
  id: string;
  revision: number;
  status: ManualStatus;
  /** Published, with saved edits learners don't see until the next Publish. */
  pending: boolean;
}

const toDraft = (c: ManualCourse): ManualCourseDraft => ({
  classLevel: c.classLevel,
  subjectKey: c.subjectKey,
  title: c.title,
  description: c.description,
  isVisible: c.isVisible,
  chapters: c.chapters,
});

/** The parts that hold errors (by path), so they can be opened. */
function uidsWithErrors(chapters: ManualChapter[], errors: FieldErrors): string[] {
  const uids = new Set<string>();
  for (const path of Object.keys(errors)) {
    const m = /^chapters\.(\d+)(?:\.lessons\.(\d+)(?:\.questions\.(\d+))?)?/.exec(path);
    if (!m) continue;
    const c = chapters[Number(m[1])];
    if (!c) continue;
    uids.add(c.uid);
    const l = m[2] !== undefined ? c.lessons[Number(m[2])] : undefined;
    if (l) uids.add(l.uid);
    const q = l && m[3] !== undefined ? l.questions[Number(m[3])] : undefined;
    if (q) uids.add(q.uid);
  }
  return [...uids];
}

function BuilderForm({ initial }: { initial: ManualCourse | null }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { clip, copy } = useManualClipboard();
  const [draft, setDraft] = useState<ManualCourseDraft>(() => (initial ? toDraft(initial) : emptyDraft()));
  const [meta, setMeta] = useState<Meta | null>(initial ? { id: initial.id, revision: initial.revision, status: initial.status, pending: initial.pendingChanges } : null);
  const [dirty, setDirty] = useState(false);
  const [errorMode, setErrorMode] = useState<'save' | 'publish' | null>(null);
  const [serverErr, setServerErr] = useState<FieldErrors>({});
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<{ what: string; run: () => void } | null>(null);
  const [open, setOpenSet] = useState<Set<string>>(() => new Set(initial?.chapters[0] ? [initial.chapters[0].uid] : []));
  // What the latest edit produced, read by a save when it finishes (was anything typed meanwhile?).
  const latest = useRef(draft);
  const submitting = useRef(false);

  const options = useQuery({ queryKey: [...MANUAL_COURSES_KEY, 'options'], queryFn: async ({ signal }) => (await manualCoursesApi.options(signal)).data });

  const errors = useMemo<FieldErrors>(() => {
    const live = errorMode === 'publish' ? publishErrors(draft) : errorMode === 'save' ? saveErrors(draft) : {};
    return { ...serverErr, ...live };
  }, [draft, errorMode, serverErr]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const change = (next: ManualCourseDraft) => {
    latest.current = next;
    setDraft(next);
    setDirty(true);
    setServerErr({});
  };
  const set = <K extends keyof ManualCourseDraft>(key: K, value: ManualCourseDraft[K]) => change({ ...draft, [key]: value });
  const setOpen = (uid: string, isOpen: boolean) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(uid);
      else next.delete(uid);
      return next;
    });
  const openAll = (uids: string[]) => setOpenSet((prev) => new Set([...prev, ...uids]));

  const classes = useMemo(() => {
    const list = options.data?.classes ?? [];
    // A course whose class is no longer offered still shows it (the server says what is wrong on save).
    if (initial && !list.some((c) => c.level === initial.classLevel))
      return [...list, { level: initial.classLevel, title: initial.classTitle, subjects: [{ key: initial.subjectKey, title: initial.subjectTitle }] }];
    return list;
  }, [options.data, initial]);
  const subjects = classes.find((c) => c.level === draft.classLevel)?.subjects ?? [];

  const fail = (local: FieldErrors, mode: 'save' | 'publish') => {
    setErrorMode(mode);
    openAll(uidsWithErrors(draft.chapters, local));
    toast.error(mode === 'publish' ? 'Fix the highlighted fields before publishing.' : 'Fill in the highlighted fields.');
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  async function submit(action: Action) {
    if (submitting.current) return; // no double submits
    const mode = action === 'publish' ? 'publish' : 'save';
    const local = mode === 'publish' ? publishErrors(draft) : saveErrors(draft);
    if (Object.keys(local).length) return fail(local, mode);
    submitting.current = true;
    setBusy(action);
    const snapshot = draft;
    let current = meta;
    try {
      let saved: ManualCourse | null = null;
      if (!current) {
        saved = (await manualCoursesApi.create({ ...snapshot, status: action === 'publish' ? 'published' : 'draft' })).data;
      } else {
        if (dirty) {
          saved = (await manualCoursesApi.update(current.id, { ...snapshot, revision: current.revision })).data;
          current = { id: saved.id, revision: saved.revision, status: saved.status, pending: saved.pendingChanges };
          setMeta(current);
        }
        // Publish makes the saved working copy the one learners see (also for an already-published course).
        if (action === 'publish' && (current.status !== 'published' || current.pending)) saved = (await manualCoursesApi.publish(current.id)).data;
        if (action === 'unpublish' && current.status === 'published') saved = (await manualCoursesApi.unpublish(current.id)).data;
      }
      if (saved) {
        setMeta({ id: saved.id, revision: saved.revision, status: saved.status, pending: saved.pendingChanges });
        queryClient.setQueryData(manualCourseKey(saved.id), saved);
      }
      if (latest.current === snapshot) setDirty(false);
      setErrorMode(null);
      void queryClient.invalidateQueries({ queryKey: MANUAL_COURSES_KEY, predicate: (q) => q.queryKey[2] !== 'course' });
      const stillLive = saved?.status === 'published' && saved.pendingChanges;
      toast.success(
        action === 'publish'
          ? 'Course saved successfully. It is now published.'
          : action === 'unpublish'
            ? 'Course saved successfully. It is a draft again.'
            : stillLive
              ? 'Course saved successfully. Learners see the published version until you publish these changes.'
              : 'Course saved successfully.',
      );
      const id = saved?.id ?? current?.id;
      if (action === 'preview' && id) router.push(`/admin/manual-courses/${id}/preview`);
      else if (!meta && id) router.replace(`/admin/manual-courses/${id}/edit`);
    } catch (err) {
      const details = err instanceof ApiError ? serverErrors(err.details) : {};
      setServerErr(details);
      openAll(uidsWithErrors(snapshot.chapters, details));
      toast.error(err instanceof ApiError && err.status === 409 ? err.message : 'Unable to save course. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(null);
    }
  }

  const addChapter = () => {
    const c = emptyChapter();
    change({ ...draft, chapters: [...draft.chapters, c] });
    openAll([c.uid, c.lessons[0]!.uid]);
  };
  const copyCourse = () => {
    copy({ kind: 'course', title: draft.title || 'Untitled course', data: { title: draft.title, description: draft.description, chapters: draft.chapters } });
    toast.success('Course copied');
  };
  const pasteCourse = () => {
    if (clip?.kind !== 'course') return;
    const c = pasted(clip);
    change({ ...draft, title: draft.title || c.title, description: draft.description || c.description, chapters: [...draft.chapters, ...c.chapters] });
    openAll(c.chapters.slice(0, 1).map((x) => x.uid));
    toast.success('Content pasted successfully');
  };

  const counts = countsOf(draft.chapters);
  const done = stepsDone(draft, Boolean(meta) && !dirty);
  const status: ManualStatus = meta?.status ?? 'draft';
  const anyBusy = busy !== null;
  const back = (e: React.MouseEvent) => {
    if (dirty && !window.confirm('You have unsaved changes. Leave without saving?')) e.preventDefault();
  };

  const pending = Boolean(meta?.pending) || (status === 'published' && dirty);
  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => void submit(meta ? 'save' : 'draft')}
        disabled={anyBusy || (Boolean(meta) && !dirty)}
        isLoading={busy === 'draft' || busy === 'save'}
        className="gap-1.5"
      >
        {meta ? <Save aria-hidden className="h-4 w-4" /> : <FileClock aria-hidden className="h-4 w-4" />}
        Save Draft
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => (dirty || !meta ? void submit('preview') : router.push(`/admin/manual-courses/${meta.id}/preview`))}
        disabled={anyBusy}
        isLoading={busy === 'preview'}
        className="gap-1.5"
        title={dirty || !meta ? 'Saves the draft, then opens its preview' : undefined}
      >
        <Eye aria-hidden className="h-4 w-4" />
        Preview
      </Button>
      {status === 'published' && (
        <Button type="button" variant="ghost" onClick={() => void submit('unpublish')} disabled={anyBusy} isLoading={busy === 'unpublish'} className="gap-1.5">
          <Undo2 aria-hidden className="h-4 w-4" />
          Unpublish
        </Button>
      )}
      {(status !== 'published' || pending) && (
        <Button type="button" onClick={() => void submit('publish')} disabled={anyBusy} isLoading={busy === 'publish'} className="gap-1.5">
          <Send aria-hidden className="h-4 w-4" />
          {status === 'published' ? 'Publish Changes' : 'Publish'}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 pb-6">
      <Link href="/admin/manual-courses" onClick={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Manual Courses
      </Link>
      <PageHeader
        icon={NotebookPen}
        title={meta ? 'Edit manual course' : 'Add manual course'}
        description="Write a course by hand: course info, then chapters, lessons and questions. Drafts can be incomplete; publishing needs at least one chapter with a lesson."
        eyebrow={
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge variant={status === 'published' ? 'success' : 'warning'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
            <Badge variant={draft.isVisible ? 'accent' : 'default'}>{draft.isVisible ? 'Visible' : 'Hidden'}</Badge>
            {dirty ? <Badge variant="warning">Unsaved Changes</Badge> : meta ? <Badge variant="success">Saved</Badge> : null}
            {!dirty && meta?.pending && <Badge variant="warning">Changes not published</Badge>}
          </span>
        }
        actions={actions}
      />

      <ol aria-label="Progress" className="flex gap-2 overflow-x-auto pb-1">
        {STEPS.map((step, i) => (
          <li
            key={step}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              done[i] ? 'border-success/40 bg-success/10 text-success' : 'border-border bg-surface text-muted',
            )}
          >
            <span aria-hidden className={cn('flex h-5 w-5 items-center justify-center rounded-full text-[10px]', done[i] ? 'bg-success text-white' : 'bg-surface-hover')}>
              {done[i] ? <Check className="h-3 w-3" /> : i + 1}
            </span>
            {step}
            <span className="sr-only">{done[i] ? '(done)' : '(to do)'}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section id="course-info" aria-labelledby="course-info-title" className="rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-6">
            <h2 id="course-info-title" className="text-base font-semibold text-foreground">
              Course info
            </h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="classLevel" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
                  Class <span className="text-danger">*</span>
                </label>
                <div className="grid">
                  <Select
                    aria-label="Class"
                    id="classLevel"
                    value={draft.classLevel ? String(draft.classLevel) : ''}
                    onChange={(e) => {
                      const level = e.target.value ? Number(e.target.value) : null;
                      const offered = classes.find((c) => c.level === level)?.subjects ?? [];
                      change({ ...draft, classLevel: level, subjectKey: offered.some((s) => s.key === draft.subjectKey) ? draft.subjectKey : '' });
                    }}
                    options={[{ label: options.isLoading ? 'Loading classes…' : 'Choose a class', value: '' }, ...classes.map((c) => ({ label: c.title, value: String(c.level) }))]}
                    className="h-[42px] w-full"
                    aria-invalid={errors.classLevel ? true : undefined}
                    aria-describedby={errors.classLevel ? 'classLevel-error' : undefined}
                  />
                </div>
                {errors.classLevel && <FieldError id="classLevel-error">{errors.classLevel}</FieldError>}
              </div>
              <div>
                <label htmlFor="subjectKey" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
                  Subject <span className="text-danger">*</span>
                </label>
                <div className="grid">
                  <Select
                    aria-label="Subject"
                    id="subjectKey"
                    value={draft.subjectKey}
                    disabled={!draft.classLevel}
                    onChange={(e) => set('subjectKey', e.target.value)}
                    options={[
                      { label: draft.classLevel ? (subjects.length ? 'Choose a subject' : 'This class has no subjects yet') : 'Choose a class first', value: '' },
                      ...subjects.map((s) => ({ label: s.title, value: s.key })),
                    ]}
                    className="h-[42px] w-full"
                    aria-invalid={errors.subjectKey ? true : undefined}
                    aria-describedby={errors.subjectKey ? 'subjectKey-error' : undefined}
                  />
                </div>
                {errors.subjectKey && <FieldError id="subjectKey-error">{errors.subjectKey}</FieldError>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="title" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
                  Course title <span className="text-danger">*</span>
                </label>
                <Input
                  id="title"
                  value={draft.title}
                  maxLength={160}
                  placeholder="e.g. Hindi Varnamala for Class 1"
                  onChange={(e) => set('title', e.target.value)}
                  aria-invalid={errors.title ? true : undefined}
                  aria-describedby={errors.title ? 'title-error' : undefined}
                />
                {errors.title && <FieldError id="title-error">{errors.title}</FieldError>}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="description" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
                  Description (optional)
                </label>
                <Textarea
                  id="description"
                  rows={3}
                  maxLength={2000}
                  value={draft.description}
                  placeholder="What learners will get from this course"
                  onChange={(e) => set('description', e.target.value)}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Status</p>
                  <p className="text-xs text-muted">
                    {status === 'published'
                      ? pending
                        ? 'Published — learners see the last published version until you publish your changes.'
                        : 'Published — learners can open it.'
                      : 'Draft — only admins see it.'}
                  </p>
                </div>
                <Badge variant={status === 'published' ? 'success' : 'warning'}>{status === 'published' ? 'Published' : 'Draft'}</Badge>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-elevated px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Visibility</p>
                  <p className="text-xs text-muted">{draft.isVisible ? 'Visible — shown when published.' : 'Hidden — not shown to learners.'}</p>
                </div>
                <Toggle checked={draft.isVisible} onChange={(v) => set('isVisible', v)} label="Visible to learners" />
              </div>
            </div>
          </section>

          <section id="course-content" aria-labelledby="course-content-title" className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="course-content-title" className="text-base font-semibold text-foreground">
                  Chapters, lessons & questions
                </h2>
                <p className="text-xs text-muted">
                  {counts.chapters} {counts.chapters === 1 ? 'chapter' : 'chapters'} · {counts.lessons} {counts.lessons === 1 ? 'lesson' : 'lessons'} · {counts.questions}{' '}
                  {counts.questions === 1 ? 'question' : 'questions'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={copyCourse} className="gap-1.5">
                  <Copy aria-hidden className="h-4 w-4" />
                  Copy course
                </Button>
                {clip?.kind === 'course' && (
                  <Button type="button" size="sm" variant="secondary" onClick={pasteCourse} className="gap-1.5">
                    <ClipboardPaste aria-hidden className="h-4 w-4" />
                    Paste course “{clip.title}”
                  </Button>
                )}
              </div>
            </div>
            {errors.chapters && <FieldError id="chapters-error">{errors.chapters}</FieldError>}
            {draft.chapters.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-10 text-center">
                <p className="font-semibold text-foreground">No chapters yet</p>
                <p className="mt-1 text-sm text-muted">Add the first chapter — it comes with an empty lesson to fill in.</p>
              </div>
            )}
            <ManualContentEditor
              chapters={draft.chapters}
              onChange={(chapters) => set('chapters', chapters)}
              errors={errors}
              open={open}
              setOpen={setOpen}
              clip={clip}
              copy={copy}
              confirmDelete={(what, run) => setConfirm({ what, run })}
              notify={(m) => toast.success(m)}
            />
            <button
              type="button"
              onClick={addChapter}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-4 text-sm font-semibold text-foreground-soft transition-colors hover:border-accent hover:text-accent"
            >
              <Plus aria-hidden className="h-4 w-4" />
              Add chapter
            </button>
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:h-fit">
          <div id="course-actions" className="rounded-2xl border border-border bg-surface p-4 shadow-card">
            <p className="text-sm font-semibold text-foreground">Summary</p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              {(['chapters', 'lessons', 'questions'] as const).map((k) => (
                <div key={k} className="rounded-xl bg-surface-hover/60 px-2 py-2.5">
                  <dt className="text-[11px] capitalize text-muted">{k}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-foreground">{counts[k]}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4">{actions}</div>
            <p className="mt-3 text-xs text-muted">{dirty ? 'You have unsaved changes.' : !meta ? 'Not saved yet.' : meta.pending ? 'Saved as a draft — not published yet.' : 'All changes saved.'}</p>
          </div>
          {clip && (
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-4 text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-accent">
                <ClipboardPaste aria-hidden className="h-4 w-4" />
                Clipboard
              </p>
              <p className="mt-1 text-foreground-soft">
                A {clip.kind}: “{clip.title}”. Paste it from the{' '}
                {clip.kind === 'course'
                  ? 'content header'
                  : clip.kind === 'chapter'
                    ? 'chapter list or a chapter’s menu'
                    : clip.kind === 'lesson'
                      ? 'lesson list of any chapter'
                      : 'questions of any lesson'}
                .
              </p>
            </div>
          )}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          confirm?.run();
          setConfirm(null);
        }}
        title="Delete this part?"
        description={confirm ? `${confirm.what} will be removed from this course. Nothing is saved until you save the course.` : ''}
        confirmLabel="Delete"
      />
    </div>
  );
}

function FieldError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-medium text-danger">
      {children}
    </p>
  );
}
