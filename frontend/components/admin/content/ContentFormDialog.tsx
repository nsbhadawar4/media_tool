'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Info, Lock } from 'lucide-react';
import { adminContentApi, GAME_TYPES, type AdminContentItem, type CreateContentInput, type Difficulty, type UpdateContentInput } from '@/lib/api/adminContent';
import { ApiError } from '@/lib/api/client';
import { isImplemented } from '@/lib/content/catalogManifest';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/utils/cn';
import type { ContentTypeInfo } from './contentTypes';
import { useTaxonomy } from './useTaxonomy';

export const fieldClass =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60';

export function FieldError({ message }: { message?: string }) {
  return message ? <p className="mt-1 text-xs text-danger">{message}</p> : null;
}

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground-soft">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-subtle">{hint}</p>}
      <FieldError message={error} />
    </div>
  );
}

/** Field-level messages from a 400 response, keyed by field. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return {};
  return Object.fromEntries((err.details as Array<{ path?: string; message?: string }>).filter((d) => d.path && d.message).map((d) => [d.path!, d.message!]));
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];
const KEY_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const URL_PATTERN = /^https?:\/\/\S+$/i;

interface FormState {
  key: string;
  title: string;
  description: string;
  classLevel: string;
  subject: string;
  courseId: string;
  difficulty: string;
  gameType: string;
  glyph: string;
  thumbnailUrl: string;
}

function initial(item: AdminContentItem | null): FormState {
  return {
    key: item?.key ?? '',
    title: item?.title ?? '',
    description: item?.description ?? '',
    classLevel: item?.classLevel != null ? String(item.classLevel) : '',
    subject: item?.subject ?? '',
    courseId: item?.courseId ?? '',
    difficulty: item?.difficulty ?? 'easy',
    gameType: item?.gameType ?? '',
    glyph: item?.glyph ?? '',
    thumbnailUrl: item?.thumbnailUrl ?? '',
  };
}

/**
 * Add or edit one catalog entry, with the fields its type has:
 *  - class: number (on creation), display name, description, image;
 *  - subject: key (on creation), name, description, glyph, image;
 *  - game: key (on creation), title, description, class, subject (one the class offers), course
 *    (one of that class and subject), difficulty, game type, image — a built-in game's class,
 *    subject, difficulty and type are fixed by its content and shown read-only;
 *  - section / arcade game: title and description.
 * The server validates everything again, relationships included.
 */
