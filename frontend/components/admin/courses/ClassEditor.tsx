'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, RefreshCw, Wand2, X } from 'lucide-react';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { ADMIN_CLASSES_KEY, adminClassesApi, type AdminClass, type ClassInput } from '@/lib/api/adminClasses';
import { adminContentApi } from '@/lib/api/adminContent';
import { ApiError } from '@/lib/api/client';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { cn } from '@/utils/cn';

const field =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';

/** A subject offered by this class. Only existing subjects are picked here (new ones are made in Content → Subjects). */
interface SubjectPick {
  key: string;
  title: string;
  /** This class's own description of it — kept exactly as saved (empty: the shared description is shown). */
  classDescription: string;
  /** Kept as saved: a subject hidden in this class stays hidden. */
  isVisible: boolean;
  /** Chapters already written for it in this class (saved classes only). */
  chapters: number;
}

/** Field errors from a 400, keyed by path ("title", "subjects.0.title"). */
function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  return Object.fromEntries((err.details as Array<{ path?: string; message?: string }>).filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]));
}

function Field({ label, htmlFor, hint, error, children, required }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Add or edit a class — kept short: number, title, description and the subjects it offers, then
 * "Generate Course" saves it and opens the AI Course Generator for it. Everything else a class
 * has (display title, picture, page text, status, visibility, order, each subject's own text and
 * visibility) is left exactly as saved; status, visibility and order are set from Manage Courses.
 */
export function ClassEditor({
  cls,
  takenLevels,
  liveCount,
}: {
  cls?: AdminClass;
  /** Numbers in use, archived included. */ takenLevels: number[];
  /** Classes in the list (not archived). */ liveCount: number;
}) {
  const router = useNavigationRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editing = Boolean(cls);

  const firstFree = useMemo(() => {
    for (let n = 1; n <= 12; n++) if (!takenLevels.includes(n)) return n;
    return 12;
  }, [takenLevels]);

  const [classLevel, setClassLevel] = useState(String(cls?.classLevel ?? firstFree));
  const [title, setTitle] = useState(cls?.title ?? `Class ${cls?.classLevel ?? firstFree}`);
  const [titleTouched, setTitleTouched] = useState(editing);
  const [description, setDescription] = useState(cls?.description ?? '');
  const [subjects, setSubjects] = useState<SubjectPick[]>(
    () => cls?.subjects.map((s) => ({ key: s.key, title: s.title, classDescription: s.classDescription, isVisible: s.isVisible, chapters: s.chapters + s.draftChapters })) ?? [],
  );
  const [picked, setPicked] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [removing, setRemoving] = useState<SubjectPick | null>(null);
  /** Set while "Generate Course" saves and then opens the generator. */
  const [generating, setGenerating] = useState(false);
  const touch = () => setDirty(true);

  // Leaving with unsaved changes asks first (tab close / reload; Cancel has its own dialog).
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const allSubjects = useQuery({
    queryKey: ['admin', 'content', 'taxonomy', 'subject'],
    queryFn: async () => (await adminContentApi.list({ type: 'subject', status: 'live', sort: 'order', limit: 100 })).data,
    staleTime: 30_000,
  });
  const available = (allSubjects.data ?? []).filter((s) => !subjects.some((d) => d.key === s.key));

  const clearSubjectError = () =>
    setErrors((e) => {
      const rest = { ...e };
      delete rest.subjects;
      return rest;
    });
  const addSubject = () => {
    const s = available.find((x) => x.key === picked);
    if (!s) {
      setErrors((e) => ({ ...e, subjects: 'Choose a subject type first' }));
      return;
    }
    setSubjects((list) => [...list, { key: s.key, title: s.title, classDescription: '', isVisible: true, chapters: 0 }]);
    setPicked('');
    clearSubjectError();
    touch();
  };
  const removeSubject = (s: SubjectPick) => {
    setSubjects((list) => list.filter((x) => x.key !== s.key));
    touch();
  };

  const save = useMutation<Awaited<ReturnType<typeof adminClassesApi.update>>, Error, 'list' | 'generate'>({
    mutationFn: async () => {
      // Only what this form shows is sent: the server keeps every other field as it is.
      const input: Pick<ClassInput, 'title' | 'description' | 'subjects'> = {
        title: title.trim(),
        description: description.trim(),
        subjects: subjects.map((s) => ({ key: s.key, title: s.title, description: s.classDescription, isVisible: s.isVisible })),
      };
      // A new class gets the same defaults the full form used: draft, visible, last in the list, no picture.
      if (!cls) return adminClassesApi.create({ ...input, subtitle: '', details: '', image: null, classLevel: Number(classLevel), status: 'draft', isVisible: true, position: liveCount + 1 });
      return adminClassesApi.update(cls.classLevel, input);
    },
    onSuccess: (res, then) => {
      setDirty(false);
      void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
      if (then === 'list') {
        toast.success(editing ? `${res.data.title} saved` : `${res.data.title} created`);
        router.push('/admin/courses');
        return;
      }
      // The generator opens on the first subject that has no course yet (or the first one).
      const saved = res.data.subjects;
      const next = saved.find((s) => s.chapters + s.draftChapters === 0) ?? saved[0];
      toast.success(`${res.data.title} saved — generate its ${next?.title ?? ''} course`.replace(/\s+course$/, ' course'));
      router.push(`/admin/courses/generate?class=${res.data.classLevel}${next ? `&subject=${encodeURIComponent(next.key)}` : ''}`);
    },
    onError: (err) => {
      setGenerating(false);
      setErrors(fieldErrors(err));
      toast.error(err instanceof Error ? err.message : 'Could not save the class');
    },
  });

  const submit = (then: 'list' | 'generate') => (e?: FormEvent) => {
    e?.preventDefault();
    const local: Record<string, string> = {};
    const level = Number(classLevel);
    if (!editing && (!classLevel.trim() || !Number.isInteger(level) || level < 1 || level > 12)) local.classLevel = 'Enter a class number from 1 to 12';
    else if (!editing && takenLevels.includes(level)) local.classLevel = `Class ${level} already exists (it may be archived)`;
    if (!title.trim()) local.title = 'Class title is required';
    if (then === 'generate' && subjects.length === 0) local.subjects = 'Add at least one subject to generate its course';
    setErrors(local);
    if (Object.keys(local).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    if (then === 'generate') setGenerating(true);
    save.mutate(then);
  };

  const busy = save.isPending || generating;
  const subjectError = errors.subjects ?? Object.entries(errors).find(([k]) => k.startsWith('subjects.'))?.[1];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <button
          type="button"
          onClick={() => (dirty ? setLeaving(true) : router.push('/admin/courses'))}
          className="group mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Manage Courses
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{editing ? `Edit ${cls!.title}` : 'Add Class'}</h1>
        <p className="mt-1 text-sm text-muted">{editing ? 'Update the class and its subjects, then generate a course.' : 'Name the class, pick its subjects, then generate a course.'}</p>
      </div>

      <form onSubmit={submit('generate')} noValidate className="anim-rise surface-card space-y-5 rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
          <Field label="Class Number" htmlFor="cls-level" required error={errors.classLevel} hint={editing ? 'Fixed once created' : 'From 1 to 12'}>
            <input
              id="cls-level"
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              required
              placeholder="1"
              className={cn(field, editing && 'cursor-not-allowed opacity-70')}
              value={classLevel}
              disabled={editing || busy}
              onChange={(e) => {
                setClassLevel(e.target.value);
                // A new class is titled "Class N" until the administrator writes their own title.
                if (!titleTouched) setTitle(`Class ${e.target.value}`.trim());
                touch();
              }}
              aria-invalid={Boolean(errors.classLevel)}
              aria-describedby={errors.classLevel ? 'cls-level-error' : undefined}
            />
          </Field>
          <Field label="Class Title" htmlFor="cls-title" required error={errors.title}>
            <input
              id="cls-title"
              required
              className={field}
              value={title}
              maxLength={120}
              placeholder="Class 1"
              disabled={busy}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleTouched(true);
                touch();
              }}
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? 'cls-title-error' : undefined}
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="cls-description" error={errors.description} hint={`Optional · ${description.length}/500`}>
          <textarea
            id="cls-description"
            rows={3}
            className={cn(field, 'resize-y')}
            value={description}
            maxLength={500}
            placeholder="Short description…"
            disabled={busy}
            onChange={(e) => {
              setDescription(e.target.value);
              touch();
            }}
          />
        </Field>

        <fieldset className="space-y-3 rounded-2xl border border-border bg-surface-elevated/40 p-4">
          <legend className="px-1 text-sm font-semibold text-foreground">Subjects</legend>
          <div>
            <label htmlFor="cls-subject" className="mb-1.5 block text-sm font-medium text-foreground">
              Subject Type
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="cls-subject"
                className={cn(field, 'sm:flex-1')}
                value={picked}
                disabled={busy || allSubjects.isLoading || available.length === 0}
                onChange={(e) => {
                  setPicked(e.target.value);
                  if (errors.subjects) clearSubjectError();
                }}
                aria-invalid={Boolean(subjectError)}
                aria-describedby={subjectError ? 'cls-subject-error' : undefined}
              >
                <option value="">{allSubjects.isLoading ? 'Loading subjects…' : available.length ? 'Select Subject' : 'All subjects added'}</option>
                {available.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
              </select>
              <Button type="button" variant="secondary" className="gap-1.5 sm:shrink-0" onClick={addSubject} disabled={busy || !picked}>
                <Plus aria-hidden className="h-4 w-4" />
                Add Subject
              </Button>
            </div>
            {subjectError && (
              <p id="cls-subject-error" className="mt-1 text-xs text-danger">
                {subjectError}
              </p>
            )}
          </div>

          {subjects.length === 0 ? (
            <p className="text-sm text-muted">No subjects yet.</p>
          ) : (
            <ul aria-label="Selected subjects" className="flex flex-wrap gap-2">
              {subjects.map((s) => (
                <li
                  key={s.key}
                  className={cn('inline-flex items-center gap-1 rounded-full border border-border bg-surface py-1 pl-3 pr-1 text-sm font-medium text-foreground', !s.isVisible && 'opacity-70')}
                >
                  {s.title}
                  {!s.isVisible && <span className="text-[10px] font-semibold uppercase text-muted">· hidden</span>}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => (s.chapters > 0 ? setRemoving(s) : removeSubject(s))}
                    className="ml-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-danger disabled:opacity-50"
                    aria-label={`Remove ${s.title}`}
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => (dirty ? setLeaving(true) : router.push('/admin/courses'))} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" onClick={() => submit('list')()} disabled={busy} isLoading={save.isPending && !generating}>
            {editing ? 'Save Changes' : 'Save Class'}
          </Button>
          <Button type="submit" className="gap-2" disabled={busy} isLoading={generating}>
            {!generating && <Wand2 aria-hidden className="h-4 w-4" />}
            {generating ? 'Opening generator…' : 'Generate Course'}
          </Button>
        </div>
      </form>

      {editing && cls!.subjects.some((s) => s.chapters + s.draftChapters > 0) && (
        <p className="flex flex-wrap items-center gap-2 px-1 text-sm text-muted">
          Edit existing course content:
          {cls!.subjects
            .filter((s) => s.chapters + s.draftChapters > 0)
            .map((s) => (
              <Link
                key={s.key}
                href={`/admin/courses/${cls!.classLevel}/${s.key}`}
                className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-foreground hover:bg-surface-hover"
              >
                {s.title}
              </Link>
            ))}
        </p>
      )}

      <ConfirmDialog
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeSubject(removing);
          setRemoving(null);
        }}
        title={`Remove ${removing?.title ?? 'this subject'}?`}
        description={`Its course leaves ${title || 'this class'} when you save. Nothing is deleted — add ${removing?.title ?? 'it'} again to bring the course back.`}
        confirmLabel="Remove"
      />
      <ConfirmDialog
        isOpen={leaving}
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setDirty(false);
          setLeaving(false);
          router.push('/admin/courses');
        }}
        title="Discard changes?"
        description="You have changes that are not saved yet. Leaving now will lose them."
        confirmLabel="Discard"
      />
    </div>
  );
}

/** Loads a class for editing (and the numbers already taken), then shows the editor. */
export function ClassEditorPage({ level }: { level?: number }) {
  const list = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'all'], queryFn: async () => (await adminClassesApi.list('all')).data });
  const cls = level ? list.data?.find((c) => c.classLevel === level) : undefined;
  if (list.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">Unable to load classes</p>
        <Button className="mt-4 gap-2" onClick={() => void list.refetch()}>
          <RefreshCw aria-hidden className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }
  if (level && (!cls || cls.status === 'archived')) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">{cls ? 'This class is archived' : level > 0 ? `There is no Class ${level}` : 'There is no such class'}</p>
        <p className="mt-1 text-sm text-muted">{cls ? 'Restore it from Manage Courses to edit it.' : 'It may have been removed.'}</p>
        <Link href="/admin/courses" className="btn-primary mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
          Back to Manage Courses
        </Link>
      </div>
    );
  }
  const rows = list.data ?? [];
  return <ClassEditor key={cls?.id ?? 'new'} cls={cls} takenLevels={rows.map((c) => c.classLevel)} liveCount={rows.filter((c) => c.status !== 'archived').length} />;
}
