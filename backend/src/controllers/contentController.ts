import type { Request, Response } from 'express';
import { Course } from '../models/Course';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { getPublicCatalog, isPairOpen } from '../services/contentService';
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
 * Courses for signed-in users: enabled, listed, published and not archived, in a published class
 * that offers the subject — class, subject and their link all switched on and visible — in the
 * administrator's order, optionally just one class and subject. Kid Games has no say in this.
 */
export const listPublishedCourses = asyncHandler(async (req: Request, res: Response) => {
  const { classLevel, subject } = req.query as { classLevel?: number; subject?: string };
  const catalog = await getPublicCatalog();
  const filter: Record<string, unknown> = { archivedAt: null, isEnabled: true, isVisible: true, draft: { $ne: true } };
  if (classLevel !== undefined) filter.classLevel = classLevel;
  if (subject) filter.subject = subject;
  const courses = await Course.find(filter).sort({ order: 1, _id: 1 });
  sendSuccess(
    res,
    courses
      .filter((c) => c.classLevel != null && c.subject != null && isPairOpen(catalog, c.classLevel, c.subject, true))
      .map((c) => {
        // The list stays light: lesson, practice and quiz content come with the course itself.
        const { lessons, activities, quiz, resources, ...rest } = serializeCourse(c);
        return { ...rest, lessonCount: lessons.length, activityCount: activities.length, quizCount: quiz.length, resourceCount: resources.length };
      }),
  );
});

/**
 * One course by its address, under the same rules as the public chapter pages: hidden, draft,
 * switched-off or archived — the course, its class, its subject or their link — is "not found".
 */
export const getPublishedCourse = asyncHandler(async (req: Request, res: Response) => {
  const course = await Course.findOne({ slug: req.params.slug, archivedAt: null, isEnabled: true, isVisible: true, draft: { $ne: true } });
  if (!course || course.classLevel == null || course.subject == null || !isPairOpen(await getPublicCatalog(), course.classLevel, course.subject, true)) {
    throw AppError.notFound('Course not found');
  }
  sendSuccess(res, serializeCourse(course));
});
