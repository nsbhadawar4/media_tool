/**
 * How a lesson from the course database becomes a guided, playful flow for a young learner.
 *
 * Everything here is presentation logic over the existing lesson shape (explanation, examples,
 * keyPoints, questions, practice): no course content lives in this file. The only words in it are
 * the app's own encouragement ("Amazing!", "Not quite!"). Pure functions, no React, so they are
 * unit-tested outside Next.js (relative imports only).
 */
import type { CurriculumLesson, CurriculumQuestion } from '../api/adminClasses';

// Built with the constructor: the repo compiles for ES2017, where a literal \p{…} is rejected.
const PICTOGRAPH = new RegExp('\\p{Extended_Pictographic}', 'u');
const SECTION_HEADER = new RegExp('^\\s*((?:\\p{Extended_Pictographic}\\uFE0F?\\u200D?)+)\\s*([^:：\\n]{2,60}?)\\s*[:：]\\s*$', 'u');

type Segmenter = { segment: (s: string) => Iterable<{ segment: string }> };
const segmenter: Segmenter | null = (() => {
  const I = Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => Segmenter };
  return I.Segmenter ? new I.Segmenter(undefined, { granularity: 'grapheme' }) : null;
})();

/** User-perceived characters ("🍎", "अ", "é"), not UTF-16 units. */
export function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

export const isEmoji = (g: string): boolean => PICTOGRAPH.test(g);

// ---------------------------------------------------------------------------- the explanation

export type SectionKind = 'goal' | 'learn' | 'activity' | 'real' | 'note' | 'intro';
export interface LessonSection {
  kind: SectionKind;
  emoji: string;
  heading: string;
  lines: string[];
}

/** The emoji a generated explanation opens each of its parts with decides how that part looks. */
const KIND_BY_EMOJI: Record<string, SectionKind> = { '🎯': 'goal', '💡': 'learn', '🎈': 'activity', '🌍': 'real' };

/**
 * Splits an explanation written as "🎯 Heading:\nline\nline\n\n💡 Heading:\n…" into its parts.
 * Text without such headings (older or hand-edited lessons) becomes one intro part, never lost.
 */
export function parseExplanation(text: string): LessonSection[] {
  const sections: LessonSection[] = [];
  let current: LessonSection | null = null;
  for (const raw of (text ?? '').split(/\r?\n/)) {
    const header = SECTION_HEADER.exec(raw);
    if (header) {
      const emoji = header[1]!.replace(/️/g, '');
      current = { kind: KIND_BY_EMOJI[emoji] ?? 'note', emoji: header[1]!, heading: header[2]!.trim(), lines: [] };
      sections.push(current);
      continue;
    }
    const line = raw.trim();
    if (!line) continue;
    if (!current) {
      current = { kind: 'intro', emoji: '', heading: '', lines: [] };
      sections.push(current);
    }
    current.lines.push(line);
  }
  return sections.filter((s) => s.lines.length > 0);
}

// ----------------------------------------------------------------------------- the questions

/**
 * A run of two or more emoji inside a prompt ("How many balloons? 🎈🎈🎈") is something to look at,
 * not to read: it is lifted out to be shown large, and the rest stays as the prompt text.
 */
export function splitStage(prompt: string): { text: string; stage: string[] } {
  const g = graphemes(prompt);
  let best: { from: number; to: number; items: string[] } | null = null;
  for (let i = 0; i < g.length; i++) {
    if (!isEmoji(g[i]!)) continue;
    const items: string[] = [];
    let to = i;
    for (let j = i; j < g.length; j++) {
      if (isEmoji(g[j]!)) {
        items.push(g[j]!);
        to = j;
      } else if (!/^\s$/.test(g[j]!)) break;
    }
    if (items.length >= 2 && !best) best = { from: i, to, items };
    i = to;
    if (best) break;
  }
  if (!best) return { text: prompt, stage: [] };
  const text = (g.slice(0, best.from).join('') + ' ' + g.slice(best.to + 1).join('')).replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  return { text, stage: best.items.slice(0, 40) };
}

/** One drawn line of a question: groups of emoji joined by signs ("🍎 🍎 + 🍎 = ?"), with an optional "A:" label. */
export interface StageRow {
  label: string;
  parts: Array<{ items: string[] } | { sign: string }>;
}

const SIGNS = new Set(['+', '−', '-', '×', '=', '?']);

/** A line made only of emoji and + − × = ? (and a leading "A:" label) is a picture, not text. */
function visualRow(line: string): StageRow | null {
  const m = /^\s*(?:([A-Za-z])\s*[:：]\s*)?(.*)$/.exec(line);
  const parts: StageRow['parts'] = [];
  let items: string[] = [];
  let emoji = 0;
  for (const g of graphemes(m![2]!)) {
    if (/^\s$/.test(g)) continue;
    if (isEmoji(g)) {
      items.push(g);
      emoji++;
    } else if (SIGNS.has(g)) {
      if (items.length) parts.push({ items });
      items = [];
      parts.push({ sign: g });
    } else return null;
  }
  if (items.length) parts.push({ items });
  return emoji > 0 && emoji <= 40 ? { label: m![1] ?? '', parts } : null;
}

/**
 * Pictures a prompt asks the child to look at: every line of only emoji and signs, lifted out (at most four)
 * and drawn large; the other lines stay as the question's words. A prompt without such a line comes back whole.
 */
export function splitVisual(prompt: string): { text: string; rows: StageRow[] } {
  const rows: StageRow[] = [];
  const words: string[] = [];
  for (const line of prompt.split(/\r?\n/)) {
    const row = rows.length < 4 ? visualRow(line) : null;
    if (row) rows.push(row);
    else words.push(line);
  }
  const text = words.join('\n').trim();
  return rows.length && text ? { text, rows } : { text: prompt, rows: [] };
}

