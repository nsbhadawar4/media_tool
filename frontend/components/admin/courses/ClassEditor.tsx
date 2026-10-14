'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ImagePlus, Info, Loader2, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { ADMIN_CLASSES_KEY, adminClassesApi, type AdminClass, type ClassInput } from '@/lib/api/adminClasses';
import { adminContentApi } from '@/lib/api/adminContent';
import { ApiError } from '@/lib/api/client';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ClassCourseCard, builtInSubtitle, classPicture } from '@/components/kid-games/cards/ClassCourseCard';
import { cn } from '@/utils/cn';

const field =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';

interface SubjectDraft {
  id: string;
  /** Set for a subject that already exists (shared with other classes). */
  key?: string;
  title: string;
  description: string;
  glyph: string;
  isVisible: boolean;
}

let draftSeq = 0;
const draft = (s: Partial<SubjectDraft> = {}): SubjectDraft => ({ id: `s${draftSeq++}`, title: '', description: '', glyph: '', isVisible: true, ...s });

/** Most a request body may be on Vercel (4.5 MB) — kept under, so uploads work the same everywhere. */
const UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Shrinks a picture in the browser before it is sent (the server crops it to 1200×900 anyway), so a
 * large phone photo stays under the serverless request limit. Falls back to the original file
 * whenever the browser can't decode it here.
 */
async function shrinkImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= UPLOAD_MAX_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Field errors from a 400, keyed by path ("title", "subjects.0.title"). */
function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  return Object.fromEntries((err.details as Array<{ path?: string; message?: string }>).filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]));
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="anim-rise surface-card rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, htmlFor, hint, error, children, required }: { label: string; htmlFor: string; hint?: string; error?: string; children: ReactNode; required?: boolean }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Add or edit a class: its details, picture, subjects, visibility and place in the list, saved in
 * one go. The server checks everything again; after saving, the home page, the user dashboard and
 * the class pages show the change straight away (they read the same catalog).
 */
