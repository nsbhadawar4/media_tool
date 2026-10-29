import type { ZodType } from 'zod';
import { AppError } from '../utils/AppError';
import { getPublicCatalog } from './contentService';
import { getAppearance } from './settingsService';
import { loadPublicChapter, loadPublicCurriculum, loadPublicSchedule, loadPublicSubject, type ScheduleQuery } from '../controllers/adminCurriculumController';
import { loadPublicManualCourse, loadPublicManualCourses } from '../controllers/adminManualCourseController';
import { classChapterParamSchema, classSubjectParamSchema, slugParamSchema } from '../validators/classValidators';
import { publicManualCourseParamSchema, publicManualCoursesParamSchema } from '../validators/manualCourseValidators';
import { publicScheduleQuerySchema } from '../validators/scheduleValidators';

/**
 * Public content as server-rendered pages read it: the very functions behind /api/content/*, called
 * in-process. A page never has to make an HTTP request back to its own deployment (which a host's
 * deployment protection, a rate limit or a cold instance can refuse) to read what the database holds.
 *
 * Every input goes through the same validators the routes use, and a bad one is the same AppError a
 * request would have got: 400 for a malformed address, 404 for something that isn't there or isn't
 * public. Anything else that throws is a genuine failure (database, bug) and is left to propagate.
 * Results are plain data in the shape the API sends under `data`.
 */
function parse<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw AppError.badRequest(result.error.issues[0]?.message ?? 'Invalid request');
  return result.data;
}

const query = (input: Record<string, string> | undefined) => parse(publicScheduleQuerySchema, input ?? {}) as ScheduleQuery;

export const publicContent = {
  catalog: () => getPublicCatalog(),
  appearance: () => getAppearance(),
  curriculum: (slug: string, q?: Record<string, string>) => loadPublicCurriculum(parse(slugParamSchema, { slug }).slug, query(q)),
  schedule: (slug: string) => loadPublicSchedule(parse(slugParamSchema, { slug }).slug),
  subject: (slug: string, subject: string, q?: Record<string, string>) => {
    const p = parse(classSubjectParamSchema, { slug, subject });
    return loadPublicSubject(p.slug, p.subject, query(q));
  },
  chapter: (slug: string, subject: string, chapter: string) => {
    const p = parse(classChapterParamSchema, { slug, subject, chapter });
    return loadPublicChapter(p.slug, p.subject, p.chapter);
  },
  manualCourses: (slug: string, subject: string) => {
    const p = parse(publicManualCoursesParamSchema, { slug, subject });
    return loadPublicManualCourses(p.slug, p.subject);
  },
  manualCourse: (slug: string, subject: string, course: string) => {
    const p = parse(publicManualCourseParamSchema, { slug, subject, course });
    return loadPublicManualCourse(p.slug, p.subject, p.course);
  },
};
