'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ClipboardPaste, Copy, CopyPlus, FileText, ListChecks, Plus, Trash2 } from 'lucide-react';
import type { ManualChapter, ManualLesson, ManualQuestion, ManualQuestionType, ManualStatus } from '@/lib/api/manualCourses';
import {
  OPTION_LETTERS,
  QUESTION_TYPE_LABEL,
  cloneChapter,
  cloneLesson,
  cloneQuestion,
  emptyLesson,
  emptyQuestion,
  errorsUnder,
  insertAfter,
  move,
  pasted,
  removeAt,
  replaceAt,
  withOption,
  withType,
  type Clip,
  type FieldErrors,
} from '@/lib/manualCourses/builder';
import { Input, Textarea } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu';
import { cn } from '@/utils/cn';

export interface ContentEditorProps {
  chapters: ManualChapter[];
  onChange: (chapters: ManualChapter[]) => void;
  errors: FieldErrors;
  open: ReadonlySet<string>;
  setOpen: (uid: string, open: boolean) => void;
  clip: Clip | null;
  copy: (clip: Clip) => void;
  /** Deleting a part that has content asks first (the builder shows the dialog). */
  confirmDelete: (what: string, run: () => void) => void;
  notify: (message: string) => void;
}

const STATUS_OPTIONS = [
  { label: 'Published', value: 'published' },
  { label: 'Draft (hidden from learners)', value: 'draft' },
];
const TYPE_OPTIONS = (Object.keys(QUESTION_TYPE_LABEL) as ManualQuestionType[]).map((t) => ({ label: QUESTION_TYPE_LABEL[t], value: t }));

