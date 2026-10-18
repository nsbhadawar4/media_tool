import { z } from 'zod/v4';

/**
 * The AI Course Generator's vocabulary. A course is one subject of one class (Class 1 → Hindi):
 *
 *   Course → Chapter → Lesson (explanation, examples, key points, questions, practice) + chapter quiz
 *
 * Whatever writes a course — an AI provider or the template generator — returns these shapes, and
 * nothing is used (shown, or saved) before it passes validateChapter / validateOutline below.
 */

export const QUESTION_TYPES = ['mcq', 'true-false', 'fill-blank', 'short-answer', 'match', 'word-problem'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const LEVELS = ['beginner', 'basic', 'intermediate', 'advanced'] as const;
export type CourseLevel = (typeof LEVELS)[number];
export const LANGUAGES = ['english', 'hindi', 'bilingual', 'hinglish'] as const;
export type CourseLanguage = (typeof LANGUAGES)[number];
export type Difficulty = 'easy' | 'medium' | 'hard';

/** Upper bounds the generator accepts (and the editor enforces). */
export const LIMITS = { chapters: 12, lessons: 8, questions: 15, practice: 5, quiz: 15 } as const;

/** What the administrator asked for. */
export interface CourseBrief {
  classLevel: number;
  subject: { key: string; title: string };
  title: string;
  description: string;
  language: CourseLanguage;
  level: CourseLevel;
  chapters: number;
  lessonsPerChapter: number;
  questionsPerLesson: number;
  /** "Describe what you want to teach". */
  prompt: string;
  goals: string;
  include: string;
  avoid: string;
  instructions: string;
}

// The output schema, shared by the AI providers (as their response format) and the validation below.
const text = (max: number) => z.string().trim().min(1).max(max);

export const questionSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: text(500),
  /** Choices (mcq, true-false, match); empty for written answers. */
  options: z.array(text(300)),
  answer: text(300),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  /** Why the answer is right, in a sentence (may be empty). */
  explanation: z.string().trim().max(500),
});
export type CourseQuestion = z.infer<typeof questionSchema>;

export const lessonSchema = z.object({
  title: text(120),
  explanation: text(6000),
  examples: z.array(text(500)),
  keyPoints: z.array(text(300)),
  questions: z.array(questionSchema),
  practice: z.array(questionSchema),
  estimatedMinutes: z.number().int(),
});
export type CourseLesson = z.infer<typeof lessonSchema>;

export const chapterSchema = z.object({
  title: text(120),
  /** A short introduction to the chapter. */
  description: text(500),
  /** What the chapter covered, in a few sentences — read at the end. */
  summary: text(1500),
  objectives: z.array(text(300)),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  lessons: z.array(lessonSchema),
  quiz: z.array(questionSchema),
});
export type CourseChapter = z.infer<typeof chapterSchema> & { estimatedMinutes: number };

export const outlineSchema = z.object({
  /** Echoed back so a reply written for another class or subject is caught. */
  classLevel: z.number().int(),
  subject: text(60),
  title: text(120),
  description: text(500),
  objectives: z.array(text(300)),
  chapters: z.array(z.object({ title: text(120), description: text(500), lessonTitles: z.array(text(120)) })),
});
export type CourseOutline = z.infer<typeof outlineSchema>;

/** Generated content that didn't pass validation: nothing of it is used. */
export class GenerationValidationError extends Error {
  constructor(public readonly problems: string[]) {
    super(`The generated content did not pass validation: ${problems.slice(0, 3).join('; ')}${problems.length > 3 ? ` (+${problems.length - 3} more)` : ''}`);
    this.name = 'GenerationValidationError';
  }
}

const TRUE_FALSE = [['True', 'False'], ['सही', 'गलत']];

/** Text that means the content isn't really there. */
const PLACEHOLDER = /\b(lorem ipsum|coming soon|content will be added|will be added later|sample content|placeholder|tbd|todo|insert (?:text|content) here)\b|\[(?:insert|add)[^\]]*\]/i;
/** Never in content for children (a narrow list: the model is instructed far more broadly; this is the backstop). */
const UNSAFE = /\b(porn\w*|sex(?:ual|y)?|nude|nudity|kill yourself|suicide|self[- ]harm|cocaine|heroin|meth(?:amphetamine)?|gambling|casino|beer|vodka|whisk(?:e)?y|cigarettes?|vaping|gun shop|bomb[- ]making|terroris\w*)\b/i;