export function ClassEditor({ cls, takenLevels, liveCount }: { cls?: AdminClass; /** Numbers in use, archived included. */ takenLevels: number[]; /** Classes in the list (not archived). */ liveCount: number }) {
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
  const [subtitle, setSubtitle] = useState(cls?.subtitle ?? '');
  const [description, setDescription] = useState(cls?.description ?? '');
  const [details, setDetails] = useState(cls?.details ?? '');
  const [image, setImage] = useState<string | null>(cls?.image ?? null);
  const [isVisible, setVisible] = useState(cls?.isVisible ?? true);
  const [position, setPosition] = useState(String(cls?.position ?? liveCount + 1));
  const [subjects, setSubjects] = useState<SubjectDraft[]>(
    () => cls?.subjects.map((s) => draft({ key: s.key, title: s.title, description: s.description, glyph: s.glyph ?? '', isVisible: s.isVisible })) ?? [],
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
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

  const [uploadError, setUploadError] = useState('');
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose a JPG, PNG, WebP or GIF image');
      const small = await shrinkImage(file);
      if (small.size > UPLOAD_MAX_BYTES) throw new Error('This image is too large. Choose one under 4 MB.');
      return adminClassesApi.uploadImage(small);
    },
    onMutate: () => setUploadError(''),
    onSuccess: (res) => {
      setImage(res.data.url);
      touch();
      toast.success('Image uploaded');
    },
    onError: (err) => {
      const message = err instanceof Error && err.message ? err.message : 'The image could not be uploaded';
      setUploadError(`Upload failed: ${message}`);
      toast.error(message);
    },
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async () => {
      const input: ClassInput = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        details: details.trim(),
        image,
        isVisible,
        position: Number(position) || undefined,
        subjects: subjects.map((s) => ({
          ...(s.key ? { key: s.key } : {}),
          title: s.title.trim(),
          description: s.description.trim(),
          glyph: s.glyph.trim() || null,
          isVisible: s.isVisible,
        })),
      };
      return cls ? adminClassesApi.update(cls.classLevel, input) : adminClassesApi.create({ ...input, classLevel: Number(classLevel) });
    },
    onSuccess: (res) => {
      setDirty(false);
      toast.success(editing ? `${res.data.title} saved` : `${res.data.title} created`);
      void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
      router.push('/admin/courses');
    },
    onError: (err) => {
      setErrors(fieldErrors(err));
      toast.error(err instanceof Error ? err.message : 'Could not save the class');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const local: Record<string, string> = {};
    const level = Number(classLevel);
    if (!editing && (!Number.isInteger(level) || level < 1 || level > 12)) local.classLevel = 'Use a class number from 1 to 12';
    else if (!editing && takenLevels.includes(level)) local.classLevel = `Class ${level} already exists (it may be archived)`;
    if (!title.trim()) local.title = 'Class title is required';
    subjects.forEach((s, i) => {
      if (!s.title.trim()) local[`subjects.${i}.title`] = 'Subject name is required';
    });
    setErrors(local);
    if (Object.keys(local).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    save.mutate();
  };

  const updateSubject = (id: string, patch: Partial<SubjectDraft>) => {
    setSubjects((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    touch();
  };
  const moveSubject = (i: number, by: -1 | 1) => {
    setSubjects((list) => {
      const next = [...list];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row!);
      return next;
    });
    touch();
  };

  const level = Number(classLevel) || 1;
  const builtIn = cls?.builtIn ?? false;
  const picture = classPicture(level, image, title || `Class ${level}`, builtIn);
  const maxPosition = editing ? liveCount : liveCount + 1;

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <button
            type="button"
            onClick={() => (dirty ? setLeaving(true) : router.push('/admin/courses'))}
            className="group mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Manage Courses
          </button>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{editing ? `Edit ${cls!.title}` : 'Create New Class'}</h1>
          <p className="mt-1 text-sm text-muted">
            {editing ? 'Changes show on the website, the user dashboard and the class page as soon as you save.' : 'Add a class, its subjects and its picture.'}
          </p>
        </div>
        {editing && (
          <a
            href={`/classes/${cls!.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 self-start rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground transition-colors hover:bg-surface-hover sm:self-auto"
            title="Opens the saved class page in a new tab"
          >
            <Eye aria-hidden className="h-4 w-4" />
            Preview page
          </a>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="space-y-6">
          <Section title="Basic information">
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Field label="Class number" htmlFor="cls-level" required error={errors.classLevel} hint={editing ? 'Fixed — progress and games are linked to it' : '1 to 12'}>
                <input
                  id="cls-level"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  className={cn(field, editing && 'cursor-not-allowed opacity-70')}
                  value={classLevel}
                  disabled={editing}
                  onChange={(e) => {
                    setClassLevel(e.target.value);
                    // A new class is titled "Class N" until the administrator writes their own title.
                    if (!titleTouched) setTitle(`Class ${e.target.value}`.trim());
                    touch();
                  }}
                  aria-invalid={Boolean(errors.classLevel)}
                />
              </Field>
              <Field label="Class title" htmlFor="cls-title" required error={errors.title}>
                <input
                  id="cls-title"
                  className={field}
                  value={title}
                  maxLength={120}
                  placeholder="Class 6"
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                    touch();
                  }}
                  aria-invalid={Boolean(errors.title)}
                />
              </Field>
            </div>
            <Field
              label="Display title"
              htmlFor="cls-subtitle"
              error={errors.subtitle}
              hint={builtIn ? `Shown under the title on cards. Empty: “${builtInSubtitle(level)}”.` : 'Shown under the title on cards, e.g. “Fun Foundations”.'}
            >
              <input
                id="cls-subtitle"
                className={field}
                value={subtitle}
                maxLength={60}
                placeholder={builtIn ? builtInSubtitle(level) : 'Fun Foundations'}
                onChange={(e) => {
                  setSubtitle(e.target.value);
                  touch();
                }}
              />
            </Field>
            <Field label="Short description" htmlFor="cls-description" error={errors.description} hint={`On the class cards. ${description.length}/500`}>
              <textarea
                id="cls-description"
                className={cn(field, 'min-h-20 resize-y')}
                value={description}
                maxLength={500}
                onChange={(e) => {
                  setDescription(e.target.value);
                  touch();
                }}
              />
            </Field>
            <Field label="Description" htmlFor="cls-details" error={errors.details} hint={`On the class page. ${details.length}/2000`}>
              <textarea
                id="cls-details"
                className={cn(field, 'min-h-28 resize-y')}
                value={details}
                maxLength={2000}
                onChange={(e) => {
                  setDetails(e.target.value);
                  touch();
                }}
              />
            </Field>
          </Section>

          <Section title="Subjects" hint="Subjects are shared by every class: a new name or description changes it everywhere it is used.">
            {subjects.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No subjects yet. Add the first one below.</p>}
            <ol className="space-y-3">
              {subjects.map((s, i) => (
                <li key={s.id} className={cn('rounded-2xl border border-border bg-surface-elevated/60 p-4 transition-opacity', !s.isVisible && 'opacity-70')}>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-xs font-semibold text-foreground-soft">
                      {i + 1}
                    </span>
                    <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                      <Field label="Subject name" htmlFor={`sub-${s.id}`} error={errors[`subjects.${i}.title`]} hint={s.key ? undefined : 'New subject'}>
                        <input id={`sub-${s.id}`} className={field} value={s.title} maxLength={60} onChange={(e) => updateSubject(s.id, { title: e.target.value })} />
                      </Field>
                      <Field label="Mark" htmlFor={`glyph-${s.id}`} hint="e.g. A B C">
                        <input id={`glyph-${s.id}`} className={field} value={s.glyph} maxLength={12} onChange={(e) => updateSubject(s.id, { glyph: e.target.value })} />
                      </Field>
                      <div className="sm:col-span-2">
                        <Field label="Subject description" htmlFor={`subd-${s.id}`}>
                          <input id={`subd-${s.id}`} className={field} value={s.description} maxLength={500} onChange={(e) => updateSubject(s.id, { description: e.target.value })} />
                        </Field>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <label className="inline-flex items-center gap-2 text-sm text-foreground-soft">
                      <Toggle checked={s.isVisible} onChange={(v) => updateSubject(s.id, { isVisible: v })} label={`Show ${s.title || 'subject'} in this class`} />
                      {s.isVisible ? 'Shown in this class' : 'Hidden in this class'}
                    </label>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => moveSubject(i, -1)} aria-label={`Move ${s.title || 'subject'} up`}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={i === subjects.length - 1} onClick={() => moveSubject(i, 1)} aria-label={`Move ${s.title || 'subject'} down`}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => {
                          setSubjects((list) => list.filter((x) => x.id !== s.id));
                          touch();
                        }}
                        aria-label={`Remove ${s.title || 'subject'} from this class`}
                        title="Removes it from this class only — its games and other classes are not affected"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="max-sm:sr-only">Remove</span>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-2 sm:flex-row">
              {available.length > 0 && (
                <select
                  aria-label="Add an existing subject"
                  className={cn(field, 'sm:max-w-xs')}
                  value=""
                  onChange={(e) => {
                    const s = available.find((x) => x.key === e.target.value);
                    if (!s) return;
                    setSubjects((list) => [...list, draft({ key: s.key, title: s.title, description: s.description, glyph: s.glyph ?? '' })]);
                    touch();
                  }}
                >
                  <option value="">+ Add an existing subject…</option>
                  {available.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.title}
                    </option>
                  ))}
                </select>
              )}
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  setSubjects((list) => [...list, draft()]);
                  touch();
                }}
              >
                <Plus aria-hidden className="h-4 w-4" />
                Add Subject
              </Button>
            </div>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Class image">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface-hover">
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- a live preview of the chosen picture
                <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
                  <ImagePlus aria-hidden className="h-8 w-8" />
                  <span className="text-xs">No image yet</span>
                </div>
              )}
              {upload.isPending && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
                  <span className="sr-only">Uploading…</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {image ? <RefreshCw aria-hidden className="h-4 w-4" /> : <Upload aria-hidden className="h-4 w-4" />}
                {image ? 'Replace' : 'Upload'}
              </Button>
              {image && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setImage(null);
                    touch();
                  }}
                >
                  <X aria-hidden className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">
              JPG, PNG, WebP or GIF. Large photos are resized before upload; the picture is cropped to 4:3.{builtIn ? ' Without one, the class keeps its built-in photo.' : ''}
            </p>
            {(uploadError || errors.image) && (
              <p role="alert" className="text-xs text-danger">
                {uploadError || errors.image}
              </p>
            )}
          </Section>

          <Section title="Visibility">
            <div role="radiogroup" aria-label="Visibility" className="grid grid-cols-2 gap-2">
              {([true, false] as const).map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  role="radio"
                  aria-checked={isVisible === v}
                  onClick={() => {
                    setVisible(v);
                    touch();
                  }}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors',
                    isVisible === v ? 'border-accent bg-accent/10 text-foreground' : 'border-border bg-surface text-muted hover:text-foreground',
                  )}
                >
                  {v ? <Eye aria-hidden className="h-4 w-4" /> : <EyeOff aria-hidden className="h-4 w-4" />}
                  {v ? 'Visible' : 'Hidden'}
                </button>
              ))}
            </div>
            <p className="flex gap-2 text-xs text-muted">
              <Info aria-hidden className="mt-px h-3.5 w-3.5 shrink-0" />
              {isVisible ? 'Shown on the website and the user dashboard.' : 'Only administrators see it. It can still be previewed by its link.'}
            </p>
          </Section>

          <Section title="Display order">
            <Field label="Position" htmlFor="cls-position" hint={`1 is first. ${maxPosition} ${maxPosition === 1 ? 'place' : 'places'} in the list.`}>
              <input
                id="cls-position"
                type="number"
                inputMode="numeric"
                min={1}
                max={maxPosition}
                className={field}
                value={position}
                onChange={(e) => {
                  setPosition(e.target.value);
                  touch();
                }}
              />
            </Field>
          </Section>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Card preview</p>
            <div inert>
              <ClassCourseCard
                level={level}
                builtIn={builtIn}
                title={title || `Class ${level}`}
                subtitle={subtitle || undefined}
                description={description || undefined}
                image={image}
                facts={[{ label: `${subjects.filter((s) => s.isVisible).length} subjects` }]}
                cta="Explore Class"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 flex gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md max-sm:[&>button]:flex-1 sm:mx-0 sm:justify-end sm:rounded-2xl sm:border sm:px-4">
        <Button type="button" variant="secondary" onClick={() => (dirty ? setLeaving(true) : router.push('/admin/courses'))} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" isLoading={save.isPending} disabled={upload.isPending}>
          {editing ? 'Save Changes' : 'Save Class'}
        </Button>
      </div>

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
    </form>
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
