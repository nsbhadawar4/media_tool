import { Types, type PipelineStage } from 'mongoose';
import { Review, type IReview } from '../models/Review';
import { REVIEW_CATEGORIES, type ReviewCategory, type ReviewStatus } from '../config/constants';
import { AppError } from '../utils/AppError';

/**
 * Reviews: one per account, moderated, and public only when approved AND published.
 *
 * The state machine lives here and only here. Every transition is a single atomic update whose
 * filter states the state it starts from, so two administrators acting at once (or a user
 * editing while an admin approves) cannot leave a review half in one state and half in another.
 *
 *   submit            → pending  + private
 *   user edits        → pending  + private   (from any state: an edit is always re-moderated)
 *   admin approves    → approved + public    (approval publishes; no second step)
 *   admin rejects     → rejected + private
 *   admin unpublishes → approved + private   (approved reviews only)
 *   admin publishes   → approved + public    (approved reviews only)
 *   admin deletes     → gone
 */

/** What "public" means, in one place. Every public query starts from this filter. */
export const PUBLIC_FILTER = { status: 'approved' as const, isPublic: true };

/** A hook for later notifications (e.g. "your review was approved"). Nothing listens yet. */
export type ReviewEvent = 'submitted' | 'updated' | 'approved' | 'rejected' | 'published' | 'unpublished' | 'deleted';
type ReviewListener = (event: ReviewEvent, review: IReview) => void | Promise<void>;
const listeners: ReviewListener[] = [];
export function onReviewEvent(listener: ReviewListener) {
  listeners.push(listener);
}
async function emit(event: ReviewEvent, review: IReview) {
  for (const listener of listeners) {
    try {
      await listener(event, review);
    } catch {
      // A notification must never undo or block a moderation decision.
    }
  }
}

export interface ReviewInput {
  rating: number;
  reviewText: string;
  category: ReviewCategory;
}

const MODERATION_RESET = {
  status: 'pending' as const,
  isPublic: false,
  approvedAt: null,
  approvedBy: null,
  rejectedAt: null,
  rejectedBy: null,
  rejectionReason: null,
};

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export async function getOwnReview(userId: string): Promise<IReview | null> {
  return Review.findOne({ userId });
}

export async function createReview(userId: string, input: ReviewInput): Promise<IReview> {
  if (await Review.exists({ userId })) {
    throw AppError.conflict('You already submitted a review.');
  }
  try {
    const review = await Review.create({ userId, ...input, ...MODERATION_RESET });
    await emit('submitted', review);
    return review;
  } catch (err) {
    // Two submissions at once: the unique index lets exactly one through.
    if (isDuplicateKey(err)) throw AppError.conflict('You already submitted a review.');
    throw err;
  }
}

/** The owner edits their review. Whatever it was, it goes back to pending and private. */
export async function updateOwnReview(userId: string, input: ReviewInput): Promise<IReview> {
  const review = await Review.findOneAndUpdate({ userId }, { $set: { ...input, ...MODERATION_RESET } }, { new: true, runValidators: true });
  if (!review) throw AppError.notFound("You haven't submitted a review yet.");
  await emit('updated', review);
  return review;
}

function adminId(id: string) {
  return new Types.ObjectId(id);
}

export async function approveReview(id: string, admin: string): Promise<IReview> {
  const review = await Review.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        status: 'approved',
        isPublic: true,
        approvedAt: new Date(),
        approvedBy: adminId(admin),
        rejectedAt: null,
        rejectedBy: null,
        rejectionReason: null,
      },
    },
    { new: true },
  );
  if (!review) throw AppError.notFound('Review not found');
  await emit('approved', review);
  return review;
}

export async function rejectReview(id: string, admin: string, reason?: string): Promise<IReview> {
  const review = await Review.findOneAndUpdate(
    { _id: id },
    {
      $set: {
        status: 'rejected',
        isPublic: false,
        rejectedAt: new Date(),
        rejectedBy: adminId(admin),
        rejectionReason: reason?.trim() || null,
        approvedAt: null,
        approvedBy: null,
      },
    },
    { new: true },
  );
  if (!review) throw AppError.notFound('Review not found');
  await emit('rejected', review);
  return review;
}

