import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import * as reviews from '../services/reviewService';
import type { AdminListQuery } from '../services/reviewService';

/**
 * Review moderation. Mounted inside the admin router, which applies requireAuth + requireAdmin to
 * every route, so none of this is reachable by a normal account. The acting administrator is
 * always req.user — never an id from the request.
 */

export const listReviews = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as unknown as AdminListQuery;
  const { reviews: rows, total } = await reviews.listForAdmin(query);
  sendSuccess(res, rows, 200, { page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) });
});

export const reviewStats = asyncHandler(async (_req: Request, res: Response) => {
  sendSuccess(res, await reviews.adminStats());
});

export const getReview = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, await reviews.getForAdmin(req.params.id));
});

async function audit(req: Request, action: 'review_approved' | 'review_rejected' | 'review_published' | 'review_unpublished' | 'review_deleted', id: string, message: string) {
  await logActivity(req, { action, targetType: 'review', targetId: new Types.ObjectId(id), message });
}

export const approveReview = asyncHandler(async (req: Request, res: Response) => {
  await reviews.approveReview(req.params.id, req.user!.id);
  await audit(req, 'review_approved', req.params.id, 'Approved and published a review');
  sendSuccess(res, await reviews.getForAdmin(req.params.id), 200, undefined, 'Review approved and published successfully.');
});

export const rejectReview = asyncHandler(async (req: Request, res: Response) => {
  const { reason } = req.body as { reason?: string };
  await reviews.rejectReview(req.params.id, req.user!.id, reason);
  await audit(req, 'review_rejected', req.params.id, 'Rejected a review');
  sendSuccess(res, await reviews.getForAdmin(req.params.id), 200, undefined, 'Review rejected.');
});

export const unpublishReview = asyncHandler(async (req: Request, res: Response) => {
  await reviews.setPublished(req.params.id, false);
  await audit(req, 'review_unpublished', req.params.id, 'Unpublished a review');
  sendSuccess(res, await reviews.getForAdmin(req.params.id), 200, undefined, 'Review unpublished.');
});

export const publishReview = asyncHandler(async (req: Request, res: Response) => {
  await reviews.setPublished(req.params.id, true);
  await audit(req, 'review_published', req.params.id, 'Published a review');
  sendSuccess(res, await reviews.getForAdmin(req.params.id), 200, undefined, 'Review published.');
});

export const deleteReview = asyncHandler(async (req: Request, res: Response) => {
  await reviews.deleteReview(req.params.id);
  await audit(req, 'review_deleted', req.params.id, 'Deleted a review');
  sendSuccess(res, { deleted: true }, 200, undefined, 'Review deleted.');
});