/** Every string in a generated object: placeholders and unsafe words are refused, wherever they are. */
export function textProblems(value: unknown, where: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      if (PLACEHOLDER.test(v)) out.push(`${path}: placeholder text ("${v.slice(0, 40)}")`);
      if (UNSAFE.test(v)) out.push(`${path}: content not suitable for children`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(value, where);
  return out.slice(0, 10);
}

/** Problems with one question, beyond its shape: its options and answer have to agree with its type. */
export function questionProblems(q: Pick<CourseQuestion, 'type' | 'options' | 'answer'>, where: string): string[] {
  const out: string[] = [];
  const opts = q.options.map((o) => o.trim());
  if (new Set(opts).size !== opts.length) out.push(`${where}: repeated options`);
  switch (q.type) {
    case 'mcq':
    case 'match':
      if (opts.length < 2) out.push(`${where}: a ${q.type} question needs at least two options`);
      else if (!opts.includes(q.answer.trim())) out.push(`${where}: the answer is not one of the options`);
      break;
    case 'true-false':
      if (!TRUE_FALSE.some((pair) => pair.length === opts.length && pair.every((p) => opts.includes(p)))) out.push(`${where}: a true/false question needs exactly the options True and False (or सही and गलत)`);
      else if (!opts.includes(q.answer.trim())) out.push(`${where}: the answer must be True or False`);
      break;
    default:
      if (opts.length && !opts.includes(q.answer.trim())) out.push(`${where}: the answer is not one of the options`);
  }
  return out;
}

function zodProblems(error: z.ZodError, prefix: string): string[] {
  return error.issues.slice(0, 10).map((i) => `${prefix}${i.path.length ? `.${i.path.join('.')}` : ''}: ${i.message}`);
}

/** A course outline with the requested number of chapters (and lesson titles for each). */
export function validateOutline(raw: unknown, brief: Pick<CourseBrief, 'chapters' | 'lessonsPerChapter'> & Partial<Pick<CourseBrief, 'classLevel' | 'subject'>>): CourseOutline {
  const parsed = outlineSchema.safeParse(raw);
  if (!parsed.success) throw new GenerationValidationError(zodProblems(parsed.error, 'outline'));
  const o = parsed.data;
  const problems: string[] = textProblems(o, 'outline');
  if (brief.classLevel !== undefined && o.classLevel !== brief.classLevel) problems.push(`written for Class ${o.classLevel}, not Class ${brief.classLevel}`);
  const named = (x: string) => x.trim().toLowerCase();
  if (brief.subject && ![named(brief.subject.title), named(brief.subject.key)].includes(named(o.subject))) problems.push(`written for the subject "${o.subject}", not "${brief.subject.title}"`);
  if (o.chapters.length !== brief.chapters) problems.push(`expected ${brief.chapters} chapters, got ${o.chapters.length}`);
  o.chapters.forEach((c, i) => {
    if (c.lessonTitles.length !== brief.lessonsPerChapter) problems.push(`chapter ${i + 1}: expected ${brief.lessonsPerChapter} lesson titles, got ${c.lessonTitles.length}`);
  });
  if (new Set(o.chapters.map((c) => c.title.toLowerCase())).size !== o.chapters.length) problems.push('chapter titles repeat');
  if (problems.length) throw new GenerationValidationError(problems);
  return o;
}

/** One lesson with exactly the requested number of questions, each consistent with its type. */
export function validateLesson(raw: unknown, questions: number, where = 'lesson'): CourseLesson {
  const parsed = lessonSchema.safeParse(raw);
  if (!parsed.success) throw new GenerationValidationError(zodProblems(parsed.error, where));
  const l = parsed.data;
  const problems: string[] = textProblems(l, where);
  if (l.questions.length !== questions) problems.push(`${where}: expected ${questions} questions, got ${l.questions.length}`);
  if (l.practice.length > LIMITS.practice) problems.push(`${where}: at most ${LIMITS.practice} practice questions`);
  if (!l.keyPoints.length) problems.push(`${where}: no key points`);
  l.questions.forEach((q, i) => problems.push(...questionProblems(q, `${where} question ${i + 1}`)));
  l.practice.forEach((q, i) => problems.push(...questionProblems(q, `${where} practice ${i + 1}`)));
  if (problems.length) throw new GenerationValidationError(problems);
  return { ...l, estimatedMinutes: Math.min(120, Math.max(1, l.estimatedMinutes)) };
}

/** One chapter: its lessons (each validated as above), a quiz, objectives. */
export function validateChapter(raw: unknown, brief: Pick<CourseBrief, 'lessonsPerChapter' | 'questionsPerLesson'>, where = 'chapter'): CourseChapter {
  const parsed = chapterSchema.safeParse(raw);
  if (!parsed.success) throw new GenerationValidationError(zodProblems(parsed.error, where));
  const c = parsed.data;
  const problems: string[] = textProblems({ title: c.title, description: c.description, summary: c.summary, objectives: c.objectives, quiz: c.quiz }, where);
  if (c.lessons.length !== brief.lessonsPerChapter) problems.push(`${where}: expected ${brief.lessonsPerChapter} lessons, got ${c.lessons.length}`);
  if (!c.objectives.length) problems.push(`${where}: no learning objectives`);
  if (c.quiz.length < 3 || c.quiz.length > LIMITS.quiz) problems.push(`${where}: the quiz needs 3–${LIMITS.quiz} questions`);
  c.quiz.forEach((q, i) => problems.push(...questionProblems(q, `${where} quiz ${i + 1}`)));
  const lessons: CourseLesson[] = [];
  c.lessons.forEach((l, i) => {
    try {
      lessons.push(validateLesson(l, brief.questionsPerLesson, `${where} lesson ${i + 1}`));
    } catch (err) {
      problems.push(...(err instanceof GenerationValidationError ? err.problems : [String(err)]));
    }
  });
  if (problems.length) throw new GenerationValidationError(problems);
  return { ...c, lessons, estimatedMinutes: lessons.reduce((n, l) => n + l.estimatedMinutes, 0) + 10 };
}
