import type { ManualChapter, ManualCounts, ManualCourseDraft, ManualLesson, ManualQuestion, ManualQuestionType } from '@/lib/api/manualCourses';

/**
 * The Manual Course builder's rules, kept free of React so they can be tested on their own: new
 * parts, copies with fresh ids, ordering, the copy/paste clipboard, and the checks for saving and
 * publishing (the server makes the same checks — these only point at the field early).
 */

/** A new id for a part of a course: 12 URL-safe characters, never reused by a copy or a paste. */
export function newUid(): string {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const QUESTION_TYPE_LABEL: Record<ManualQuestionType, string> = {
  mcq: 'Multiple choice',
  'true-false': 'True / False',
  'short-answer': 'Short answer',
};
export const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

export const emptyQuestion = (type: ManualQuestionType = 'mcq'): ManualQuestion => ({
  uid: newUid(),
  type,
  prompt: '',
  options: type === 'mcq' ? ['', '', '', ''] : [],
  answer: type === 'true-false' ? 'True' : '',
  explanation: '',
});
export const emptyLesson = (): ManualLesson => ({ uid: newUid(), title: '', description: '', content: '', status: 'published', questions: [] });
export const emptyChapter = (): ManualChapter => ({ uid: newUid(), title: '', description: '', status: 'published', lessons: [emptyLesson()] });
export const emptyDraft = (): ManualCourseDraft => ({ classLevel: null, subjectKey: '', title: '', description: '', isVisible: true, chapters: [] });

/** A question changed to another type, keeping what still fits (the prompt, the explanation). */
export function withType(q: ManualQuestion, type: ManualQuestionType): ManualQuestion {
  if (q.type === type) return q;
  return { ...q, type, options: type === 'mcq' ? ['', '', '', ''] : [], answer: type === 'true-false' ? 'True' : '' };
}

// ------------------------------------------------------------------------------------ copies

export const cloneQuestion = (q: ManualQuestion): ManualQuestion => ({ ...q, uid: newUid(), options: [...q.options] });
export const cloneLesson = (l: ManualLesson): ManualLesson => ({ ...l, uid: newUid(), questions: l.questions.map(cloneQuestion) });
export const cloneChapter = (c: ManualChapter): ManualChapter => ({ ...c, uid: newUid(), lessons: c.lessons.map(cloneLesson) });
/** A course's content with every part given a new id (the course itself keeps class and subject). */
export const cloneCourse = (d: ManualCourseDraft): ManualCourseDraft => ({ ...d, chapters: d.chapters.map(cloneChapter) });

// ------------------------------------------------------------------------------------ lists

/** The list with the item at `index` moved one place up (-1) or down (+1); unchanged at an end. */
export function move<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list];
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** The list with `item` placed right after `index` (at the end when `index` is past it). */
export function insertAfter<T>(list: readonly T[], index: number, item: T): T[] {
  const at = Math.min(Math.max(index + 1, 0), list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export const replaceAt = <T>(list: readonly T[], index: number, item: T): T[] => list.map((x, i) => (i === index ? item : x));
export const removeAt = <T>(list: readonly T[], index: number): T[] => list.filter((_, i) => i !== index);

export function countsOf(chapters: readonly ManualChapter[]): ManualCounts {
  return {
    chapters: chapters.length,
    lessons: chapters.reduce((n, c) => n + c.lessons.length, 0),
    questions: chapters.reduce((n, c) => n + c.lessons.reduce((m, l) => m + l.questions.length, 0), 0),
  };
}

// ------------------------------------------------------------------------------------ clipboard

export type ClipKind = 'course' | 'chapter' | 'lesson' | 'question';
export type Clip =
  | { kind: 'course'; title: string; data: Pick<ManualCourseDraft, 'title' | 'description' | 'chapters'> }
  | { kind: 'chapter'; title: string; data: ManualChapter }
  | { kind: 'lesson'; title: string; data: ManualLesson }
  | { kind: 'question'; title: string; data: ManualQuestion };

export const CLIP_LABEL: Record<ClipKind, string> = { course: 'course', chapter: 'chapter', lesson: 'lesson', question: 'question' };

const isText = (v: unknown): v is string => typeof v === 'string';
const isStatus = (v: unknown) => v === 'draft' || v === 'published';

function isQuestion(v: unknown): v is ManualQuestion {
  const q = v as ManualQuestion;
  return (
    Boolean(q) &&
    isText(q.uid) &&
    ['mcq', 'true-false', 'short-answer'].includes(q.type) &&
    isText(q.prompt) &&
    Array.isArray(q.options) &&
    q.options.every(isText) &&
    isText(q.answer) &&
    isText(q.explanation)
  );
}
function isLesson(v: unknown): v is ManualLesson {
  const l = v as ManualLesson;
  return Boolean(l) && isText(l.uid) && isText(l.title) && isText(l.description) && isText(l.content) && isStatus(l.status) && Array.isArray(l.questions) && l.questions.every(isQuestion);
}
function isChapter(v: unknown): v is ManualChapter {
  const c = v as ManualChapter;
  return Boolean(c) && isText(c.uid) && isText(c.title) && isText(c.description) && isStatus(c.status) && Array.isArray(c.lessons) && c.lessons.every(isLesson);
}

/** What was copied, read back safely (anything malformed — another app's data, an old shape — is null). */
export function parseClip(raw: string | null): Clip | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Clip;
    if (!v || !isText(v.title)) return null;
    if (v.kind === 'question' && isQuestion(v.data)) return v;
    if (v.kind === 'lesson' && isLesson(v.data)) return v;
    if (v.kind === 'chapter' && isChapter(v.data)) return v;
    if (v.kind === 'course' && v.data && isText(v.data.title) && isText(v.data.description) && Array.isArray(v.data.chapters) && v.data.chapters.every(isChapter)) return v;
  } catch {
    // Not ours.
  }
  return null;
}