/** Shows or hides an already approved review. Anything not approved is refused, not silently changed. */
export async function setPublished(id: string, isPublic: boolean): Promise<IReview> {
  const review = await Review.findOneAndUpdate({ _id: id, status: 'approved' }, { $set: { isPublic } }, { new: true });
  if (!review) {
    if (await Review.exists({ _id: id })) throw AppError.conflict('Only approved reviews can be published or unpublished.');
    throw AppError.notFound('Review not found');
  }
  await emit(isPublic ? 'published' : 'unpublished', review);
  return review;
}

export async function deleteReview(id: string): Promise<IReview> {
  const review = await Review.findOneAndDelete({ _id: id });
  if (!review) throw AppError.notFound('Review not found');
  await emit('deleted', review);
  return review;
}

// ---------------------------------------------------------------------------------------------
// What each audience may see
// ---------------------------------------------------------------------------------------------

/** The reviewer's own view: their words and where moderation stands. No admin ids, no internal note. */
export function toOwnReview(review: IReview) {
  return {
    id: review._id.toString(),
    rating: review.rating,
    reviewText: review.reviewText,
    category: review.category,
    status: review.status,
    isPublic: review.isPublic,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

/** "Narayan Singh" → "Narayan S."; a single name stays as it is. Never an email. */
export function displayNameFor(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Media Tool user';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Public reviews come only from accounts that still exist and are active, and only as these
 * fields. "Verified" means the review was written from a registered, active account — it is
 * derived from the user record, never claimed by the reviewer.
 */
function publicPipeline(): PipelineStage[] {
  return [
    { $match: PUBLIC_FILTER },
    { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'author', pipeline: [{ $project: { name: 1, isActive: 1 } }] } },
    { $unwind: '$author' },
    { $match: { 'author.isActive': true } },
  ];
}

export interface PublicReview {
  id: string;
  displayName: string;
  verified: boolean;
  rating: number;
  reviewText: string;
  category: ReviewCategory;
  createdAt: Date;
  approvedAt: Date | null;
}

export async function listPublicReviews(opts: { sort: 'newest' | 'rating'; limit: number; page: number }): Promise<PublicReview[]> {
  const sort: Record<string, 1 | -1> = opts.sort === 'rating' ? { rating: -1, approvedAt: -1, _id: -1 } : { approvedAt: -1, _id: -1 };
  const rows = await Review.aggregate<{ _id: Types.ObjectId; author: { name: string }; rating: number; reviewText: string; category: ReviewCategory; createdAt: Date; approvedAt: Date | null }>([
    ...publicPipeline(),
    { $sort: sort },
    { $skip: (opts.page - 1) * opts.limit },
    { $limit: opts.limit },
    { $project: { _id: 1, 'author.name': 1, rating: 1, reviewText: 1, category: 1, createdAt: 1, approvedAt: 1 } },
  ]);
  return rows.map((r) => ({
    id: r._id.toString(),
    displayName: displayNameFor(r.author?.name),
    verified: true,
    rating: r.rating,
    reviewText: r.reviewText,
    category: r.category,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
  }));
}

/** Counted from exactly the reviews the public list would show. */
export async function publicStats() {
  const [row] = await Review.aggregate<{ total: number; average: number | null; ratings: number[] }>([
    ...publicPipeline(),
    { $group: { _id: null, total: { $sum: 1 }, average: { $avg: '$rating' }, ratings: { $push: '$rating' } } },
  ]);
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const rating of row?.ratings ?? []) distribution[rating as 1 | 2 | 3 | 4 | 5] += 1;
  return {
    total: row?.total ?? 0,
    averageRating: row?.average ? Math.round(row.average * 10) / 10 : 0,
    distribution,
  };
}

// ---------------------------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------------------------

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type AdminSort = 'newest' | 'oldest' | 'rating_desc' | 'rating_asc';

export interface AdminListQuery {
  status?: ReviewStatus;
  /** public = approved AND isPublic; private = everything else. */
  visibility?: 'public' | 'private';
  rating?: number;
  category?: ReviewCategory;
  search?: string;
  sort?: AdminSort;
  page: number;
  limit: number;
}

const ADMIN_SORT: Record<AdminSort, Record<string, 1 | -1>> = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  rating_desc: { rating: -1, createdAt: -1, _id: -1 },
  rating_asc: { rating: 1, createdAt: -1, _id: -1 },
};

