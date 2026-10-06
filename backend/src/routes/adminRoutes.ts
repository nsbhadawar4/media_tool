import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  listUsers,
  getUser,
  setUserStatus,
  deleteUser,
  getAdminStats,
} from '../controllers/adminController';
import {
  userIdParamSchema,
  listUsersQuerySchema,
  setUserStatusSchema,
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
import { adminReviewsQuerySchema, rejectReviewSchema, reviewIdParamSchema } from '../validators/reviewValidators';

const router = Router();

// Both guards on the whole router: a route added later cannot forget one of them.
router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/users', validate({ query: listUsersQuerySchema }), listUsers);
router.get('/users/:id', validate({ params: userIdParamSchema }), getUser);
router.patch(
  '/users/:id/status',
  validate({ params: userIdParamSchema, body: setUserStatusSchema }),
  setUserStatus,
);
router.delete('/users/:id', validate({ params: userIdParamSchema }), deleteUser);

// Review moderation (same guards as everything else in this router).
router.get('/reviews', validate({ query: adminReviewsQuerySchema }), listReviews);
router.get('/reviews/stats', reviewStats);
router.get('/reviews/:id', validate({ params: reviewIdParamSchema }), getReview);
router.patch('/reviews/:id/approve', validate({ params: reviewIdParamSchema }), approveReview);
router.patch('/reviews/:id/reject', validate({ params: reviewIdParamSchema, body: rejectReviewSchema }), rejectReview);
router.patch('/reviews/:id/unpublish', validate({ params: reviewIdParamSchema }), unpublishReview);
router.patch('/reviews/:id/publish', validate({ params: reviewIdParamSchema }), publishReview);
router.delete('/reviews/:id', validate({ params: reviewIdParamSchema }), deleteReview);

export default router;
