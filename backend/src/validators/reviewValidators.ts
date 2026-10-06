import { z } from 'zod';
import { REVIEW_CATEGORIES, REVIEW_STATUSES, REVIEW_TEXT_MAX, REVIEW_TEXT_MIN } from '../config/constants';

/**
 * Review text is untrusted: control characters are dropped, runs of blank lines are squeezed,
 * and the length is checked on what is left. It is stored as plain text and every client renders
 * it as text, so markup in it is just characters.
 */
const reviewText = z
  .string({ required_error: 'Please write a few words about your experience' })
  .transform((value) =>
    value
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  )
  .pipe(
    z
      .string()
      .min(REVIEW_TEXT_MIN, `Please write at least ${REVIEW_TEXT_MIN} characters`)
      .max(REVIEW_TEXT_MAX, `Please keep it under ${REVIEW_TEXT_MAX} characters`),
  );

/**
 * What a user may send. There is no userId (or status) field: whose review it is comes from the
 * session, and its moderation state from the server. Unknown keys are stripped by zod.
 */
export const reviewInputSchema = z.object({
  rating: z
    .number({ required_error: 'Please choose a rating', invalid_type_error: 'Rating must be a number' })
    .int('Rating must be a whole number')
    .min(1, 'Rating must be between 1 and 5')
    .max(5, 'Rating must be between 1 and 5'),
  reviewText,
  category: z.enum(REVIEW_CATEGORIES).optional().default('overall'),
});

export const publicReviewsQuerySchema = z.object({
  sort: z.enum(['newest', 'rating']).optional().default('newest'),
  page: z.coerce.number().int().positive().max(1000).default(1),
  limit: z.coerce.number().int().positive().max(50).default(12),
});

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
export const reviewIdParamSchema = z.object({ id: objectId });

export const adminReviewsQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  visibility: z.enum(['public', 'private']).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  category: z.enum(REVIEW_CATEGORIES).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'rating_desc', 'rating_asc']).optional().default('newest'),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export const rejectReviewSchema = z.object({
  reason: z.string().trim().max(300).optional(),
});
