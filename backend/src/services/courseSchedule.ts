import type { FilterQuery, Types } from 'mongoose';

import { Course, type ICourse } from '../models/Course';
import { CourseProgress } from '../models/CourseProgress';
import { AppError } from '../utils/AppError';
import { monthOrder } from './academicCalendar';

/**
 * Scheduling rules shared by every place a chapter's year and month are written (the course form,
 * the chapter editor, bulk scheduling) and read (learner schedule pages, admin filters, statistics).
 */

export const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type Slot = { classLevel: number; subject: string; academicYear: string | null; month: number | null; title: string; id?: string | Types.ObjectId };

/**
 * The same chapter must not be taught twice in one slot: class + subject + year + month + title.
 * Unscheduled chapters have no slot, so they never conflict here (their addresses are unique anyway).
 * `ignore` are the chapters being replaced by this very save.
 */
export async function assertNoDuplicateInSlot(slot: Slot, ignore: Array<string | Types.ObjectId> = []) {
  if (!slot.academicYear) return;
  const filter: FilterQuery<ICourse> = {
    classLevel: slot.classLevel,
    subject: slot.subject,
    academicYear: slot.academicYear,
    month: slot.month,
    archivedAt: null,
    _id: { $nin: [...ignore, ...(slot.id ? [slot.id] : [])] },
  };
  const twin = await Course.findOne(filter, { title: 1 }).collation({ locale: 'en', strength: 2 }).lean<{ title: string } | null>();
  if (twin && sameTitle(twin.title, slot.title)) {
    throw AppError.conflict(`“${twin.title}” is already scheduled for ${slot.month ? `month ${slot.month} of ` : ''}${slot.academicYear} in this subject`);
  }
}

/** Two chapters of one save in the same slot with the same title. */
export function duplicateInBatch(items: Array<Pick<Slot, 'academicYear' | 'month' | 'title'>>): number {
  const seen = new Set<string>();
  for (const [i, c] of items.entries()) {
    if (!c.academicYear) continue;
    const key = `${c.academicYear}|${c.month ?? ''}|${c.title.trim().toLowerCase()}`;
    if (seen.has(key)) return i;
    seen.add(key);
  }
  return -1;
}

/** A chapter's schedule as an API field. */
export const scheduleOf = (c: Pick<ICourse, 'academicYear' | 'month'>) => ({ academicYear: c.academicYear ?? null, month: c.month ?? null });

/** Mongo filter for a (possibly partial) schedule. Month without a year matches nothing. */
export function scheduleFilterOf(q: { academicYear?: string; month?: number; schedule?: 'scheduled' | 'unscheduled' }): FilterQuery<ICourse> {
  if (q.schedule === 'unscheduled') return { academicYear: null };
  if (q.academicYear) return { academicYear: q.academicYear, ...(q.month ? { month: q.month } : {}) };
  if (q.month) return { _id: { $exists: false } };
  if (q.schedule === 'scheduled') return { academicYear: { $ne: null } };
  return {};
}

/** Chapters taught in the same slot as this one (the same year and month, or all unscheduled ones together). */
export const sameSlot = (a: { academicYear?: string | null; month?: number | null }, b: { academicYear?: string | null; month?: number | null }) =>
  (a.academicYear ?? null) === (b.academicYear ?? null) && (a.month ?? null) === (b.month ?? null);

// ------------------------------------------------------------------------------------ statistics

export interface CourseStat {
  id: string;
  title: string;
  slug: string;
  classLevel: number | null;
  subject: string | null;
  academicYear: string | null;
  month: number | null;
  lessons: number;
  /** Learners who opened any lesson / are part-way / finished every lesson. */
  started: number;
  inProgress: number;
  completed: number;
  /** Mean of each learner's completed ÷ total lessons, over the learners who started (0–100). */
  averageProgress: number;
  /** Mean of the learners' best chapter-quiz scores (0–100), null when nobody took the quiz. */
  averageScore: number | null;
}

/**
 * Learners per chapter, computed from the progress records — the same data learners' pages read, so
 * the two can never disagree. Only existing lessons count (a deleted lesson's old record is ignored).
 */
export async function courseStats(filter: FilterQuery<ICourse>): Promise<CourseStat[]> {
  const courses = await Course.find({ archivedAt: null, ...filter }, { title: 1, slug: 1, classLevel: 1, subject: 1, academicYear: 1, month: 1, 'lessons._id': 1 }).lean();
  if (!courses.length) return [];
  const records = await CourseProgress.find({ chapterId: { $in: courses.map((c) => c._id) } }, { chapterId: 1, lessons: 1, quiz: 1 }).lean();
  const byChapter = new Map<string, typeof records>();
  for (const r of records) byChapter.set(String(r.chapterId), [...(byChapter.get(String(r.chapterId)) ?? []), r]);
  return courses
    .map((c) => {
      const ids = new Set(c.lessons.map((l) => String(l._id)));
      const rows = byChapter.get(String(c._id)) ?? [];
      const doneOf = (r: (typeof records)[number]) => r.lessons.filter((l) => l.completedAt && ids.has(String(l.lessonId))).length;
      const touched = rows.filter((r) => r.lessons.some((l) => ids.has(String(l.lessonId))));
      const completed = ids.size ? touched.filter((r) => doneOf(r) >= ids.size).length : 0;
      const scores = rows.map((r) => r.quiz?.best).filter((n): n is number => typeof n === 'number');
      const progress = ids.size && touched.length ? touched.reduce((n, r) => n + doneOf(r) / ids.size, 0) / touched.length : 0;
      return {
        id: String(c._id),
        title: c.title,
        slug: c.slug,
        classLevel: c.classLevel ?? null,
        subject: c.subject ?? null,
        academicYear: c.academicYear ?? null,
        month: c.month ?? null,
        lessons: ids.size,
        started: touched.length,
        inProgress: touched.length - completed,
        completed,
        averageProgress: Math.round(progress * 100),
        averageScore: scores.length ? Math.round(scores.reduce((n, s) => n + s, 0) / scores.length) : null,
      };
    })
    .sort((a, b) => (a.academicYear ?? '~').localeCompare(b.academicYear ?? '~') || monthOrder(a.month ?? 99) - monthOrder(b.month ?? 99) || a.title.localeCompare(b.title));
}