/** Everything an administrator needs about a review, including who wrote it (their own data). */
function toAdminReview(r: IReview & { author?: { _id: Types.ObjectId; name: string; email: string; isActive: boolean } | null }) {
  return {
    id: r._id.toString(),
    rating: r.rating,
    reviewText: r.reviewText,
    category: r.category,
    status: r.status,
    isPublic: r.isPublic,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    approvedAt: r.approvedAt,
    rejectedAt: r.rejectedAt,
    rejectionReason: r.rejectionReason,
    user: r.author ? { id: r.author._id.toString(), name: r.author.name, email: r.author.email, isActive: r.author.isActive } : null,
  };
}

export type AdminReview = ReturnType<typeof toAdminReview>;

const AUTHOR_LOOKUP: PipelineStage[] = [
  { $lookup: { from: 'users', localField: 'userId', foreignField: '_id', as: 'author', pipeline: [{ $project: { name: 1, email: 1, isActive: 1 } }] } },
  { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } },
];

export async function listForAdmin(query: AdminListQuery) {
  const match: Record<string, unknown> = {};
  if (query.status) match.status = query.status;
  if (query.rating) match.rating = query.rating;
  if (query.category && (REVIEW_CATEGORIES as readonly string[]).includes(query.category)) match.category = query.category;
  // Visibility uses the same definition as the public API, so "Public" here is exactly what visitors see.
  if (query.visibility === 'public') Object.assign(match, { status: query.status && query.status !== 'approved' ? '__none__' : 'approved', isPublic: true });
  if (query.visibility === 'private') match.$nor = [PUBLIC_FILTER];

  const pipeline: PipelineStage[] = [{ $match: match }, ...AUTHOR_LOOKUP];
  if (query.search) {
    const regex = { $regex: escapeRegex(query.search), $options: 'i' };
    pipeline.push({ $match: { $or: [{ reviewText: regex }, { 'author.name': regex }, { 'author.email': regex }] } });
  }
  pipeline.push({
    $facet: {
      rows: [{ $sort: ADMIN_SORT[query.sort ?? 'newest'] }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit }],
      total: [{ $count: 'n' }],
    },
  });
  const [result] = await Review.aggregate<{ rows: Parameters<typeof toAdminReview>[0][]; total: { n: number }[] }>(pipeline);
  return { reviews: result.rows.map(toAdminReview), total: result.total[0]?.n ?? 0 };
}

export async function getForAdmin(id: string): Promise<AdminReview> {
  const [row] = await Review.aggregate<Parameters<typeof toAdminReview>[0]>([{ $match: { _id: new Types.ObjectId(id) } }, ...AUTHOR_LOOKUP]);
  if (!row) throw AppError.notFound('Review not found');
  return toAdminReview(row);
}

export async function adminStats() {
  const [all] = await Review.aggregate<{ total: number; pending: number; approved: number; rejected: number; published: number; average: number | null }>([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        published: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'approved'] }, { $eq: ['$isPublic', true] }] }, 1, 0] } },
        average: { $avg: '$rating' },
      },
    },
  ]);
  const pub = await publicStats();
  return {
    total: all?.total ?? 0,
    pending: all?.pending ?? 0,
    approved: all?.approved ?? 0,
    rejected: all?.rejected ?? 0,
    published: all?.published ?? 0,
    /** Every submitted review, whatever its status. */
    averageAll: all?.average ? Math.round(all.average * 10) / 10 : 0,
    /** Only what the public sees. */
    averagePublic: pub.averageRating,
  };
}
