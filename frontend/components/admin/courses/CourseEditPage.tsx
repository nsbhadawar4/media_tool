'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Eye, EyeOff, ExternalLink, Loader2, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { ADMIN_CLASSES_KEY } from '@/lib/api/adminClasses';
import { COURSE_KEY, courseAdminApi, type AdminCourse, type CourseBrief, type CourseOutline } from '@/lib/api/courses';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CourseEditor, courseProblems, toDraftChapter, toDraftLesson, toDraftQuestion, toSaveChapters, type DraftCourse } from './CourseEditor';
import { sourceLabel } from './CourseGenerator';

/**
 * /admin/courses/N/<subject> — one course (a subject of a class) in the course editor: every
 * chapter, lesson, question and answer, each chapter's status (draft / published / hidden),
 * regeneration of a single chapter, lesson or set of questions, and publishing the course (its
 * drafts) or hiding it. Saving updates chapters in place; chapters removed here are archived.
 */
export function CourseEditPage({ level, subject }: { level: number; subject: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: COURSE_KEY(level, subject), queryFn: async () => (await courseAdminApi.get(level, subject)).data });
  const engine = useQuery({ queryKey: ['admin', 'courses', 'engine'], queryFn: async () => (await courseAdminApi.engine()).data, staleTime: 60_000 });
  // The course as saved is the baseline; `edits` holds the administrator's changes until they save.
  const saved = useMemo<DraftCourse | null>(
    () => (query.data ? { title: query.data.course.title, description: query.data.course.description, objectives: query.data.course.objectives, chapters: query.data.chapters.map((c) => toDraftChapter(c)) } : null),
    [query.data],
  );
  const [edits, setEdits] = useState<DraftCourse | null>(null);
  const draft = edits ?? saved;
  const dirty = edits !== null;
  const [confirm, setConfirm] = useState<'unpublish' | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const stop = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', stop);
    return () => window.removeEventListener('beforeunload', stop);
  }, [dirty]);

  const refresh = (data: AdminCourse) => {
    queryClient.setQueryData(COURSE_KEY(level, subject), data);
    setEdits(null);
    void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
    void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
  };
  const fail = (err: unknown) => toast.error(err instanceof Error ? err.message : 'Something went wrong');

  const save = useMutation({
    mutationFn: async () =>
      courseAdminApi.save(level, subject, {
        mode: 'edit',
        course: { title: draft!.title.trim(), description: draft!.description.trim(), objectives: draft!.objectives.map((o) => o.trim()).filter(Boolean), language: query.data!.course.language, level: query.data!.course.level },
        chapters: toSaveChapters(draft!.chapters, true),
      }),
    onSuccess: (res) => {
      refresh(res.data);
      toast.success('Course saved');
    },
    onError: fail,
  });
  const publish = useMutation({
    mutationFn: async () => {
      if (dirty) await save.mutateAsync();
      return courseAdminApi.publish(level, subject);
    },
    onSuccess: (res) => {
      refresh(res.data);
      toast.success('Course published');
    },
    onError: fail,
  });
  const unpublish = useMutation({
    mutationFn: () => courseAdminApi.unpublish(level, subject),
    onSuccess: (res) => {
      refresh(res.data);
      setConfirm(null);
      toast.success('Course hidden');
    },
    onError: fail,
  });

  // Regenerating one part uses the course's own settings and the content as it stands.
  const brief = useMemo<CourseBrief | null>(() => {
    if (!query.data || !draft) return null;
    const d = query.data;
    return {
      classLevel: level,
      subject: { key: subject, title: d.subject.title },
      title: draft.title || d.subject.title,
      description: draft.description,
      language: d.course.language ?? (subject === 'hindi' ? 'hindi' : 'english'),
      level: d.course.level ?? 'beginner',
      chapters: Math.max(1, Math.min(12, draft.chapters.length)),
      lessonsPerChapter: 3,
      questionsPerLesson: 5,
      prompt: '',
      goals: '',
      include: '',
      avoid: '',
      instructions: '',
    };
  }, [query.data, draft, level, subject]);
  const eng = engine.data?.defaultEngine ?? 'template';
  const regenerate =
    brief && draft
      ? {
          chapter: async (i: number) => {
            const chapters = draft.chapters.slice(0, 12).map((c) => ({ title: c.title, description: c.description || c.title, lessonTitles: (c.lessons.length ? c.lessons.map((l) => l.title) : ['Lesson 1', 'Lesson 2', 'Lesson 3']).slice(0, 8) }));
            const plan: CourseOutline = { title: draft.title, description: draft.description, objectives: draft.objectives, chapters };
            const res = await courseAdminApi.chapter({ ...brief, chapters: chapters.length }, eng, plan, Math.min(i, chapters.length - 1), String(Date.now()));
            return toDraftChapter(res.data.chapter);
          },
          lesson: async (ci: number, li: number) => {
            const c = draft.chapters[ci]!;
            const res = await courseAdminApi.lesson(brief, eng, { title: c.title, description: c.description || c.title, lessonTitles: c.lessons.slice(0, 8).map((l) => l.title) }, Math.min(li, 7), String(Date.now()));
            return toDraftLesson(res.data.lesson);
          },
          questions: async (ci: number, li: number, count: number) => {
            const c = draft.chapters[ci]!;
            const l = c.lessons[li]!;
            const res = await courseAdminApi.questions(brief, eng, c.title, Math.min(li, 7), { title: l.title, explanation: l.explanation }, Math.min(15, count), String(Date.now()));
            return res.data.questions.map(toDraftQuestion);
          },
        }
      : undefined;

  if (query.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted" role="status">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
        <span className="sr-only">Loading the course…</span>
      </div>
    );
  }
  if (query.isError || !query.data || !draft) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">Unable to load this course</p>
        <p className="mt-1 text-sm text-muted">{query.error instanceof Error ? query.error.message : ''}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/admin/courses" className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground">
            Manage Courses
          </Link>
          <Button className="gap-2" onClick={() => void query.refetch()}>
            <RefreshCw aria-hidden className="h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const d = query.data;
  const problems = courseProblems(draft);
  const generateHref = `/admin/courses/generate?class=${level}&subject=${encodeURIComponent(subject)}`;
  const live = d.class.status === 'published' && d.class.isVisible && d.isVisible && d.counts.published > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href={`/admin/courses/${level}`} className="group mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            {d.class.title}
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">
            {d.class.title} · {d.subject.title}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{draft.title || d.subject.title}</h1>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
            <span>{d.isVisible ? 'Shown in the class' : 'Hidden in the class'}</span>
            <span>
              {d.counts.published} published · {d.counts.drafts} draft · {d.counts.hidden} hidden
            </span>
            <span>{sourceLabel(d.course.source)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={generateHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
            <Sparkles aria-hidden className="h-4 w-4 text-accent" />
            Generate Course Content
          </Link>
          {live && (
            <a href={`/classes/${d.class.slug}/${subject}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
              <ExternalLink aria-hidden className="h-4 w-4" />
              View
            </a>
          )}
          {d.isVisible ? (
            <Button variant="secondary" className="gap-1.5" onClick={() => setConfirm('unpublish')}>
              <EyeOff aria-hidden className="h-4 w-4" />
              Unpublish
            </Button>
          ) : null}
        </div>
      </div>

      {draft.chapters.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border px-6 py-10 text-center">
          <BookOpen aria-hidden className="mx-auto h-8 w-8 text-muted" />
          <p className="mt-3 font-semibold text-foreground">No curriculum content available yet.</p>
          <p className="mt-1 text-sm text-muted">Generate the {d.subject.title} course for {d.class.title}, or add chapters by hand below.</p>
          <Link href={generateHref} className="btn-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold text-accent-foreground">
            <Sparkles aria-hidden className="h-4 w-4" />
            Generate Content
          </Link>
        </div>
      ) : null}

      <CourseEditor
        value={draft}
        onChange={setEdits}
        regenerate={regenerate}
        statusEditable
        newChapterStatus="draft"
      />

      {problems.length > 0 && (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          <p className="font-semibold">Fix before saving:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.slice(0, 6).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
        <Button type="button" variant="ghost" disabled={!dirty || save.isPending} onClick={() => setEdits(null)}>
          Discard changes
        </Button>
        <Button type="button" variant="secondary" className="gap-1.5" disabled={!dirty || problems.length > 0} isLoading={save.isPending && !publish.isPending} onClick={() => save.mutate()}>
          <Save aria-hidden className="h-4 w-4" />
          Save Changes
        </Button>
        <Button type="button" className="gap-1.5" disabled={problems.length > 0 || draft.chapters.length === 0} isLoading={publish.isPending} onClick={() => publish.mutate()}>
          {d.isVisible && d.counts.drafts === 0 && !dirty ? <Eye aria-hidden className="h-4 w-4" /> : <Send aria-hidden className="h-4 w-4" />}
          {d.counts.drafts > 0 ? `Publish (${d.counts.drafts} draft${d.counts.drafts === 1 ? '' : 's'})` : 'Publish'}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={confirm === 'unpublish'}
        onClose={() => setConfirm(null)}
        onConfirm={() => unpublish.mutate()}
        isLoading={unpublish.isPending}
        title="Unpublish this course?"
        description={`${d.subject.title} disappears from ${d.class.title} on the website, /classes, the dashboard and Courses. Its chapters stay here; publish again to bring it back.`}
        confirmLabel="Unpublish"
        isDangerous={false}
      />
    </div>
  );
}
