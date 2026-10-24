import { MATH_PLAN } from './mathPlan';
import { lessonBank, type BankQuestion } from './mathBank';
import type { CourseQuestion, Difficulty } from './course';
import type { ICourseQuestion } from '../../models/Course';

/**
 * Turns a Class 1 Mathematics chapter (as stored) into the same chapter with more, varied practice
 * in every lesson. Existing questions are kept exactly as they are; new ones are appended, never
 * repeating a prompt already in the chapter. Pure: reading and saving belong to the script.
 */

export interface StoredLesson {
  title: string;
  questions: ICourseQuestion[];
  practice: ICourseQuestion[];
  estimatedMinutes: number | null;
}
export interface StoredChapter {
  order: number;
  title: string;
  slug: string;
  lessons: StoredLesson[];
}

const LEVEL_MIX: Record<1 | 2 | 3 | 4, { questions: Difficulty[]; practice: Difficulty[] }> = {
  1: { questions: ['easy', 'easy', 'easy', 'medium'], practice: ['easy', 'medium', 'medium', 'medium'] },
  2: { questions: ['easy', 'easy', 'medium', 'medium'], practice: ['medium', 'medium', 'medium', 'hard'] },
  3: { questions: ['easy', 'medium', 'medium', 'medium'], practice: ['medium', 'medium', 'hard', 'hard'] },
  4: { questions: ['medium', 'medium', 'medium', 'hard'], practice: ['medium', 'hard', 'hard', 'hard'] },
};
/** A lesson that already has more than this many questions has been expanded: it is left alone. */
export const EXPANDED_AT = 4;
/** About 35 seconds a question for a five-to-seven-year-old, rounded. */
const MINUTES_PER_QUESTION = 0.6;

export type ExpandResult =
  | { status: 'skipped'; reason: string }
  | { status: 'ok'; lessons: Array<{ questions: ICourseQuestion[]; practice: ICourseQuestion[]; estimatedMinutes: number; added: BankQuestion[] }> };

const strip = ({ kind: _kind, ...q }: BankQuestion): CourseQuestion => q;

export function expandChapter(ch: StoredChapter): ExpandResult {
  const plan = MATH_PLAN[ch.order];
  if (!plan) return { status: 'skipped', reason: 'no plan for this chapter' };
  if (plan.title !== ch.title) return { status: 'skipped', reason: `title is "${ch.title}", the plan expects "${plan.title}"` };
  if (plan.lessons.length !== ch.lessons.length) return { status: 'skipped', reason: `has ${ch.lessons.length} lessons, the plan has ${plan.lessons.length}` };
  const seen = new Set(ch.lessons.flatMap((l) => [...l.questions, ...l.practice]).map((q) => q.prompt.trim().toLowerCase()));
  const mix = LEVEL_MIX[plan.level];
  const lessons = ch.lessons.map((l, i) => {
    if (l.questions.length > EXPANDED_AT) return { questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes ?? 0, added: [] as BankQuestion[] };
    const bank = lessonBank(plan.lessons[i]!, `${ch.slug}:${i + 1}`, mix, seen);
    const added = [...bank.questions, ...bank.practice];
    return {
      questions: [...l.questions, ...bank.questions.map(strip)],
      practice: [...l.practice, ...bank.practice.map(strip)],
      estimatedMinutes: Math.min(1000, (l.estimatedMinutes ?? 0) + Math.round(added.length * MINUTES_PER_QUESTION)),
      added,
    };
  });
  return { status: 'ok', lessons };
}
