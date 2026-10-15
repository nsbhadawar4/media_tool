import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getCatalog, getPublishedCourse, listPublishedCourses } from '../controllers/contentController';
import { courseSlugParamSchema, publicCoursesQuerySchema } from '../validators/contentValidators';
import { serveContentImage } from '../controllers/adminClassController';
import { contentImageParamSchema, slugParamSchema } from '../validators/classValidators';
import { publicClassCurriculum } from '../controllers/adminCurriculumController';

const router = Router();

// Public: the home page reads it signed out. Holds no private data.
router.get('/catalog', getCatalog);
// Public: pictures administrators uploaded for classes (shown on the home page signed out).
router.get('/images/:name', validate({ params: contentImageParamSchema }), serveContentImage);
// Public: a published, visible class with its subjects and chapters (no quiz answers).
router.get('/classes/:slug/curriculum', validate({ params: slugParamSchema }), publicClassCurriculum);

// Courses are for signed-in users.
router.get('/courses', requireAuth, validate({ query: publicCoursesQuerySchema }), listPublishedCourses);
router.get('/courses/:slug', requireAuth, validate({ params: courseSlugParamSchema }), getPublishedCourse);

export default router;
