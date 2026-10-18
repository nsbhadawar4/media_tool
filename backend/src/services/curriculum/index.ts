import { z } from 'zod/v4';
import { logger } from '../../utils/logger';
import {
  GenerationValidationError,
  chapterSchema,
  lessonSchema,
  outlineSchema,
  questionSchema,
  validateChapter,
  validateLesson,
  validateOutline,
  type CourseBrief,
  type CourseChapter,
  type CourseLesson,
  type CourseOutline,
  type CourseQuestion,
} from './course';
import { AiProviderError, aiConfig, createAiProvider, type AiProvider } from './providers';
import { chapterPrompt, lessonPrompt, outlinePrompt, questionsPrompt, systemPrompt } from './prompt';
import { TemplateCourseGenerator } from './courseTemplate';

export * from './course';
export { AiProviderError, aiConfig } from './providers';
export { CLASS_DIFFICULTIES, CLASS_LANGUAGES, CURRICULUM_TYPES } from './types';

/**
 * The AI Course Generator's engine. Generation is split into small steps — the course outline,
 * then each chapter (or a single lesson, or a lesson's questions) — so the administrator sees real
 * progress, and regenerating one part never touches the others.
 *
 *   engine "ai"        the configured provider (providers.ts); an error if none is configured
 *   engine "template"  the offline template generator (courseTemplate.ts), labelled as such
 *
 * Everything returned has passed validation (course.ts). Nothing here saves anything.
 */

export type Engine = 'ai' | 'template';

/** Who wrote a piece of content — shown to administrators and stored with what is saved. */
export interface GeneratedBy {
  kind: 'ai' | 'template';
  provider: string | null;
  model: string | null;
}

const TEMPLATE_BY: GeneratedBy = { kind: 'template', provider: null, model: null };
const template = new TemplateCourseGenerator();

/** What the generator page shows: whether AI is available, and why not. */
export function engineStatus() {
  const cfg = aiConfig();
  return { ai: { ready: cfg.ready, provider: cfg.provider, model: cfg.model, problem: cfg.problem }, defaultEngine: (cfg.ready ? 'ai' : 'template') as Engine };
}

function provider(): AiProvider {
  const p = createAiProvider();
  if (!p) throw new AiProviderError('not_configured', aiConfig().problem ?? 'No AI provider is configured.');
  return p;
}

/** Asks the provider, validates, and asks once more if the first answer was not valid JSON or didn't pass validation. */
async function ask<S, T>(p: AiProvider, brief: CourseBrief, prompt: string, schema: z.ZodType<S>, name: string, maxTokens: number, check: (raw: unknown) => T): Promise<T> {
  let last: GenerationValidationError | AiProviderError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const retry =
      last instanceof GenerationValidationError
        ? `\n\nYour previous answer was rejected: ${last.problems.slice(0, 5).join('; ')}. Fix these and answer again.`
        : last
          ? '\n\nYour previous answer was not valid JSON. Answer again with one complete, valid JSON object only.'
          : '';
    try {
      const raw = await p.json({ system: systemPrompt(brief), prompt: prompt + retry, schema, name, maxTokens });
      return check(raw);
    } catch (err) {
      const malformed = err instanceof AiProviderError && err.code === 'malformed';
      if (!(err instanceof GenerationValidationError) && !malformed) throw err;
      last = err;
      logger.warn(`course generator: ${p.name} ${name} ${malformed ? 'reply was not valid JSON' : `failed validation: ${(err as GenerationValidationError).problems.slice(0, 3).join('; ')}`} (attempt ${attempt + 1})`);
    }
  }
  throw last!;
}

const by = (p: AiProvider): GeneratedBy => ({ kind: 'ai', provider: p.name, model: p.model });

export async function generateOutline(brief: CourseBrief, engine: Engine): Promise<{ outline: CourseOutline; by: GeneratedBy }> {
  if (engine === 'template') return { outline: validateOutline(template.outline(brief), brief), by: TEMPLATE_BY };
  const p = provider();
  const outline = await ask(p, brief, outlinePrompt(brief), outlineSchema, 'course_outline', 4000, (raw) => validateOutline(raw, brief));
  return { outline, by: by(p) };
}

export async function generateChapter(brief: CourseBrief, outline: CourseOutline, index: number, engine: Engine, seed = ''): Promise<{ chapter: CourseChapter; by: GeneratedBy }> {
  if (engine === 'template') return { chapter: validateChapter(template.chapter(brief, outline, index, seed), brief), by: TEMPLATE_BY };
  const p = provider();
  const chapter = await ask(p, brief, chapterPrompt(brief, outline, index), chapterSchema, 'course_chapter', 16000, (raw) => validateChapter(raw, brief));
  return { chapter, by: by(p) };
}

export async function generateLesson(brief: CourseBrief, chapter: { title: string; description: string; lessonTitles: string[] }, index: number, engine: Engine, seed = ''): Promise<{ lesson: CourseLesson; by: GeneratedBy }> {
  if (engine === 'template') return { lesson: validateLesson(template.lesson(brief, chapter, index, seed), brief.questionsPerLesson), by: TEMPLATE_BY };
  const p = provider();
  const lesson = await ask(p, brief, lessonPrompt(brief, chapter, index), lessonSchema, 'course_lesson', 8000, (raw) => validateLesson(raw, brief.questionsPerLesson));
  return { lesson, by: by(p) };
}

const questionsSchema = z.object({ questions: z.array(questionSchema) });

export async function generateQuestions(
  brief: CourseBrief,
  ctx: { chapterTitle: string; lessonIndex: number; lesson: { title: string; explanation: string } },
  count: number,
  engine: Engine,
  seed = '',
): Promise<{ questions: CourseQuestion[]; by: GeneratedBy }> {
  // Questions are validated the way a lesson's are: wrapped in a lesson with nothing else to check.
  const check = (qs: unknown) =>
    validateLesson({ title: ctx.lesson.title, explanation: ctx.lesson.explanation || ctx.lesson.title, examples: [], keyPoints: ['-'], questions: qs, practice: [], estimatedMinutes: 1 }, count).questions;
  if (engine === 'template') return { questions: check(template.questions(brief, ctx.chapterTitle, ctx.lessonIndex, count, seed)), by: TEMPLATE_BY };
  const p = provider();
  const questions = await ask(p, brief, questionsPrompt(brief, ctx.lesson, count), questionsSchema, 'lesson_questions', 6000, (raw) => check((raw as { questions?: unknown })?.questions));
  return { questions, by: by(p) };
}
