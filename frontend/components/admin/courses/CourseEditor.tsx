'use client';

import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, BookOpen, ChevronDown, Copy, ListChecks, Loader2, PencilRuler, Plus, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import type { ChapterDifficulty, CurriculumChapter, CurriculumQuestion, QuestionType } from '@/lib/api/adminClasses';
import type { ChapterStatus, GeneratedChapter, GeneratedLesson, SaveCourseInput } from '@/lib/api/courses';
import { Button } from '@/components/ui/Button';
import { ScheduleFields, scheduleToValue, valueToSchedule } from '@/components/admin/content/ScheduleFields';
import { monthName } from '@/lib/content/academicCalendar';
import { cn } from '@/utils/cn';

/**
 * The course editor: a course (title, description, objectives) and its chapters → lessons →
 * explanation, examples, key points, questions with answers, practice → the chapter quiz. Every
 * item can be edited, added, duplicated, deleted, reordered — and, when the page offers it,
 * regenerated on its own (one chapter, one lesson or one lesson's questions), which never changes
 * anything else. The generator's review step and a saved course's edit page both use it; it holds
 * no data of its own (value / onChange), so the page decides when anything is saved.
 */

let seq = 0;
const k = () => `k${seq++}`;

export interface DraftQuestion {
  key: string;
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: string;
  difficulty: ChapterDifficulty | null;
  explanation: string;
}
export interface DraftLesson {
  key: string;
  id?: string;
  title: string;
  explanation: string;
  examples: string[];
  keyPoints: string[];
  questions: DraftQuestion[];
  practice: DraftQuestion[];
  estimatedMinutes: number | null;
}
export interface DraftChapter {
  key: string;
  id?: string;
  title: string;
  description: string;
  summary: string;
  objectives: string[];
  difficulty: ChapterDifficulty | null;
  status: ChapterStatus;
  /** When in the academic year it is taught (from the database; null = not scheduled yet). */
  academicYear?: string | null;
  month?: number | null;
  /** The administrator changed it here: only then is it sent on save, so a stale editor never overwrites a mapping made elsewhere. */
  scheduleEdited?: boolean;
  lessons: DraftLesson[];
  quiz: DraftQuestion[];
}
export interface DraftCourse {
  title: string;
  description: string;
  objectives: string[];
  chapters: DraftChapter[];
}

// ------------------------------------------------------------------------------------ conversions

export const toDraftQuestion = (q: CurriculumQuestion): DraftQuestion => ({ key: k(), type: q.type, prompt: q.prompt, options: [...q.options], answer: q.answer ?? '', difficulty: q.difficulty ?? null, explanation: q.explanation ?? '' });
export const toDraftLesson = (l: GeneratedLesson | CurriculumChapter['lessons'][number]): DraftLesson => ({
  key: k(),
  id: 'id' in l ? l.id : undefined,
  title: l.title,
  explanation: l.explanation,
  examples: [...l.examples],
  keyPoints: [...l.keyPoints],
  questions: l.questions.map(toDraftQuestion),
  practice: l.practice.map(toDraftQuestion),
  estimatedMinutes: l.estimatedMinutes ?? null,
});
export const toDraftChapter = (c: GeneratedChapter | (CurriculumChapter & { status?: ChapterStatus }), status: ChapterStatus = 'draft'): DraftChapter => ({
  key: k(),
  id: 'id' in c ? c.id : undefined,
  title: c.title,
  description: c.description,
  summary: c.summary ?? '',
  objectives: [...c.objectives],
  difficulty: c.difficulty ?? null,
  status: 'status' in c && c.status ? c.status : status,
  academicYear: 'academicYear' in c ? (c.academicYear ?? null) : null,
  month: 'month' in c ? (c.month ?? null) : null,
  scheduleEdited: 'scheduleEdited' in c ? Boolean((c as { scheduleEdited?: boolean }).scheduleEdited) : false,
  lessons: c.lessons.map(toDraftLesson),
  quiz: c.quiz.map(toDraftQuestion),
});
const plainQuestion = (q: DraftQuestion): CurriculumQuestion => ({
  type: q.type,
  prompt: q.prompt,
  options: q.type === 'fill-blank' || q.type === 'short-answer' || q.type === 'word-problem' ? q.options.filter(Boolean) : q.options,
  answer: q.answer,
  difficulty: q.difficulty,
  explanation: q.explanation,
});
export function toSaveChapters(chapters: DraftChapter[], keepIds: boolean): SaveCourseInput['chapters'] {
  return chapters.map((c) => ({
    ...(keepIds && c.id ? { id: c.id } : {}),
    title: c.title.trim(),
    description: c.description.trim(),
    summary: c.summary.trim(),
    objectives: c.objectives.map((o) => o.trim()).filter(Boolean),
    difficulty: c.difficulty,
    status: c.status,
    // A new chapter says where it goes; a saved one only when the schedule was changed here.
    ...((c.scheduleEdited || !c.id || !keepIds) && c.academicYear !== undefined ? { academicYear: c.academicYear ?? null, month: c.academicYear ? (c.month ?? null) : null } : {}),
    lessons: c.lessons.map((l) => ({
      ...(keepIds && l.id ? { id: l.id } : {}),
      title: l.title.trim(),
      explanation: l.explanation,
      examples: l.examples.map((x) => x.trim()).filter(Boolean),
      keyPoints: l.keyPoints.map((x) => x.trim()).filter(Boolean),
      questions: l.questions.map(plainQuestion),
      practice: l.practice.map(plainQuestion),
      estimatedMinutes: l.estimatedMinutes,
    })),
    quiz: c.quiz.map(plainQuestion),
  }));
}