export function ContentFormDialog({
  info,
  item,
  open,
  onClose,
  onSaved,
}: {
  info: ContentTypeInfo;
  /** null: create. */
  item: AdminContentItem | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const tax = useTaxonomy();
  const editing = item !== null;
  const [form, setForm] = useState<FormState>(() => initial(item));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFor, setLoadedFor] = useState<string | null>(item?.id ?? null);
  if (open && (item?.id ?? null) !== loadedFor) {
    // A different entry (or a fresh "add") was opened: start from its values.
    setLoadedFor(item?.id ?? null);
    setForm(initial(item));
    setErrors({});
  }

  const t = info.type;
  const isGame = t === 'kid_game';
  const codeLocked = editing && item.source === 'code';
  const set = (field: keyof FormState) => (value: string) => {
    setForm((f) => {
      const next = { ...f, [field]: value };
      // A course belongs to one class and subject: changing either clears it.
      if (field === 'classLevel' || field === 'subject') next.courseId = '';
      if (field === 'classLevel' && !tax.subjectsOffered(Number(value)).some((s) => s.key === next.subject)) next.subject = '';
      return next;
    });
    setErrors((e) => ({ ...e, [field]: '' }));
  };
  const level = form.classLevel ? Number(form.classLevel) : null;
  const subjectOptions = tax.subjectsOffered(level);
  const courseOptions = tax.coursesFor(level, form.subject || null);
  const needsCode = !editing && (t === 'kid_game' || t === 'game' || t === 'section') && form.key.trim() !== '' && !isImplemented(t, form.key.trim().toLowerCase());

  const save = useMutation({
    mutationFn: () => {
      const thumbnailUrl = form.thumbnailUrl.trim() || null;
      if (!editing) {
        const input: CreateContentInput = { type: t, title: form.title.trim(), description: form.description.trim() };
        if (t !== 'class') input.key = form.key.trim().toLowerCase();
        if (t === 'class' || isGame) input.classLevel = Number(form.classLevel);
        if (isGame) {
          input.subject = form.subject;
          input.difficulty = form.difficulty as Difficulty;
          if (form.gameType) input.gameType = form.gameType;
          input.courseId = form.courseId || null;
        }
        if (t === 'subject') input.glyph = form.glyph.trim() || null;
        if (t === 'class' || t === 'subject' || isGame) input.thumbnailUrl = thumbnailUrl;
        return adminContentApi.create(input);
      }
      // Only what changed, so a built-in game's fixed fields are never sent.
      const before = initial(item);
      const patch: UpdateContentInput = {};
      if (form.title.trim() !== before.title) patch.title = form.title.trim();
      if (form.description.trim() !== before.description) patch.description = form.description.trim();
      if ((t === 'class' || t === 'subject' || isGame) && form.thumbnailUrl.trim() !== before.thumbnailUrl) patch.thumbnailUrl = thumbnailUrl;
      if (t === 'subject' && form.glyph.trim() !== before.glyph) patch.glyph = form.glyph.trim() || null;
      if (isGame) {
        if (form.courseId !== before.courseId) patch.courseId = form.courseId || null;
        if (!codeLocked) {
          if (form.classLevel !== before.classLevel) patch.classLevel = Number(form.classLevel);
          if (form.subject !== before.subject) patch.subject = form.subject;
          if (form.difficulty !== before.difficulty) patch.difficulty = form.difficulty as Difficulty;
          if (form.gameType !== before.gameType) patch.gameType = form.gameType || null;
        }
      }
      return adminContentApi.update(item.id, patch);
    },
    onSuccess: (res) => {
      toast.success(editing ? 'Saved' : `Added “${res.data.title}”`);
      onSaved();
      onClose();
    },
    onError: (err: Error) => {
      setErrors(err instanceof ApiError && err.status === 409 ? { key: err.message, classLevel: err.message } : fieldErrors(err));
      toast.error(err.message);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!editing && t !== 'class' && !KEY_PATTERN.test(form.key.trim().toLowerCase())) found.key = 'Lowercase letters, numbers and hyphens only';
    if (!form.title.trim()) found.title = t === 'class' ? 'Display name is required' : 'Title is required';
    if (!editing && t === 'class' && !(Number(form.classLevel) >= 1 && Number(form.classLevel) <= 12)) found.classLevel = 'A number from 1 to 12';
    if (isGame && !form.classLevel) found.classLevel = 'Choose a class';
    if (isGame && !form.subject) found.subject = 'Choose a subject this class offers';
    if (form.thumbnailUrl.trim() && !URL_PATTERN.test(form.thumbnailUrl.trim())) found.thumbnailUrl = 'Links must start with http:// or https://';
    setErrors(found);
    if (!Object.keys(found).length) save.mutate();
  };

  const locked = (label: string, value: string) => (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[13px] font-medium text-foreground-soft">
        {label}
        <Lock className="h-3 w-3 text-subtle" aria-label="Fixed by the game's content" />
      </p>
      <p className="rounded-xl border border-dashed border-border-strong px-3.5 py-2.5 text-sm text-muted">{value}</p>
    </div>
  );

  return (
    <Modal isOpen={open} onClose={() => !save.isPending && onClose()} title={`${editing ? 'Edit' : 'Add'} ${info.singular}`} size="lg">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {needsCode && t === 'section' && (
          <p className="flex items-start gap-1.5 rounded-xl border border-border bg-surface-hover/60 px-3 py-2.5 text-xs text-muted">
            <Info className="mt-px h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
            A new section appears on the home page as a text block — its title and description — once it is switched on.
          </p>
        )}
        {needsCode && t !== 'section' && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              Gameplay is built in code. This {info.singular} is saved and manageable here, but stays out of users&apos; sight until the app has
              code for its key.
            </span>
          </div>
        )}
        {codeLocked && isGame && (
          <p className="flex items-start gap-1.5 text-xs text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            A built-in game&apos;s questions are written for one class and subject, so its class, subject, difficulty and type can&apos;t change. Its title,
            description, image and course can.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t === 'class' ? (
            editing ? (
              locked('Class number', form.classLevel)
            ) : (
              <Field id="cf-level" label="Class number" hint="Its address becomes /kid-games/class-N" error={errors.classLevel}>
                <input id="cf-level" type="number" min={1} max={12} value={form.classLevel} onChange={(e) => set('classLevel')(e.target.value)} className={fieldClass} aria-invalid={Boolean(errors.classLevel)} />
              </Field>
            )
          ) : editing ? (
            locked(t === 'subject' ? 'Name (key)' : 'Key', item.key)
          ) : (
            <Field id="cf-key" label={t === 'subject' ? 'Name (key)' : 'Key'} hint="Lowercase letters, numbers and hyphens — used in addresses" error={errors.key}>
              <input id="cf-key" value={form.key} onChange={(e) => set('key')(e.target.value)} placeholder={t === 'subject' ? 'e.g. science' : 'e.g. c1-math-shape-hunt'} className={cn(fieldClass, 'font-mono')} aria-invalid={Boolean(errors.key)} />
            </Field>
          )}
          <Field id="cf-title" label={t === 'class' ? 'Display name' : t === 'subject' ? 'Display name' : 'Title'} error={errors.title}>
            <input id="cf-title" value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={120} placeholder={t === 'class' ? 'e.g. Class 6' : undefined} className={fieldClass} aria-invalid={Boolean(errors.title)} />
          </Field>
        </div>

        <Field id="cf-description" label="Description" error={errors.description}>
          <textarea id="cf-description" value={form.description} onChange={(e) => set('description')(e.target.value)} maxLength={500} rows={3} className={cn(fieldClass, 'resize-y')} />
        </Field>

        {isGame && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {codeLocked ? (
                <>
                  {locked('Class', tax.classTitle(item.classLevel))}
                  {locked('Subject', tax.subjectTitle(item.subject))}
                </>
              ) : (
                <>
                  <Field id="cf-class" label="Class" error={errors.classLevel}>
                    <select id="cf-class" value={form.classLevel} onChange={(e) => set('classLevel')(e.target.value)} className={fieldClass} aria-invalid={Boolean(errors.classLevel)}>
                      <option value="">Choose…</option>
                      {tax.classes.map((c) => (
                        <option key={c.id} value={c.classLevel ?? ''}>{c.title}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="cf-subject" label="Subject" hint={level && subjectOptions.length === 0 ? 'This class offers no subjects yet — assign one on the Subjects page.' : undefined} error={errors.subject}>
                    <select id="cf-subject" value={form.subject} onChange={(e) => set('subject')(e.target.value)} disabled={!level} className={fieldClass} aria-invalid={Boolean(errors.subject)}>
                      <option value="">Choose…</option>
                      {subjectOptions.map((s) => (
                        <option key={s.id} value={s.key}>{s.title}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </div>
            <Field id="cf-course" label="Course (optional)" hint={courseOptions.length === 0 ? 'No courses for this class and subject yet.' : 'The course this game practises.'} error={errors.courseId}>
              <select id="cf-course" value={form.courseId} onChange={(e) => set('courseId')(e.target.value)} disabled={!form.subject} className={fieldClass}>
                <option value="">No course</option>
                {courseOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {codeLocked ? (
                <>
                  {locked('Difficulty', item.difficulty ?? '—')}
                  {locked('Game type', item.gameType ?? '—')}
                </>
              ) : (
                <>
                  <Field id="cf-difficulty" label="Difficulty">
                    <select id="cf-difficulty" value={form.difficulty} onChange={(e) => set('difficulty')(e.target.value)} className={fieldClass}>
                      {DIFFICULTIES.map((d) => (
                        <option key={d} value={d}>{d[0]!.toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field id="cf-type" label="Game type" error={errors.gameType}>
                    <select id="cf-type" value={form.gameType} onChange={(e) => set('gameType')(e.target.value)} className={fieldClass}>
                      <option value="">Not set</option>
                      {GAME_TYPES.map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                  </Field>
                </>
              )}
            </div>
          </>
        )}

        {(t === 'class' || t === 'subject' || isGame) && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <Field id="cf-thumb" label="Image link (optional)" hint="An https:// image shown on its card" error={errors.thumbnailUrl}>
              <input id="cf-thumb" value={form.thumbnailUrl} onChange={(e) => set('thumbnailUrl')(e.target.value)} placeholder="https://…" className={fieldClass} aria-invalid={Boolean(errors.thumbnailUrl)} />
            </Field>
            {t === 'subject' && (
              <Field id="cf-glyph" label="Glyph" hint="e.g. A B C" error={errors.glyph}>
                <input id="cf-glyph" value={form.glyph} onChange={(e) => set('glyph')(e.target.value)} maxLength={12} className={cn(fieldClass, 'sm:w-32')} />
              </Field>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" isLoading={save.isPending}>{editing ? 'Save changes' : `Add ${info.singular}`}</Button>
        </div>
      </form>
    </Modal>
  );
}