/** A pasted copy: the same content, every part with a new id. */
export function pasted(clip: Extract<Clip, { kind: 'question' }>): ManualQuestion;
export function pasted(clip: Extract<Clip, { kind: 'lesson' }>): ManualLesson;
export function pasted(clip: Extract<Clip, { kind: 'chapter' }>): ManualChapter;
export function pasted(clip: Extract<Clip, { kind: 'course' }>): Pick<ManualCourseDraft, 'title' | 'description' | 'chapters'>;
export function pasted(clip: Clip) {
  switch (clip.kind) {
    case 'question':
      return cloneQuestion(clip.data);
    case 'lesson':
      return cloneLesson(clip.data);
    case 'chapter':
      return cloneChapter(clip.data);
    default:
      return { ...clip.data, chapters: clip.data.chapters.map(cloneChapter) };
  }
}

// ------------------------------------------------------------------------------------ checks

/** Field path → message, with the same paths the server uses (chapters.0.lessons.1.title). */
export type FieldErrors = Record<string, string>;

/** What every save needs: the class, the subject and the title. */
export function saveErrors(d: ManualCourseDraft): FieldErrors {
  const e: FieldErrors = {};
  if (!d.classLevel) e.classLevel = 'Choose a class';
  if (!d.subjectKey) e.subjectKey = 'Choose a subject';
  if (!d.title.trim()) e.title = 'Enter a title';
  return e;
}

/** What publishing needs on top: a published chapter with a published lesson; titles; valid questions. */
export function publishErrors(d: ManualCourseDraft): FieldErrors {
  const e = saveErrors(d);
  if (!d.chapters.length) e.chapters = 'Add at least one chapter';
  else if (!d.chapters.some((c) => c.status === 'published' && c.lessons.some((l) => l.status === 'published'))) e.chapters = 'Add at least one published chapter with a published lesson';
  d.chapters.forEach((c, ci) => {
    const at = `chapters.${ci}`;
    if (!c.title.trim()) e[`${at}.title`] = 'Enter a chapter title';
    c.lessons.forEach((l, li) => {
      const lat = `${at}.lessons.${li}`;
      if (!l.title.trim()) e[`${lat}.title`] = 'Enter a lesson title';
      l.questions.forEach((q, qi) => {
        const qat = `${lat}.questions.${qi}`;
        if (!q.prompt.trim()) e[`${qat}.prompt`] = 'Enter the question';
        if (q.type === 'mcq') {
          if (q.options.length !== 4 || q.options.some((o) => !o.trim())) e[`${qat}.options`] = 'Fill in all four options';
          else if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) e[`${qat}.options`] = 'The options must all be different';
          else if (!q.options.includes(q.answer)) e[`${qat}.answer`] = 'Choose the correct option';
        } else if (q.type === 'true-false') {
          if (q.answer !== 'True' && q.answer !== 'False') e[`${qat}.answer`] = 'Choose True or False';
        } else if (!q.answer.trim()) e[`${qat}.answer`] = 'Enter the expected answer';
      });
    });
  });
  return e;
}

/** Errors under one part ("chapters.1" has chapters.1.title and chapters.1.lessons.0.title). */
export const errorsUnder = (errors: FieldErrors, prefix: string) => Object.keys(errors).filter((k) => k === prefix || k.startsWith(`${prefix}.`)).length;

/** The server's details ([{ path, message }]) as field errors. */
export function serverErrors(details: unknown): FieldErrors {
  const e: FieldErrors = {};
  if (Array.isArray(details)) {
    for (const d of details as Array<{ path?: unknown; message?: unknown }>) {
      if (isText(d?.path) && isText(d?.message) && !e[d.path]) e[d.path] = d.message;
    }
  }
  return e;
}

/** An mcq's correct answer follows its option when that option is edited. */
export function withOption(q: ManualQuestion, index: number, value: string): ManualQuestion {
  const options = replaceAt(q.options.length === 4 ? q.options : ['', '', '', ''], index, value);
  const wasAnswer = q.answer !== '' && q.options[index] === q.answer;
  return { ...q, options, answer: wasAnswer ? value : q.answer };
}

/** The builder's steps, and how far along a course is (for the progress indicator). */
export const STEPS = ['Course info', 'Chapters', 'Lessons', 'Questions', 'Preview', 'Save / Publish'] as const;
export function stepsDone(d: ManualCourseDraft, saved: boolean): boolean[] {
  const c = countsOf(d.chapters);
  return [Object.keys(saveErrors(d)).length === 0, c.chapters > 0, c.lessons > 0, c.questions > 0, saved, saved && Object.keys(publishErrors(d)).length === 0];
}