/** Problems an administrator should fix before saving (the server checks the same and more). */
export function courseProblems(course: DraftCourse): string[] {
  const out: string[] = [];
  if (!course.title.trim()) out.push('The course needs a title.');
  const check = (q: DraftQuestion, where: string) => {
    if (!q.prompt.trim()) out.push(`${where}: the question is empty.`);
    if (!q.answer.trim()) out.push(`${where}: the answer is empty.`);
    if ((q.type === 'mcq' || q.type === 'match' || q.type === 'true-false') && !q.options.map((o) => o.trim()).includes(q.answer.trim())) out.push(`${where}: the answer must be one of the options.`);
    if ((q.type === 'mcq' || q.type === 'match') && q.options.filter((o) => o.trim()).length < 2) out.push(`${where}: give at least two options.`);
  };
  course.chapters.forEach((c, ci) => {
    const cw = `Chapter ${ci + 1}`;
    if (!c.title.trim()) out.push(`${cw}: the title is empty.`);
    c.lessons.forEach((l, li) => {
      if (!l.title.trim()) out.push(`${cw}, lesson ${li + 1}: the title is empty.`);
      l.questions.forEach((q, qi) => check(q, `${cw}, lesson ${li + 1}, question ${qi + 1}`));
      l.practice.forEach((q, qi) => check(q, `${cw}, lesson ${li + 1}, practice ${qi + 1}`));
    });
    c.quiz.forEach((q, qi) => check(q, `${cw}, quiz ${qi + 1}`));
  });
  return out;
}

const counts = (course: DraftCourse) => ({
  chapters: course.chapters.length,
  lessons: course.chapters.reduce((n, c) => n + c.lessons.length, 0),
  questions: course.chapters.reduce((n, c) => n + c.quiz.length + c.lessons.reduce((m, l) => m + l.questions.length + l.practice.length, 0), 0),
  minutes: course.chapters.reduce((n, c) => n + c.lessons.reduce((m, l) => m + (l.estimatedMinutes ?? 0), 0), 0),
});
export const courseCounts = counts;

// ------------------------------------------------------------------------------------ small pieces

const field = 'w-full rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';

function Label({ children, htmlFor }: { children: ReactNode; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
      {children}
    </label>
  );
}

/** A list of short texts, one per line. */
function LinesField({ id, label, value, onChange, placeholder, rows = 3 }: { id: string; label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} className={cn(field, 'resize-y')} rows={rows} value={value.join('\n')} placeholder={placeholder} onChange={(e) => onChange(e.target.value.split('\n'))} />
      <p className="mt-0.5 text-[11px] text-subtle">One per line.</p>
    </div>
  );
}

