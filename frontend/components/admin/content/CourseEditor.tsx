'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { adminContentApi, type CourseInput, type Difficulty } from '@/lib/api/adminContent';
import { ApiError } from '@/lib/api/client';
import type { Course } from '@/lib/api/content';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/utils/cn';
import { useTaxonomy } from './useTaxonomy';

interface LessonDraft {
  key: string;
  title: string;
  body: string;
  url: string;
}

const fieldClass =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';
let draftId = 0;
const newLesson = (l?: Partial<LessonDraft>): LessonDraft => ({ key: `l${draftId++}`, title: '', body: '', url: '', ...l });

function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

/** Field errors from a 400, keyed by their path ("lessons.0.url"). */
function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  return Object.fromEntries((err.details as Array<{ path?: string; message?: string }>).filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]));
}

/**
 * Create or edit a course: details, publishing switches and an ordered list of lessons. The
 * server validates everything again (lengths, http(s)-only links, unique address) and records the
 * change in the activity log.
 */
export function CourseEditor({ course }: { course?: Course }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(course?.title ?? '');
  const [slug, setSlug] = useState(course?.slug ?? '');
  const [summary, setSummary] = useState(course?.summary ?? '');
  const [classLevel, setClassLevel] = useState(course?.classLevel ? String(course.classLevel) : '');
  const [subject, setSubject] = useState(course?.subject ?? '');
  const [thumbnailUrl, setThumbnailUrl] = useState(course?.thumbnailUrl ?? '');
  const [difficulty, setDifficulty] = useState<string>(course?.difficulty ?? '');
  const [ageGroup, setAgeGroup] = useState(course?.ageGroup ?? '');
  const [learningObjective, setLearningObjective] = useState(course?.learningObjective ?? '');
  // Classes and subjects from the database: a course goes in a class and a subject that class offers.
  const tax = useTaxonomy();
  const subjectOptions = tax.subjectsOffered(classLevel ? Number(classLevel) : null);
  const [isEnabled, setEnabled] = useState(course?.isEnabled ?? true);
  const [isVisible, setVisible] = useState(course?.isVisible ?? true);
  const [lessons, setLessons] = useState<LessonDraft[]>(() => (course?.lessons ?? []).map((l) => newLesson({ title: l.title, body: l.body, url: l.url ?? '' })));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateLesson = (key: string, patch: Partial<LessonDraft>) => setLessons((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const moveLesson = (index: number, delta: -1 | 1) =>
    setLessons((ls) => {
      const next = [...ls];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item!);
      return next;
    });

  const save = useMutation({
    mutationFn: () => {
      const input: CourseInput = {
        title: title.trim(),
        summary: summary.trim(),
        classLevel: Number(classLevel),
        subject,
        thumbnailUrl: thumbnailUrl.trim() || null,
        difficulty: (difficulty || null) as Difficulty | null,
        ageGroup: ageGroup.trim() || null,
        learningObjective: learningObjective.trim(),
        lessons: lessons.map((l) => ({ title: l.title.trim(), body: l.body, url: l.url.trim() || null })),
        isEnabled,
        isVisible,
        ...(slug.trim() ? { slug: slug.trim().toLowerCase() } : {}),
      };
      return course ? adminContentApi.updateCourse(course.id, input) : adminContentApi.createCourse(input);
    },
    onSuccess: (res) => {
      toast.success(course ? 'Course saved' : 'Course created');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: ['content', 'courses'] });
      if (!course) router.replace(`/admin/content/courses/${res.data.id}`);
      else setSlug(res.data.slug);
    },
    onError: (err: Error) => {
      setErrors(err instanceof ApiError && err.status === 409 ? { slug: err.message } : fieldErrors(err));
      toast.error(err.message);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = 'Title is required';
    if (!classLevel) found.classLevel = 'Choose a class';
    if (!subject) found.subject = 'Choose a subject this class offers';
    if (thumbnailUrl.trim() && !/^https?:\/\/\S+$/i.test(thumbnailUrl.trim())) found.thumbnailUrl = 'Links must start with http:// or https://';
    if (slug.trim() && !/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug.trim().toLowerCase())) found.slug = 'Lowercase letters, numbers and hyphens only';
    lessons.forEach((l, i) => {
      if (!l.title.trim()) found[`lessons.${i}.title`] = 'Every lesson needs a title';
      if (l.url.trim() && !/^https?:\/\/\S+$/i.test(l.url.trim())) found[`lessons.${i}.url`] = 'Links must start with http:// or https://';
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-6">
      <Link href="/admin/content/courses" className="inline-flex w-fit items-center gap-1.5 rounded-lg px-1 text-sm font-medium text-muted transition hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        All courses
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent-2">Content · Courses</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{course ? 'Edit course' : 'New course'}</h1>
        </div>
        <div className="flex gap-2">
          {course && course.isEnabled && !course.archivedAt && (
            <a href={`/courses/${course.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-medium text-foreground-soft transition hover:bg-surface-hover">
              <ExternalLink className="h-4 w-4" />
              View
            </a>
          )}
          <Button type="submit" isLoading={save.isPending} disabled={Boolean(course?.archivedAt)}>
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </div>
      </div>
      {course?.archivedAt && (
        <p className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">This course is archived. Restore it from the course list to edit it.</p>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 xl:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Details</h2>
          <div>
            <label htmlFor="course-title" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Title</label>
            <input id="course-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={fieldClass} aria-invalid={Boolean(errors.title)} />
            <FieldError message={errors.title} />
          </div>
          <div>
            <label htmlFor="course-slug" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Address</label>
            <div className="flex items-center rounded-xl border border-border bg-surface-elevated focus-within:border-accent">
              <span className="pl-3.5 text-sm text-subtle">/courses/</span>
              <input id="course-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="made-from-the-title" className="min-w-0 flex-1 bg-transparent px-1 py-2.5 font-mono text-sm text-foreground outline-none placeholder:text-muted/60" aria-invalid={Boolean(errors.slug)} />
            </div>
            <FieldError message={errors.slug} />
          </div>
          <div>
            <label htmlFor="course-summary" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Summary</label>
            <textarea id="course-summary" value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={500} rows={3} className={cn(fieldClass, 'resize-y')} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="course-class" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Class</label>
              <select
                id="course-class"
                value={classLevel}
                onChange={(e) => {
                  setClassLevel(e.target.value);
                  if (!tax.subjectsOffered(Number(e.target.value)).some((s) => s.key === subject)) setSubject('');
                }}
                className={fieldClass}
                aria-invalid={Boolean(errors.classLevel)}
              >
                <option value="">Choose…</option>
                {tax.classes.map((c) => (
                  <option key={c.id} value={c.classLevel ?? ''}>{c.title}</option>
                ))}
              </select>
              <FieldError message={errors.classLevel} />
            </div>
            <div>
              <label htmlFor="course-subject" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Subject</label>
              <select id="course-subject" value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!classLevel} className={fieldClass} aria-invalid={Boolean(errors.subject)}>
                <option value="">Choose…</option>
                {subjectOptions.map((s) => (
                  <option key={s.id} value={s.key}>{s.title}</option>
                ))}
              </select>
              {classLevel && subjectOptions.length === 0 && <p className="mt-1 text-[11px] text-subtle">This class offers no subjects yet — assign one on the Subjects page.</p>}
              <FieldError message={errors.subject} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="course-difficulty" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Difficulty</label>
              <select id="course-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={fieldClass}>
                <option value="">Not set</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div>
              <label htmlFor="course-age" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Age group (optional)</label>
              <input id="course-age" value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} maxLength={40} placeholder="e.g. 6–8 years" className={fieldClass} />
            </div>
          </div>
          <div>
            <label htmlFor="course-objective" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Learning objective</label>
            <textarea id="course-objective" value={learningObjective} onChange={(e) => setLearningObjective(e.target.value)} maxLength={1000} rows={2} placeholder="What a learner can do after this course" className={cn(fieldClass, 'resize-y')} />
          </div>
          <div>
            <label htmlFor="course-thumb" className="mb-1.5 block text-[13px] font-medium text-foreground-soft">Thumbnail link (optional)</label>
            <input id="course-thumb" value={thumbnailUrl} onChange={(e) => setThumbnailUrl(e.target.value)} placeholder="https://…" className={fieldClass} aria-invalid={Boolean(errors.thumbnailUrl)} />
            <FieldError message={errors.thumbnailUrl} />
          </div>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-foreground">Publishing</h2>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">Enabled</span>
              <span className="block text-xs text-muted">Off: the course can&apos;t be opened at all.</span>
            </span>
            <Toggle checked={isEnabled} onChange={setEnabled} label="Course enabled" />
          </label>
          <label className="flex items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-medium text-foreground">Visible</span>
              <span className="block text-xs text-muted">Off: left out of /courses, but opens from its link.</span>
            </span>
            <Toggle checked={isVisible} onChange={setVisible} label="Course visible" />
          </label>
        </section>
      </div>

      <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-foreground">
            Lessons <span className="font-normal text-subtle">({lessons.length}/50)</span>
          </h2>
          <Button type="button" variant="secondary" size="sm" onClick={() => setLessons((ls) => [...ls, newLesson()])} disabled={lessons.length >= 50}>
            <Plus className="h-3.5 w-3.5" />
            Add lesson
          </Button>
        </div>
        {lessons.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">No lessons yet. Add the first one.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {lessons.map((lesson, i) => (
              <li key={lesson.key} className="rounded-xl border border-border bg-surface-elevated/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-accent">Lesson {i + 1}</span>
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => moveLesson(i, -1)} disabled={i === 0} aria-label={`Move lesson ${i + 1} up`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover disabled:opacity-30">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => moveLesson(i, 1)} disabled={i === lessons.length - 1} aria-label={`Move lesson ${i + 1} down`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover disabled:opacity-30">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => setLessons((ls) => ls.filter((l) => l.key !== lesson.key))} aria-label={`Remove lesson ${i + 1}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-danger/10 hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex flex-col gap-3">
                  <div>
                    <input value={lesson.title} onChange={(e) => updateLesson(lesson.key, { title: e.target.value })} placeholder="Lesson title" maxLength={120} aria-label={`Lesson ${i + 1} title`} className={fieldClass} aria-invalid={Boolean(errors[`lessons.${i}.title`])} />
                    <FieldError message={errors[`lessons.${i}.title`]} />
                  </div>
                  <textarea value={lesson.body} onChange={(e) => updateLesson(lesson.key, { body: e.target.value })} placeholder="What the lesson teaches (plain text)" maxLength={10_000} rows={4} aria-label={`Lesson ${i + 1} text`} className={cn(fieldClass, 'resize-y')} />
                  <div>
                    <input value={lesson.url} onChange={(e) => updateLesson(lesson.key, { url: e.target.value })} placeholder="Optional link (https://…)" aria-label={`Lesson ${i + 1} link`} className={fieldClass} aria-invalid={Boolean(errors[`lessons.${i}.url`])} />
                    <FieldError message={errors[`lessons.${i}.url`]} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </form>
  );
}
