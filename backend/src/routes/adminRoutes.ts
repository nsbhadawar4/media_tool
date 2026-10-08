import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listUsers,
  getUser,
  setUserStatus,
  deleteUser,
  getAdminStats,
  listActivity,
  getUserStats,
  updateUserSubscription,
  getUserActivity,
} from '../controllers/adminController';
import {
  userIdParamSchema,
  listUsersQuerySchema,
  setUserStatusSchema,
  listActivityQuerySchema,
  updateSubscriptionSchema,
  userActivityQuerySchema,
  adminStatsQuerySchema,
} from '../validators/adminValidators';
import {
  listReviews,
  reviewStats,
  getReview,
  approveReview,
  rejectReview,
  unpublishReview,
  publishReview,
  deleteReview,
} from '../controllers/adminReviewController';
import {
  archiveContent,
  archiveCourse,
  createContent,
  createCourse,
  getContentStats,
  getCourse,
  listContent,
  listCourses,
  moveContent,
  moveCourse,
  restoreContent,
  restoreCourse,
  updateContent,
  updateCourse,
} from '../controllers/adminContentController';
import {
  contentIdParamSchema,
  createContentSchema,
  createCourseSchema,
  listContentQuerySchema,
  listCoursesQuerySchema,
  moveSchema,
  updateContentSchema,
  updateCourseSchema,
} from '../validators/contentValidators';
import { adminReviewsQuerySchema, rejectReviewSchema, reviewIdParamSchema } from '../validators/reviewValidators';

const router = Router();

// Both guards on the whole router: a route added later cannot forget one of them.
router.use(requireAuth, requireAdmin);

router.get('/stats', validate({ query: adminStatsQuerySchema }), getAdminStats);
router.get('/activity', validate({ query: listActivityQuerySchema }), listActivity);
// Before /users/:id, so "stats" is never read as an id.
router.get('/users/stats', getUserStats);
router.get('/users', validate({ query: listUsersQuerySchema }), listUsers);
router.get('/users/:id', validate({ params: userIdParamSchema }), getUser);
router.get('/users/:id/activity', validate({ params: userIdParamSchema, query: userActivityQuerySchema }), getUserActivity);
router.patch(
  '/users/:id/status',
  validate({ params: userIdParamSchema, body: setUserStatusSchema }),
  setUserStatus,
);
router.delete('/users/:id', validate({ params: userIdParamSchema }), deleteUser);
router.patch(
  '/users/:id/subscription',
  validate({ params: userIdParamSchema, body: updateSubscriptionSchema }),
  updateUserSubscription,
);

// Review moderation (same guards as everything else in this router).
router.get('/reviews', validate({ query: adminReviewsQuerySchema }), listReviews);
router.get('/reviews/stats', reviewStats);
router.get('/reviews/:id', validate({ params: reviewIdParamSchema }), getReview);
router.patch('/reviews/:id/approve', validate({ params: reviewIdParamSchema }), approveReview);
router.patch('/reviews/:id/reject', validate({ params: reviewIdParamSchema, body: rejectReviewSchema }), rejectReview);
router.patch('/reviews/:id/unpublish', validate({ params: reviewIdParamSchema }), unpublishReview);
router.patch('/reviews/:id/publish', validate({ params: reviewIdParamSchema }), publishReview);
router.delete('/reviews/:id', validate({ params: reviewIdParamSchema }), deleteReview);

// Content management: the catalog (sections, classes, subjects, Kid Games, games) and courses.
const contentId = { params: contentIdParamSchema };
router.get('/content/stats', getContentStats);
router.get('/content/items', validate({ query: listContentQuerySchema }), listContent);
router.post('/content/items', validate({ body: createContentSchema }), createContent);
router.patch('/content/items/:id', validate({ ...contentId, body: updateContentSchema }), updateContent);
router.post('/content/items/:id/move', validate({ ...contentId, body: moveSchema }), moveContent);
router.delete('/content/items/:id', validate(contentId), archiveContent);
router.post('/content/items/:id/restore', validate(contentId), restoreContent);
router.get('/content/courses', validate({ query: listCoursesQuerySchema }), listCourses);
router.post('/content/courses', validate({ body: createCourseSchema }), createCourse);
router.get('/content/courses/:id', validate(contentId), getCourse);
router.patch('/content/courses/:id', validate({ ...contentId, body: updateCourseSchema }), updateCourse);
router.post('/content/courses/:id/move', validate({ ...contentId, body: moveSchema }), moveCourse);
router.delete('/content/courses/:id', validate(contentId), archiveCourse);
router.post('/content/courses/:id/restore', validate(contentId), restoreCourse);

export default router;
