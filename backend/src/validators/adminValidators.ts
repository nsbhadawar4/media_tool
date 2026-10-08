import { z } from 'zod';
import { ACTIVITY_ACTIONS, ACTIVITY_CATEGORY_NAMES, type ActivityCategory } from '../config/constants';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const userIdParamSchema = z.object({ id: objectId });

/** An ISO date-time from the client (date filters are computed in the admin's own timezone). */
const isoDate = z.coerce.date({ invalid_type_error: 'Invalid date' });

/** `from`/`to` must make a range: refuse one that ends before it starts. */
const ordered = <T extends { from?: Date; to?: Date }>(v: T) => !(v.from && v.to && v.from > v.to);

export const listUsersQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(['user', 'admin']).optional(),
    status: z.enum(['active', 'inactive']).optional(),
    provider: z.enum(['email', 'mobile', 'google']).optional(),
    plan: z.enum(['free', 'pro', 'premium']).optional(),
    /** Signed up on or after / before. */
    from: isoDate.optional(),
    to: isoDate.optional(),
    sort: z.enum(['newest', 'oldest', 'last_login', 'last_active', 'name']).default('newest'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(25),
  })
  .refine(ordered, { message: '`from` must be before `to`', path: ['from'] });

/** A user's activity timeline, newest first. */
export const userActivityQuerySchema = z.object({
  status: z.enum(['success', 'failure']).optional(),
  category: z.enum(ACTIVITY_CATEGORY_NAMES as [ActivityCategory, ...ActivityCategory[]]).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/** Start of "today" in the admin's timezone, for the dashboard's daily figures. */
export const adminStatsQuerySchema = z.object({
  todayStart: isoDate.optional(),
});

export const setUserStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});

/**
 * `actions` is a comma-separated list (`?actions=signup,media_uploaded`), so the dashboard can
 * ask for just the events it shows; omitted, every action is returned.
 */
export const listActivityQuerySchema = z
  .object({
  actions: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value.split(',').map((a) => a.trim()).filter(Boolean) : undefined))
    .pipe(z.array(z.enum(ACTIVITY_ACTIONS)).optional()),
    category: z.enum(ACTIVITY_CATEGORY_NAMES as [ActivityCategory, ...ActivityCategory[]]).optional(),
    status: z.enum(['success', 'failure']).optional(),
    provider: z.enum(['email', 'mobile', 'google']).optional(),
    /** Only events concerning this account. */
    userId: objectId.optional(),
    /** Free text over the description, the account and what the event was about. */
    search: z.string().trim().max(100).optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
    sort: z.enum(['newest', 'oldest']).default('newest'),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })
  .refine(ordered, { message: '`from` must be before `to`', path: ['from'] });

/**
 * An administrator setting a user's subscription — e.g. activating a plan once payment has been
 * confirmed outside the app, or cancelling one. Only these fields; everything else is derived.
 */
export const updateSubscriptionSchema = z
  .object({
    plan: z.enum(['free', 'pro', 'premium']),
    subscriptionStatus: z.enum(['active', 'pending', 'cancelled']),
    /** End of the paid period; omitted/null for no end date. Never applies to Free. */
    subscriptionExpiresAt: z.coerce.date().nullable().optional(),
  })
  .strict()
  .refine((v) => !(v.plan === 'free' && v.subscriptionStatus === 'pending'), {
    message: 'The Free plan is never pending',
    path: ['subscriptionStatus'],
  })
  .refine((v) => !(v.plan === 'free' && v.subscriptionExpiresAt), {
    message: 'The Free plan has no expiry date',
    path: ['subscriptionExpiresAt'],
  })
  .refine((v) => !v.subscriptionExpiresAt || v.subscriptionExpiresAt.getTime() > Date.now(), {
    message: 'The expiry date must be in the future',
    path: ['subscriptionExpiresAt'],
  });
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
