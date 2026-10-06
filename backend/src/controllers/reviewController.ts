import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import * as reviews from '../services/reviewService';
import type { ReviewInput } from '../services/reviewService';

/**
 * A user's own review, and the public list. The reviewer is always req.user (set by requireAuth
 * from the verified session) — there is no way to name another account in these routes.
 */

export const getMyReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviews.getOwnReview(req.user!.id);
  sendSuccess(res, review ? reviews.toOwnReview(review) : null);
});

export const createMyReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviews.createReview(req.user!.id, req.body as ReviewInput);
  await logActivity(req, {
    action: 'review_submitted',
    targetType: 'review',
    targetId: review._id,
    message: `Submitted a ${review.rating}-star review`,
  });
  sendSuccess(res, reviews.toOwnReview(review), 201, undefined, 'Your review has been submitted and is waiting for approval.');
});

export const updateMyReview = asyncHandler(async (req: Request, res: Response) => {
  const review = await reviews.updateOwnReview(req.user!.id, req.body as ReviewInput);
  await logActivity(req, {
    action: 'review_updated',
    targetType: 'review',
    targetId: review._id,
    message: 'Updated their review (sent back for approval)',
  });
  sendSuccess(res, reviews.toOwnReview(review), 200, undefined, 'Your updated review has been submitted for approval.');
});

/** No session needed. Only approved + published reviews, only safe fields. */
export const getPublicReviews = asyncHandler(async (req: Request, res: Response) => {
  const { sort, page, limit } = req.query as unknown as { sort: 'newest' | 'rating'; page: number; limit: number };
  const [list, stats] = await Promise.all([reviews.listPublicReviews({ sort, page, limit }), reviews.publicStats()]);
  // Cacheable by browsers and CDNs for a short while; moderation shows up within a minute.
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  sendSuccess(res, { reviews: list, stats }, 200, { page, limit, total: stats.total, totalPages: Math.max(1, Math.ceil(stats.total / limit)) });
});
