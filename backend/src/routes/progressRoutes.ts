import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { classProgress, classesProgress, continueLearning, lessonProgress, progressOverview, quizProgress } from '../controllers/courseProgressController';
import { slugParamSchema, subjectKey } from '../validators/classValidators';
import { academicYearField, monthField, publicScheduleQuerySchema } from '../validators/scheduleValidators';

/** Course progress: signed-in learners only, always their own (the user comes from the session). */
const router = Router();
router.use(requireAuth);

const where = {
  class: z.string().regex(/^class-(?:[1-9]|1[0-2])$/, 'Not found'),
  subject: subjectKey,
  chapter: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,62}$/, 'Not found'),
};

router.get('/classes', classesProgress);
router.get('/overview', validate({ query: z.object({ academicYear: academicYearField.optional(), month: monthField.optional() }) }), progressOverview);
router.get('/continue', validate({ query: z.object({ class: where.class.optional(), subject: subjectKey.optional() }).and(publicScheduleQuerySchema) }), continueLearning);
router.get('/classes/:slug', validate({ params: slugParamSchema, query: publicScheduleQuerySchema }), classProgress);
router.post('/lessons', validate({ body: z.object({ ...where, lesson: z.number().int().min(1).max(50), event: z.enum(['start', 'position', 'complete']), position: z.number().int().min(0).max(500).optional(), score: z.number().int().min(0).max(100).optional() }).strict().refine((b) => b.event === 'position' || b.position === undefined, { message: 'Only a position event carries a position', path: ['position'] }) }), lessonProgress);
router.post('/quiz', validate({ body: z.object({ ...where, answers: z.array(z.string().max(300)).min(1).max(30) }).strict() }), quizProgress);

export default router;