/** Chapters → lessons → questions: each collapsible, reorderable, duplicable, copyable and pasteable. */
export function ManualContentEditor(props: ContentEditorProps) {
  const { chapters, onChange, clip, copy, setOpen, notify } = props;
  const pasteChapter = (after: number) => {
    if (clip?.kind !== 'chapter') return;
    const c = pasted(clip);
    onChange(insertAfter(chapters, after, c));
    setOpen(c.uid, true);
    notify(`Pasted chapter “${c.title || 'Untitled chapter'}”.`);
  };

  return (
    <div className="space-y-3">
      {chapters.map((chapter, ci) => (
        <ChapterCard
          key={chapter.uid}
          {...props}
          chapter={chapter}
          index={ci}
          total={chapters.length}
          update={(c) => onChange(replaceAt(chapters, ci, c))}
          moveBy={(d) => onChange(move(chapters, ci, d))}
          duplicate={() => {
            const c = { ...cloneChapter(chapter), title: chapter.title ? `${chapter.title} (copy)` : '' };
            onChange(insertAfter(chapters, ci, c));
            setOpen(c.uid, true);
            notify('Chapter duplicated.');
          }}
          remove={() => onChange(removeAt(chapters, ci))}
          copyIt={() => (copy({ kind: 'chapter', title: chapter.title || 'Untitled chapter', data: chapter }), notify('Chapter copied — paste it in any course.'))}
          pasteBelow={clip?.kind === 'chapter' ? () => pasteChapter(ci) : undefined}
        />
      ))}
      {clip?.kind === 'chapter' && (
        <button
          type="button"
          onClick={() => pasteChapter(chapters.length - 1)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-accent/50 bg-accent/5 px-4 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          <ClipboardPaste aria-hidden className="h-4 w-4" />
          Paste chapter “{clip.title}”
        </button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------ shared bits

function Field({ label, id, error, hint, children }: { label: string; id: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const errProps = (error: string | undefined, id: string) => (error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {});

/** Up / down, then a menu of the rest. */
function PartControls({ name, index, total, moveBy, menu }: { name: string; index: number; total: number; moveBy: (d: -1 | 1) => void; menu: DropdownMenuItem[] }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton label={`Move ${name} up`} disabled={index === 0} onClick={() => moveBy(-1)}>
        <ArrowUp className="h-4 w-4" />
      </IconButton>
      <IconButton label={`Move ${name} down`} disabled={index === total - 1} onClick={() => moveBy(1)}>
        <ArrowDown className="h-4 w-4" />
      </IconButton>
      <DropdownMenu items={menu} triggerLabel={`More actions for ${name}`} sheetTitle={name} />
    </div>
  );
}

function Header({
  open,
  onToggle,
  eyebrow,
  title,
  meta,
  status,
  errorCount,
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  eyebrow: string;
  title: string;
  meta?: string;
  status?: ManualStatus;
  errorCount: number;
  controls: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg py-1 text-left">
        <ChevronDown aria-hidden className={cn('h-4 w-4 shrink-0 text-muted transition-transform', !open && '-rotate-90')} />
        <span className="min-w-0">
          <span className="block text-[11px] font-bold uppercase tracking-[0.12em] text-subtle">{eyebrow}</span>
          <span className={cn('block truncate font-semibold', title ? 'text-foreground' : 'italic text-muted')}>{title || 'Untitled'}</span>
        </span>
        <span className="ml-auto hidden shrink-0 items-center gap-1.5 sm:flex">
          {meta && <span className="text-xs text-muted">{meta}</span>}
          {status === 'draft' && <Badge variant="warning">Draft</Badge>}
          {errorCount > 0 && <Badge variant="danger">{errorCount === 1 ? '1 issue' : `${errorCount} issues`}</Badge>}
        </span>
      </button>
      {controls}
    </div>
  );
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

// ------------------------------------------------------------------------------------ chapter

interface ChapterCardProps extends ContentEditorProps {
  chapter: ManualChapter;
  index: number;
  total: number;
  update: (c: ManualChapter) => void;
  moveBy: (d: -1 | 1) => void;
  duplicate: () => void;
  remove: () => void;
  copyIt: () => void;
  pasteBelow?: () => void;
}

function ChapterCard(p: ChapterCardProps) {
  const { chapter, index: ci, errors, open, setOpen, clip, copy, confirmDelete, notify, update } = p;
  const at = `chapters.${ci}`;
  const isOpen = open.has(chapter.uid);
  const lessons = chapter.lessons;
  const setLessons = (next: ManualLesson[]) => update({ ...chapter, lessons: next });
  const name = `Chapter ${ci + 1}`;
  const addLesson = () => {
    const l = emptyLesson();
    setLessons([...lessons, l]);
    setOpen(l.uid, true);
  };
  const pasteLesson = (after: number) => {
    if (clip?.kind !== 'lesson') return;
    const l = pasted(clip);
    setLessons(insertAfter(lessons, after, l));
    setOpen(chapter.uid, true);
    setOpen(l.uid, true);
    notify(`Pasted lesson “${l.title || 'Untitled lesson'}”.`);
  };
  const menu: DropdownMenuItem[] = [
    { label: 'Duplicate chapter', icon: <CopyPlus className="h-4 w-4" />, onClick: p.duplicate },
    { label: 'Copy chapter', icon: <Copy className="h-4 w-4" />, onClick: p.copyIt },
    ...(p.pasteBelow ? [{ label: 'Paste chapter below', icon: <ClipboardPaste className="h-4 w-4" />, onClick: p.pasteBelow }] : []),
    ...(clip?.kind === 'lesson' ? [{ label: 'Paste lesson here', icon: <ClipboardPaste className="h-4 w-4" />, onClick: () => pasteLesson(lessons.length - 1) }] : []),
    {
      label: 'Delete chapter',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      divider: true,
      onClick: () => (lessons.length || chapter.title ? confirmDelete(`${name}${chapter.title ? ` “${chapter.title}”` : ''} and its ${plural(lessons.length, 'lesson')}`, p.remove) : p.remove()),
    },
  ];
  const questions = lessons.reduce((n, l) => n + l.questions.length, 0);

  return (
    <section aria-label={name} className={cn('rounded-2xl border bg-surface shadow-card transition-colors', errorsUnder(errors, at) ? 'border-danger/50' : 'border-border')}>
      <div className="px-3 py-2.5 sm:px-4">
        <Header
          open={isOpen}
          onToggle={() => setOpen(chapter.uid, !isOpen)}
          eyebrow={name}
          title={chapter.title}
          meta={`${plural(lessons.length, 'lesson')} · ${plural(questions, 'question')}`}
          status={chapter.status}
          errorCount={errorsUnder(errors, at)}
          controls={<PartControls name={name} index={ci} total={p.total} moveBy={p.moveBy} menu={menu} />}
        />
      </div>
      {isOpen && (
        <div className="space-y-4 border-t border-border px-3 pb-4 pt-4 sm:px-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Chapter title" id={`${at}.title`} error={errors[`${at}.title`]}>
              <Input
                id={`${at}.title`}
                value={chapter.title}
                maxLength={160}
                placeholder="e.g. Varnamala"
                onChange={(e) => update({ ...chapter, title: e.target.value })}
                {...errProps(errors[`${at}.title`], `${at}.title`)}
              />
            </Field>
            <Field label="Status" id={`${at}.status`}>
              <div className="grid">
                <Select
                  aria-label="Chapter status"
                  id={`${at}.status`}
                  value={chapter.status}
                  options={STATUS_OPTIONS}
                  onChange={(e) => update({ ...chapter, status: e.target.value as ManualStatus })}
                  className="h-[42px] w-full"
                />
              </div>
            </Field>
          </div>
          <Field label="Chapter description (optional)" id={`${at}.description`}>
            <Textarea
              id={`${at}.description`}
              rows={2}
              maxLength={1000}
              value={chapter.description}
              placeholder="What this chapter covers"
              onChange={(e) => update({ ...chapter, description: e.target.value })}
            />
          </Field>

          <div className="space-y-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-subtle">
              <FileText aria-hidden className="h-3.5 w-3.5" />
              Lessons
            </p>
            {lessons.length === 0 && <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">No lessons yet — add the first one.</p>}
            {lessons.map((lesson, li) => (
              <LessonCard
                key={lesson.uid}
                {...p}
                lesson={lesson}
                at={`${at}.lessons.${li}`}
                index={li}
                total={lessons.length}
                updateLesson={(l) => setLessons(replaceAt(lessons, li, l))}
                moveLesson={(d) => setLessons(move(lessons, li, d))}
                duplicateLesson={() => {
                  const l = { ...cloneLesson(lesson), title: lesson.title ? `${lesson.title} (copy)` : '' };
                  setLessons(insertAfter(lessons, li, l));
                  setOpen(l.uid, true);
                  notify('Lesson duplicated.');
                }}
                removeLesson={() => setLessons(removeAt(lessons, li))}
                copyLesson={() => (copy({ kind: 'lesson', title: lesson.title || 'Untitled lesson', data: lesson }), notify('Lesson copied — paste it into any chapter.'))}
                pasteLessonBelow={clip?.kind === 'lesson' ? () => pasteLesson(li) : undefined}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addLesson}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface-elevated px-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
              >
                <Plus aria-hidden className="h-4 w-4" />
                Add lesson
              </button>
              {clip?.kind === 'lesson' && (
                <button
                  type="button"
                  onClick={() => pasteLesson(lessons.length - 1)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-accent/50 bg-accent/5 px-3 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  <ClipboardPaste aria-hidden className="h-4 w-4" />
                  Paste lesson “{clip.title}”
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------------------------------------ lesson

interface LessonCardProps extends ChapterCardProps {
  lesson: ManualLesson;
  at: string;
  updateLesson: (l: ManualLesson) => void;
  moveLesson: (d: -1 | 1) => void;
  duplicateLesson: () => void;
  removeLesson: () => void;
  copyLesson: () => void;
  pasteLessonBelow?: () => void;
}

function LessonCard(p: LessonCardProps) {
  const { lesson, at, index: li, total, errors, open, setOpen, clip, copy, confirmDelete, notify, updateLesson } = p;
  const isOpen = open.has(lesson.uid);
  const questions = lesson.questions;
  const setQuestions = (next: ManualQuestion[]) => updateLesson({ ...lesson, questions: next });
  const name = `Lesson ${li + 1}`;
  const addQuestion = (type: ManualQuestionType) => {
    const q = emptyQuestion(type);
    setQuestions([...questions, q]);
    setOpen(q.uid, true);
  };
  const pasteQuestion = (after: number) => {
    if (clip?.kind !== 'question') return;
    const q = pasted(clip);
    setQuestions(insertAfter(questions, after, q));
    setOpen(lesson.uid, true);
    setOpen(q.uid, true);
    notify('Question pasted.');
  };
  const menu: DropdownMenuItem[] = [
    { label: 'Duplicate lesson', icon: <CopyPlus className="h-4 w-4" />, onClick: p.duplicateLesson },
    { label: 'Copy lesson', icon: <Copy className="h-4 w-4" />, onClick: p.copyLesson },
    ...(p.pasteLessonBelow ? [{ label: 'Paste lesson below', icon: <ClipboardPaste className="h-4 w-4" />, onClick: p.pasteLessonBelow }] : []),
    ...(clip?.kind === 'question' ? [{ label: 'Paste question here', icon: <ClipboardPaste className="h-4 w-4" />, onClick: () => pasteQuestion(questions.length - 1) }] : []),
    {
      label: 'Delete lesson',
      icon: <Trash2 className="h-4 w-4" />,
      danger: true,
      divider: true,
      onClick: () =>
        lesson.content || questions.length || lesson.title
          ? confirmDelete(`${name}${lesson.title ? ` “${lesson.title}”` : ''} and its ${plural(questions.length, 'question')}`, p.removeLesson)
          : p.removeLesson(),
    },
  ];

  return (
    <div role="group" aria-label={name} className={cn('rounded-xl border bg-surface-elevated', errorsUnder(errors, at) ? 'border-danger/50' : 'border-border')}>
      <div className="px-2.5 py-2 sm:px-3">
        <Header
          open={isOpen}
          onToggle={() => setOpen(lesson.uid, !isOpen)}
          eyebrow={name}
          title={lesson.title}
          meta={plural(questions.length, 'question')}
          status={lesson.status}
          errorCount={errorsUnder(errors, at)}
          controls={<PartControls name={name} index={li} total={total} moveBy={p.moveLesson} menu={menu} />}
        />
      </div>
      {isOpen && (
        <div className="space-y-4 border-t border-border px-3 pb-4 pt-4 sm:px-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px]">
            <Field label="Lesson title" id={`${at}.title`} error={errors[`${at}.title`]}>
              <Input
                id={`${at}.title`}
                value={lesson.title}
                maxLength={160}
                placeholder="e.g. Swar — the vowels"
                onChange={(e) => updateLesson({ ...lesson, title: e.target.value })}
                {...errProps(errors[`${at}.title`], `${at}.title`)}
              />
            </Field>
            <Field label="Status" id={`${at}.status`}>
              <div className="grid">
                <Select
                  aria-label="Lesson status"
                  id={`${at}.status`}
                  value={lesson.status}
                  options={STATUS_OPTIONS}
                  onChange={(e) => updateLesson({ ...lesson, status: e.target.value as ManualStatus })}
                  className="h-[42px] w-full"
                />
              </div>
            </Field>
          </div>
          <Field label="Lesson description (optional)" id={`${at}.description`}>
            <Input
              id={`${at}.description`}
              value={lesson.description}
              maxLength={1000}
              placeholder="One line about this lesson"
              onChange={(e) => updateLesson({ ...lesson, description: e.target.value })}
            />
          </Field>
          <Field label="Lesson content" id={`${at}.content`} hint="What learners read. Line breaks are kept.">
            <Textarea
              id={`${at}.content`}
              rows={7}
              maxLength={20000}
              value={lesson.content}
              className="resize-y"
              placeholder="Write the lesson here…"
              onChange={(e) => updateLesson({ ...lesson, content: e.target.value })}
            />
          </Field>

          <div className="space-y-2.5">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-subtle">
              <ListChecks aria-hidden className="h-3.5 w-3.5" />
              Questions <span className="font-medium normal-case tracking-normal text-muted">(optional)</span>
            </p>
            {questions.map((question, qi) => (
              <QuestionCard
                key={question.uid}
                question={question}
                at={`${at}.questions.${qi}`}
                index={qi}
                total={questions.length}
                errors={errors}
                isOpen={open.has(question.uid)}
                toggle={() => setOpen(question.uid, !open.has(question.uid))}
                update={(q) => setQuestions(replaceAt(questions, qi, q))}
                moveBy={(d) => setQuestions(move(questions, qi, d))}
                menu={[
                  {
                    label: 'Duplicate question',
                    icon: <CopyPlus className="h-4 w-4" />,
                    onClick: () => {
                      const q = cloneQuestion(question);
                      setQuestions(insertAfter(questions, qi, q));
                      setOpen(q.uid, true);
                      notify('Question duplicated.');
                    },
                  },
                  {
                    label: 'Copy question',
                    icon: <Copy className="h-4 w-4" />,
                    onClick: () => (copy({ kind: 'question', title: question.prompt.slice(0, 60) || 'Untitled question', data: question }), notify('Question copied — paste it into any lesson.')),
                  },
                  ...(clip?.kind === 'question' ? [{ label: 'Paste question below', icon: <ClipboardPaste className="h-4 w-4" />, onClick: () => pasteQuestion(qi) }] : []),
                  { label: 'Delete question', icon: <Trash2 className="h-4 w-4" />, danger: true, divider: true, onClick: () => setQuestions(removeAt(questions, qi)) },
                ]}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => addQuestion(t.value)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:border-accent hover:text-accent"
                >
                  <Plus aria-hidden className="h-4 w-4" />
                  {t.label}
                </button>
              ))}
              {clip?.kind === 'question' && (
                <button
                  type="button"
                  onClick={() => pasteQuestion(questions.length - 1)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-accent/50 bg-accent/5 px-3 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  <ClipboardPaste aria-hidden className="h-4 w-4" />
                  Paste question
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------ question

function QuestionCard({
  question: q,
  at,
  index,
  total,
  errors,
  isOpen,
  toggle,
  update,
  moveBy,
  menu,
}: {
  question: ManualQuestion;
  at: string;
  index: number;
  total: number;
  errors: FieldErrors;
  isOpen: boolean;
  toggle: () => void;
  update: (q: ManualQuestion) => void;
  moveBy: (d: -1 | 1) => void;
  menu: DropdownMenuItem[];
}) {
  const name = `Question ${index + 1}`;
  const count = errorsUnder(errors, at);
  return (
    <div role="group" aria-label={name} className={cn('rounded-xl border bg-surface', count ? 'border-danger/50' : 'border-border')}>
      <div className="px-2.5 py-1.5">
        <Header
          open={isOpen}
          onToggle={toggle}
          eyebrow={`${name} · ${QUESTION_TYPE_LABEL[q.type]}`}
          title={q.prompt}
          errorCount={count}
          controls={<PartControls name={name} index={index} total={total} moveBy={moveBy} menu={menu} />}
        />
      </div>
      {isOpen && (
        <div className="space-y-3 border-t border-border px-3 pb-3.5 pt-3.5">
          <div className="grid gap-3 sm:grid-cols-[200px_minmax(0,1fr)]">
            <Field label="Type" id={`${at}.type`}>
              <div className="grid">
                <Select
                  aria-label="Question type"
                  id={`${at}.type`}
                  value={q.type}
                  options={TYPE_OPTIONS}
                  onChange={(e) => update(withType(q, e.target.value as ManualQuestionType))}
                  className="h-[42px] w-full"
                />
              </div>
            </Field>
            <Field label="Question" id={`${at}.prompt`} error={errors[`${at}.prompt`]}>
              <Input
                id={`${at}.prompt`}
                value={q.prompt}
                maxLength={2000}
                placeholder="Ask something about the lesson"
                onChange={(e) => update({ ...q, prompt: e.target.value })}
                {...errProps(errors[`${at}.prompt`], `${at}.prompt`)}
              />
            </Field>
          </div>

          {q.type === 'mcq' && (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-foreground-soft">Options — choose the correct one</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {OPTION_LETTERS.map((letter, oi) => {
                  const value = q.options[oi] ?? '';
                  const correct = value !== '' && q.answer === value;
                  return (
                    <div key={letter} className={cn('flex items-center gap-2 rounded-xl border p-1.5 pl-2.5', correct ? 'border-success bg-success/5' : 'border-border')}>
                      <input
                        type="radio"
                        name={`${at}.answer`}
                        aria-label={`Option ${letter} is correct`}
                        checked={correct}
                        disabled={!value.trim()}
                        onChange={() => update({ ...q, answer: value })}
                        className="h-4 w-4 accent-[var(--success)]"
                      />
                      <span className="w-4 text-xs font-bold text-muted">{letter}</span>
                      <input
                        aria-label={`Option ${letter}`}
                        value={value}
                        maxLength={300}
                        placeholder={`Option ${letter}`}
                        onChange={(e) => update(withOption(q, oi, e.target.value))}
                        className="min-w-0 flex-1 bg-transparent py-1.5 text-sm text-foreground outline-none placeholder:text-muted/70"
                      />
                    </div>
                  );
                })}
              </div>
              {(errors[`${at}.options`] || errors[`${at}.answer`]) && (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {errors[`${at}.options`] ?? errors[`${at}.answer`]}
                </p>
              )}
            </fieldset>
          )}

          {q.type === 'true-false' && (
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-medium text-foreground-soft">Correct answer</legend>
              <div className="flex gap-2">
                {['True', 'False'].map((v) => (
                  <label
                    key={v}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium',
                      q.answer === v ? 'border-success bg-success/5 text-foreground' : 'border-border text-foreground-soft',
                    )}
                  >
                    <input type="radio" name={`${at}.answer`} checked={q.answer === v} onChange={() => update({ ...q, answer: v })} className="h-4 w-4 accent-[var(--success)]" />
                    {v}
                  </label>
                ))}
              </div>
              {errors[`${at}.answer`] && (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {errors[`${at}.answer`]}
                </p>
              )}
            </fieldset>
          )}

          {q.type === 'short-answer' && (
            <Field label="Expected answer" id={`${at}.answer`} error={errors[`${at}.answer`]}>
              <Input
                id={`${at}.answer`}
                value={q.answer}
                maxLength={1000}
                placeholder="The answer learners should give"
                onChange={(e) => update({ ...q, answer: e.target.value })}
                {...errProps(errors[`${at}.answer`], `${at}.answer`)}
              />
            </Field>
          )}

          <Field label="Explanation (optional)" id={`${at}.explanation`}>
            <Textarea id={`${at}.explanation`} rows={2} maxLength={2000} value={q.explanation} placeholder="Why this is the answer" onChange={(e) => update({ ...q, explanation: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  );
}