export type QuestionLayout = 'truefalse' | 'tiles' | 'choices' | 'type' | 'reflect';

/** How to present a question, from its shape alone (never from what it is about). */
export function questionLayout(q: CurriculumQuestion): QuestionLayout {
  const options = q.options.filter((o) => o.trim());
  if (options.length >= 2) {
    if (q.type === 'true-false' && options.length === 2) return 'truefalse';
    // Letters, numbers and emoji ("B", "5", "अ", "🍎") are big tiles; words and phrases are wide choices.
    return options.every((o) => graphemes(o.trim()).length <= 3) ? 'tiles' : 'choices';
  }
  const answer = (q.answer ?? '').trim();
  // A short single answer can be typed and checked; "say the first five letters" cannot.
  return answer && answer.length <= 14 && !/[,;]/.test(answer) && answer.split(/\s+/).length <= 2 ? 'type' : 'reflect';
}

/** "1, 2, ___, 4": the text on either side of the blank, or null when the prompt has none. */
export function splitBlank(prompt: string): [string, string] | null {
  const m = /_{2,}/.exec(prompt);
  return m ? [prompt.slice(0, m.index), prompt.slice(m.index + m[0].length)] : null;
}

export const normaliseAnswer = (s: string): string =>
  s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?।,]+$/g, '').trim();

/**
 * Whether `given` is the stored answer. A choice picked from the options is compared exactly: "b" and
 * "B" are different answers to a capital-letter question. Typed answers forgive case, spacing and a
 * final full stop — except a single letter, where case is the whole point.
 */
export function isCorrect(q: CurriculumQuestion, given: string, exact = false): boolean {
  const answer = (q.answer ?? '').trim();
  if (answer === '') return false;
  const same = (a: string, b: string) => a.normalize('NFC').trim() === b.normalize('NFC').trim();
  if (exact || graphemes(answer).length === 1) return same(given, answer);
  return normaliseAnswer(given) === normaliseAnswer(answer);
}

// ------------------------------------------------------------------------------------ feedback

export const CHEERS: ReadonlyArray<{ emoji: string; text: string }> = [
  { emoji: '🎉', text: 'Amazing!' },
  { emoji: '⭐', text: 'Great job!' },
  { emoji: '🌟', text: 'You got it!' },
  { emoji: '👏', text: 'Super!' },
  { emoji: '🚀', text: "You're doing great!" },
  { emoji: '🏅', text: 'Well done!' },
];

/** Never "wrong" or "incorrect": a nudge to look again. */
export const NUDGES: ReadonlyArray<{ emoji: string; text: string; hint: string }> = [
  { emoji: '💡', text: 'Almost!', hint: "Let's try again." },
  { emoji: '🤔', text: 'Not quite!', hint: 'Look carefully and try once more.' },
  { emoji: '🔎', text: 'So close!', hint: 'Take another look.' },
];

export const pick = <T,>(list: ReadonlyArray<T>, seed: number): T => list[Math.abs(seed) % list.length]!;

export const STARS_FIRST_TRY = 10;
export const STARS_RETRY = 5;
/** What finishing a lesson is worth on the class pages (derived from the existing completed-lesson progress). */
export const STARS_PER_LESSON = 10;

export const starsFor = (attempts: number): number => (attempts <= 1 ? STARS_FIRST_TRY : STARS_RETRY);

// ------------------------------------------------------------------------------------ the flow

const DIFFICULTY_ORDER: Record<string, number> = { easy: 0, medium: 1, hard: 2 };

export type Step =
  | { kind: 'learn' }
  | { kind: 'examples' }
  | { kind: 'question'; group: 'questions' | 'practice'; q: CurriculumQuestion; position: number; of: number }
  | { kind: 'finish' };

/** Easy first, hard last — but only when the data says how hard; otherwise the order it was written in. */
function byDifficulty(items: CurriculumQuestion[]): CurriculumQuestion[] {
  return items
    .map((q, i) => ({ q, i }))
    .sort((a, b) => (DIFFICULTY_ORDER[a.q.difficulty ?? ''] ?? 0) - (DIFFICULTY_ORDER[b.q.difficulty ?? ''] ?? 0) || a.i - b.i)
    .map((x) => x.q);
}

/** learn → examples → each question (then each practice) one at a time → finish. */
export function buildSteps(lesson: Pick<CurriculumLesson, 'explanation' | 'examples' | 'keyPoints' | 'questions' | 'practice'>): Step[] {
  const steps: Step[] = [{ kind: 'learn' }];
  if (lesson.examples.length > 0 || lesson.keyPoints.length > 0) steps.push({ kind: 'examples' });
  const usable = (qs: CurriculumQuestion[]) => byDifficulty(qs.filter((q) => q.prompt.trim()));
  for (const group of ['questions', 'practice'] as const) {
    const list = usable(lesson[group]);
    list.forEach((q, i) => steps.push({ kind: 'question', group, q, position: i + 1, of: list.length }));
  }
  steps.push({ kind: 'finish' });
  return steps;
}

/** 1–3 stars for a finished lesson, from how many questions were right first time. */
export function rating(firstTry: number, total: number): 1 | 2 | 3 {
  if (total === 0) return 3;
  const share = firstTry / total;
  return share >= 0.8 ? 3 : share >= 0.5 ? 2 : 1;
}

/** Up to `max` emoji found in a lesson's own text, to preview it on a card (none when there are none). */
export function previewEmoji(parts: string[], max = 3): string[] {
  const out: string[] = [];
  for (const part of parts) {
    for (const g of graphemes(part)) {
      if (isEmoji(g) && !out.includes(g)) out.push(g);
      if (out.length >= max) return out;
    }
  }
  return out;
}
