import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { getCatalog, getPublishedCourse, listPublishedCourses } from '../controllers/contentController';
import { courseSlugParamSchema, publicCoursesQuerySchema } from '../validators/contentValidators';

const router = Router();

// Public: the home page reads it signed out. Holds no private data.
router.get('/catalog', getCatalog);

// Courses are for signed-in users.
router.get('/courses', requireAuth, validate({ query: publicCoursesQuerySchema }), listPublishedCourses);
router.get('/courses/:slug', requireAuth, validate({ params: courseSlugParamSchema }), getPublishedCourse);

export default router;
