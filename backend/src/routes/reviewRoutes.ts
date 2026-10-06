import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reviewWriteRateLimiter } from '../middleware/rateLimit';
import { createMyReview, getMyReview, getPublicReviews, updateMyReview } from '../controllers/reviewController';
import { publicReviewsQuerySchema, reviewInputSchema } from '../validators/reviewValidators';

const router = Router();

// Public: approved + published reviews only. Declared before requireAuth on purpose.
router.get('/public', validate({ query: publicReviewsQuerySchema }), getPublicReviews);

// Everything below is the signed-in user's own review.
router.use(requireAuth);
router.get('/me', getMyReview);
router.post('/', reviewWriteRateLimiter, validate({ body: reviewInputSchema }), createMyReview);
router.put('/me', reviewWriteRateLimiter, validate({ body: reviewInputSchema }), updateMyReview);

export default router;