function IconAction({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-35', danger && 'hover:text-danger')}
    >
      {children}
    </button>
  );
}

function move<T>(xs: T[], i: number, by: -1 | 1): T[] {
  const next = [...xs];
  const [x] = next.splice(i, 1);
  next.splice(i + by, 0, x!);
  return next;
}

const QUESTION_TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'mcq', label: 'Multiple choice' },
  { value: 'true-false', label: 'True / False' },
  { value: 'fill-blank', label: 'Fill in the blank' },
  { value: 'short-answer', label: 'Short answer' },
  { value: 'match', label: 'Match the following' },
  { value: 'word-problem', label: 'Word problem' },
];
const hasOptions = (t: QuestionType) => t === 'mcq' || t === 'true-false' || t === 'match';

export const newQuestion = (): DraftQuestion => ({ key: k(), type: 'mcq', prompt: '', options: ['', ''], answer: '', difficulty: 'easy', explanation: '' });

function QuestionList({ id, title, icon: Icon, items, onChange, onRegenerate, busy }: { id: string; title: string; icon: typeof ListChecks; items: DraftQuestion[]; onChange: (v: DraftQuestion[]) => void; onRegenerate?: () => void; busy?: boolean }) {
  const set = (i: number, patch: Partial<DraftQuestion>) => onChange(items.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
          <Icon aria-hidden className="h-4 w-4 text-accent" />
          {title} · {items.length}
        </p>
        <div className="flex gap-1.5">
          {onRegenerate && (
            <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={onRegenerate} disabled={busy} aria-label={`Regenerate ${title.toLowerCase()}`}>
              {busy ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw aria-hidden className="h-3.5 w-3.5" />}
              Regenerate
            </Button>
          )}
          <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => onChange([...items, newQuestion()])} aria-label={`Add to ${title.toLowerCase()}`}>
            <Plus aria-hidden className="h-3.5 w-3.5" />
            Add Question
          </Button>
        </div>
      </div>
      <ol className="space-y-2">
        {items.map((q, i) => {
          const qid = `${id}-${q.key}`;
          const answerMissing = q.answer.trim() !== '' && hasOptions(q.type) && !q.options.map((o) => o.trim()).includes(q.answer.trim());
          return (
            <li key={q.key} className="rounded-xl border border-border bg-surface p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_120px]">
                <div>
                  <Label htmlFor={`${qid}-p`}>Question {i + 1}</Label>
                  <input id={`${qid}-p`} className={field} value={q.prompt} onChange={(e) => set(i, { prompt: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor={`${qid}-t`}>Type</Label>
                  <select
                    id={`${qid}-t`}
                    className={field}
                    value={q.type}
                    onChange={(e) => {
                      const type = e.target.value as QuestionType;
                      set(i, { type, options: type === 'true-false' ? ['True', 'False'] : hasOptions(type) ? (q.options.length ? q.options : ['', '']) : [] });
                    }}
                  >
                    {QUESTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor={`${qid}-d`}>Difficulty</Label>
                  <select id={`${qid}-d`} className={field} value={q.difficulty ?? ''} onChange={(e) => set(i, { difficulty: (e.target.value || null) as ChapterDifficulty | null })}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {hasOptions(q.type) && (
                  <div>
                    <Label htmlFor={`${qid}-o`}>Options</Label>
                    <textarea id={`${qid}-o`} rows={Math.max(2, q.options.length)} className={cn(field, 'resize-y')} value={q.options.join('\n')} onChange={(e) => set(i, { options: e.target.value.split('\n') })} />
                  </div>
                )}
                <div className={cn(!hasOptions(q.type) && 'sm:col-span-2 grid gap-2 sm:grid-cols-2')}>
                  <div>
                    <Label htmlFor={`${qid}-a`}>Answer</Label>
                    {hasOptions(q.type) ? (
                      <select id={`${qid}-a`} className={cn(field, answerMissing && 'border-danger')} value={q.answer} onChange={(e) => set(i, { answer: e.target.value })}>
                        <option value="">Choose the right option…</option>
                        {q.options.filter((o) => o.trim()).map((o) => (
                          <option key={o} value={o.trim()}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input id={`${qid}-a`} className={field} value={q.answer} onChange={(e) => set(i, { answer: e.target.value })} />
                    )}
                  </div>
                  <div className={cn(hasOptions(q.type) && 'mt-2')}>
                    <Label htmlFor={`${qid}-e`}>Why (optional)</Label>
                    <input id={`${qid}-e`} className={field} value={q.explanation} onChange={(e) => set(i, { explanation: e.target.value })} />
                  </div>
                </div>
              </div>
              <div className="mt-2 flex justify-end gap-0.5">
                <IconAction label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => onChange(move(items, i, -1))}>
                  <ArrowUp className="h-4 w-4" />
                </IconAction>
                <IconAction label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => onChange(move(items, i, 1))}>
                  <ArrowDown className="h-4 w-4" />
                </IconAction>
                <IconAction label={`Duplicate question ${i + 1}`} onClick={() => onChange([...items.slice(0, i + 1), { ...q, key: k(), options: [...q.options] }, ...items.slice(i + 1)])}>
                  <Copy className="h-4 w-4" />
                </IconAction>
                <IconAction label={`Delete question ${i + 1}`} danger onClick={() => onChange(items.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </IconAction>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ------------------------------------------------------------------------------------ the editor

export interface Regenerators {
  chapter?: (index: number) => Promise<DraftChapter>;
  lesson?: (chapterIndex: number, lessonIndex: number) => Promise<DraftLesson>;
  questions?: (chapterIndex: number, lessonIndex: number, count: number) => Promise<DraftQuestion[]>;
}

const STATUS_STYLE: Record<ChapterStatus, string> = {
  draft: 'border-sky-400/30 bg-sky-500/12 text-sky-600 dark:text-sky-300',
  published: 'border-emerald-400/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-300',
  hidden: 'border-amber-400/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
};

export function CourseEditor({
  value,
  onChange,
  regenerate,
  statusEditable = true,
  newChapterStatus = 'draft',
}: {
  value: DraftCourse;
  onChange: (next: DraftCourse) => void;
  regenerate?: Regenerators;
  /** Per-chapter status (editing a saved course); a new course is saved as drafts as a whole. */
  statusEditable?: boolean;
  newChapterStatus?: ChapterStatus;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(value.chapters.slice(0, 1).map((c) => c.key)));
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const c = counts(value);

  const setChapters = (chapters: DraftChapter[]) => onChange({ ...value, chapters });
  const setChapter = (i: number, patch: Partial<DraftChapter>) => setChapters(value.chapters.map((ch, j) => (j === i ? { ...ch, ...patch } : ch)));
  const setLesson = (ci: number, li: number, patch: Partial<DraftLesson>) => setChapter(ci, { lessons: value.chapters[ci]!.lessons.map((l, j) => (j === li ? { ...l, ...patch } : l)) });
  const toggle = (key: string) => setOpen((s) => (s.has(key) ? new Set([...s].filter((x) => x !== key)) : new Set([...s, key])));

  /** Runs one regeneration; on success only that item changes (ids are kept so saved progress stays). */
  async function run(tag: string, work: () => Promise<void>) {
    setBusy(tag);
    setError('');
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Regeneration failed — nothing was changed.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="surface-card rounded-2xl border border-border bg-surface p-4 shadow-card sm:p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <Label htmlFor="course-title">Course title</Label>
            <input id="course-title" className={field} value={value.title} maxLength={120} onChange={(e) => onChange({ ...value, title: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="course-desc">Description</Label>
            <input id="course-desc" className={field} value={value.description} maxLength={500} onChange={(e) => onChange({ ...value, description: e.target.value })} />
          </div>
          <div className="lg:col-span-2">
            <LinesField id="course-objectives" label="Learning objectives" value={value.objectives} rows={2} onChange={(objectives) => onChange({ ...value, objectives })} />
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-foreground-soft" aria-label="Course size">
          {[`${c.chapters} chapters`, `${c.lessons} lessons`, `${c.questions} questions`, ...(c.minutes ? [`about ${Math.round(c.minutes / 60) || 1} h of learning`] : [])].map((t) => (
            <li key={t} className="rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">
              {t}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-foreground">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {value.chapters.map((ch, ci) => {
          const isOpen = open.has(ch.key);
          const qCount = ch.quiz.length + ch.lessons.reduce((n, l) => n + l.questions.length + l.practice.length, 0);
          return (
            <li key={ch.key} className={cn('rounded-2xl border border-border bg-surface shadow-card transition-shadow', isOpen && 'shadow-lift')}>
              <div className="flex flex-wrap items-center gap-2 p-3 sm:p-4">
                <button type="button" onClick={() => toggle(ch.key)} aria-expanded={isOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/12 text-sm font-bold text-accent">
                    {ci + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{ch.title || 'Untitled chapter'}</span>
                    <span className="block text-xs text-muted">
                      {ch.lessons.length} lessons · {qCount} questions
                      {ch.academicYear ? ` · ${ch.month ? monthName(ch.month) + ' ' : ''}${ch.academicYear}` : ' · no month yet'}
                    </span>
                  </span>
                  <ChevronDown aria-hidden className={cn('ml-auto h-5 w-5 shrink-0 text-muted transition-transform', isOpen && 'rotate-180')} />
                </button>
                {statusEditable ? (
                  <select aria-label={`Status of chapter ${ci + 1}`} value={ch.status} onChange={(e) => setChapter(ci, { status: e.target.value as ChapterStatus })} className={cn('h-8 rounded-full border px-2.5 text-xs font-semibold', STATUS_STYLE[ch.status])}>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="hidden">Hidden</option>
                  </select>
                ) : (
                  <span className={cn('rounded-full border px-2.5 py-1 text-xs font-semibold', STATUS_STYLE[ch.status])}>{ch.status === 'draft' ? 'Draft' : ch.status === 'published' ? 'Published' : 'Hidden'}</span>
                )}
                <span className="flex">
                  {regenerate?.chapter && (
                    <IconAction
                      label={`Regenerate chapter ${ci + 1}`}
                      disabled={busy !== null}
                      onClick={() => run(`c${ch.key}`, async () => {
                        const fresh = await regenerate.chapter!(ci);
                        // Same place, same id (if saved) and status: only this chapter's content changes.
                        setChapter(ci, { ...fresh, key: ch.key, id: ch.id, status: ch.status, academicYear: ch.academicYear, month: ch.month, scheduleEdited: ch.scheduleEdited });
                      })}
                    >
                      {busy === `c${ch.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </IconAction>
                  )}
                  <IconAction label={`Move chapter ${ci + 1} up`} disabled={ci === 0} onClick={() => setChapters(move(value.chapters, ci, -1))}>
                    <ArrowUp className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={`Move chapter ${ci + 1} down`} disabled={ci === value.chapters.length - 1} onClick={() => setChapters(move(value.chapters, ci, 1))}>
                    <ArrowDown className="h-4 w-4" />
                  </IconAction>
                  <IconAction
                    label={`Duplicate chapter ${ci + 1}`}
                    onClick={() => setChapters([...value.chapters.slice(0, ci + 1), { ...toDraftChapter(toPlainChapter(ch), newChapterStatus), title: `${ch.title} (copy)` }, ...value.chapters.slice(ci + 1)])}
                  >
                    <Copy className="h-4 w-4" />
                  </IconAction>
                  <IconAction label={`Delete chapter ${ci + 1}`} danger onClick={() => setChapters(value.chapters.filter((_, j) => j !== ci))}>
                    <Trash2 className="h-4 w-4" />
                  </IconAction>
                </span>
              </div>

              {isOpen && (
                <div className="space-y-4 border-t border-border p-3 sm:p-4">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_150px]">
                    <div>
                      <Label htmlFor={`${ch.key}-t`}>Chapter title</Label>
                      <input id={`${ch.key}-t`} className={field} value={ch.title} maxLength={120} onChange={(e) => setChapter(ci, { title: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`${ch.key}-d`}>Description</Label>
                      <input id={`${ch.key}-d`} className={field} value={ch.description} maxLength={500} onChange={(e) => setChapter(ci, { description: e.target.value })} />
                    </div>
                    <div>
                      <Label htmlFor={`${ch.key}-df`}>Difficulty</Label>
                      <select id={`${ch.key}-df`} className={field} value={ch.difficulty ?? ''} onChange={(e) => setChapter(ci, { difficulty: (e.target.value || null) as ChapterDifficulty | null })}>
                        <option value="">—</option>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <ScheduleFields
                      compact
                      value={scheduleToValue(ch)}
                      onChange={(v) => setChapter(ci, { ...valueToSchedule(v), scheduleEdited: true })}
                      inUse={value.chapters.map((x) => x.academicYear)}
                    />
                    <p className="mt-1 text-[11px] text-subtle">Learners see this chapter in the year and month chosen here. Leave it unscheduled to list it under “Anytime”.</p>
                  </div>
                  <LinesField id={`${ch.key}-o`} label="Learning objectives" value={ch.objectives} rows={2} onChange={(objectives) => setChapter(ci, { objectives })} />
                  <div>
                    <Label htmlFor={`${ch.key}-s`}>Chapter summary</Label>
                    <textarea id={`${ch.key}-s`} rows={2} className={cn(field, 'resize-y')} value={ch.summary} maxLength={1500} onChange={(e) => setChapter(ci, { summary: e.target.value })} placeholder="What learners should remember from this chapter." />
                  </div>

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                      <BookOpen aria-hidden className="h-4 w-4 text-accent" />
                      Lessons · {ch.lessons.length}
                    </p>
                    {ch.lessons.map((l, li) => {
                      const lessonOpen = openLesson === l.key;
                      return (
                        <div key={l.key} className="rounded-xl border border-border bg-surface-elevated/60">
                          <div className="flex flex-wrap items-center gap-1 p-2.5">
                            <button type="button" onClick={() => setOpenLesson(lessonOpen ? null : l.key)} aria-expanded={lessonOpen} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left">
                              <span className="text-xs font-bold tabular-nums text-muted">{li + 1}.</span>
                              <span className="truncate text-sm font-medium text-foreground">{l.title || 'Untitled lesson'}</span>
                              <span className="shrink-0 text-xs text-subtle">· {l.questions.length} Q</span>
                              <ChevronDown aria-hidden className={cn('ml-auto h-4 w-4 shrink-0 text-muted transition-transform', lessonOpen && 'rotate-180')} />
                            </button>
                            {regenerate?.lesson && (
                              <IconAction
                                label={`Regenerate lesson ${li + 1} of chapter ${ci + 1}`}
                                disabled={busy !== null}
                                onClick={() => run(`l${l.key}`, async () => {
                                  const fresh = await regenerate.lesson!(ci, li);
                                  setLesson(ci, li, { ...fresh, key: l.key, id: l.id });
                                })}
                              >
                                {busy === `l${l.key}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                              </IconAction>
                            )}
                            <IconAction label={`Move lesson ${li + 1} up`} disabled={li === 0} onClick={() => setChapter(ci, { lessons: move(ch.lessons, li, -1) })}>
                              <ArrowUp className="h-4 w-4" />
                            </IconAction>
                            <IconAction label={`Move lesson ${li + 1} down`} disabled={li === ch.lessons.length - 1} onClick={() => setChapter(ci, { lessons: move(ch.lessons, li, 1) })}>
                              <ArrowDown className="h-4 w-4" />
                            </IconAction>
                            <IconAction
                              label={`Duplicate lesson ${li + 1}`}
                              onClick={() => setChapter(ci, { lessons: [...ch.lessons.slice(0, li + 1), { ...toDraftLesson({ ...toPlainLesson(l), number: 0 }), title: `${l.title} (copy)` }, ...ch.lessons.slice(li + 1)] })}
                            >
                              <Copy className="h-4 w-4" />
                            </IconAction>
                            <IconAction label={`Delete lesson ${li + 1}`} danger onClick={() => setChapter(ci, { lessons: ch.lessons.filter((_, j) => j !== li) })}>
                              <Trash2 className="h-4 w-4" />
                            </IconAction>
                          </div>
                          {lessonOpen && (
                            <div className="space-y-3 border-t border-border p-3">
                              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
                                <div>
                                  <Label htmlFor={`${l.key}-t`}>Lesson title</Label>
                                  <input id={`${l.key}-t`} className={field} value={l.title} maxLength={120} onChange={(e) => setLesson(ci, li, { title: e.target.value })} />
                                </div>
                                <div>
                                  <Label htmlFor={`${l.key}-m`}>Minutes</Label>
                                  <input id={`${l.key}-m`} type="number" min={0} max={1000} className={field} value={l.estimatedMinutes ?? ''} onChange={(e) => setLesson(ci, li, { estimatedMinutes: e.target.value === '' ? null : Number(e.target.value) })} />
                                </div>
                              </div>
                              <div>
                                <Label htmlFor={`${l.key}-x`}>Lesson content (explanation)</Label>
                                <textarea id={`${l.key}-x`} rows={5} className={cn(field, 'resize-y')} value={l.explanation} onChange={(e) => setLesson(ci, li, { explanation: e.target.value })} />
                              </div>
                              <div className="grid gap-3 sm:grid-cols-2">
                                <LinesField id={`${l.key}-ex`} label="Examples" value={l.examples} onChange={(examples) => setLesson(ci, li, { examples })} />
                                <LinesField id={`${l.key}-kp`} label="Key points" value={l.keyPoints} onChange={(keyPoints) => setLesson(ci, li, { keyPoints })} />
                              </div>
                              <QuestionList
                                id={`${l.key}-q`}
                                title="Questions"
                                icon={ListChecks}
                                items={l.questions}
                                onChange={(questions) => setLesson(ci, li, { questions })}
                                busy={busy === `q${l.key}`}
                                onRegenerate={
                                  regenerate?.questions
                                    ? () =>
                                        run(`q${l.key}`, async () => {
                                          setLesson(ci, li, { questions: await regenerate.questions!(ci, li, Math.max(1, l.questions.length)) });
                                        })
                                    : undefined
                                }
                              />
                              <QuestionList id={`${l.key}-p`} title="Practice" icon={PencilRuler} items={l.practice} onChange={(practice) => setLesson(ci, li, { practice })} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="gap-1.5"
                      onClick={() => {
                        const fresh: DraftLesson = { key: k(), title: `Lesson ${ch.lessons.length + 1}`, explanation: '', examples: [], keyPoints: [], questions: [], practice: [], estimatedMinutes: null };
                        setChapter(ci, { lessons: [...ch.lessons, fresh] });
                        setOpenLesson(fresh.key);
                      }}
                    >
                      <Plus aria-hidden className="h-4 w-4" />
                      Add Lesson
                    </Button>
                  </div>

                  <QuestionList id={`${ch.key}-quiz`} title="Chapter quiz" icon={ListChecks} items={ch.quiz} onChange={(quiz) => setChapter(ci, { quiz })} />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="secondary"
        className="gap-2"
        onClick={() => {
          const fresh: DraftChapter = { key: k(), title: `Chapter ${value.chapters.length + 1}`, description: '', summary: '', objectives: [], difficulty: null, status: newChapterStatus, lessons: [], quiz: [] };
          setChapters([...value.chapters, fresh]);
          setOpen((s) => new Set([...s, fresh.key]));
        }}
      >
        <Plus aria-hidden className="h-4 w-4" />
        Add Chapter
      </Button>
    </div>
  );
}

const toPlainLesson = (l: DraftLesson) => ({ ...l, questions: l.questions.map(plainQuestion), practice: l.practice.map(plainQuestion), id: undefined });
const toPlainChapter = (c: DraftChapter) =>
  ({ ...c, id: undefined, lessons: c.lessons.map((l, i) => ({ ...toPlainLesson(l), number: i + 1 })), quiz: c.quiz.map(plainQuestion), activities: [], slug: '', lessonCount: 0, questionCount: 0, estimatedMinutes: null }) as unknown as CurriculumChapter;
