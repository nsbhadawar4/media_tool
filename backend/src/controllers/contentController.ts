import type { Request, Response } from 'express';
import { Course } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPublicCatalog, isPairAvailable } from '../services/contentService';
import { serializeCourse } from './adminContentController';

/**
 * What the site and the app read of the admin-managed content.
 *
 * The catalog is public (the home page needs it signed out) and holds nothing private: titles,
 * order and whether each entry is enabled / listed. Archived entries are left out entirely.
 */
export const getCatalog = asyncHandler(async (_req: Request, res: Response) => {
  // Revalidated on every use (Express's ETag makes an unchanged catalog a bodiless 304), so an
  // administrator switching something off is reflected at once, not after a browser cache expires.
  res.setHeader('Cache-Control', 'no-cache');
  sendSuccess(res, await getPublicCatalog());
});

/**
 * Courses for signed-in users: enabled, listed and not archived, in a class and subject that are
 * both available (class, subject and their link enabled), in the administrator's order —
 * optionally just one class and subject.
 */
export const listPublishedCourses = asyncHandler(async (req: Request, res: Response) => {
  const { classLevel, subject } = req.query as { classLevel?: number; subject?: string };
  const catalog = await getPublicCatalog();
  const filter: Record<string, unknown> = { archivedAt: null, isEnabled: true, isVisible: true };
  if (classLevel !== undefined) filter.classLevel = classLevel;
  if (subject) filter.subject = subject;
  const courses = await Course.find(filter).sort({ order: 1, _id: 1 });
  sendSuccess(
    res,
    courses
      .filter((c) => c.classLevel != null && c.subject != null && isPairAvailable(catalog, c.classLevel, c.subject))
      .map((c) => {
        const { lessons, ...rest } = serializeCourse(c);
        return { ...rest, lessonCount: lessons.length };
      }),
  );
});

/** One course by its address. Unlisted courses open by link; disabled or archived ones don't exist. */
export const getPublishedCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findOne({ slug: req.params.slug, archivedAt: null, isEnabled: true });
  // Switching a class, subject or their link off takes its courses with it.
  if (!course || course.classLevel == null || course.subject == null || !isPairAvailable(await getPublicCatalog(), course.classLevel, course.subject)) {
    throw AppError.notFound('Course not found');
  }
  sendSuccess(res, serializeCourse(course));
});
