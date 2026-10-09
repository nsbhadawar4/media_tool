import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { User, accountLabel, toPublicUser } from '../models/User';
import type { UpdateSubscriptionInput } from '../validators/adminValidators';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { ActivityLog, type IActivityLog } from '../models/ActivityLog';
import { ACTIVITY_CATEGORIES, type ActivityCategory } from '../config/constants';
import {
  escapeRegex,
  pageMeta,
  planFilter,
  providerFilter,
  serializeActivity,
  userSearchFilter,
  userTimelineFilter,
} from '../services/adminQueries';
import { maskIp } from '../utils/clientInfo';
import type { FilterQuery } from 'mongoose';
import type { IUser } from '../models/User';
import { Review } from '../models/Review';
import { KidGameProfile, KidGameRecord } from '../models/KidGameProgress';
import type { ActivityAction } from '../config/constants';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';

/**
 * Administration of *accounts*, not of their contents. Nothing here reads, moves or
 * deletes a user's folders or files — an administrator can see how many a user has and
 * can suspend the account, which is enough to deal with abuse without quietly gaining
 * access to private photos.
 *
 * Every route in this file sits behind requireAuth + requireAdmin.
 */

/**
 * When each account last did anything the activity log records (uploads, edits, reviews,
 * sign-ins), keyed by user id. Served by the { performedBy, createdAt } index.
 */
async function lastActivityByUser(ids: Types.ObjectId[]): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();
  const rows = await ActivityLog.aggregate<{ _id: Types.ObjectId; at: Date }>([
    { $match: { performedBy: { $in: ids } } },
    { $group: { _id: '$performedBy', at: { $max: '$createdAt' } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), r.at]));
}

/**
 * "Last active" is the later of the newest logged action and the last sign-in. Sign-in alone
 * understates it — a session lasts days — and the log alone misses an account that signed
 * in before logging existed.
 */
function latest(...dates: (Date | null | undefined)[]): Date | null {
  const times = dates.filter((d): d is Date => d instanceof Date).map((d) => d.getTime());
  return times.length ? new Date(Math.max(...times)) : null;
}

/** Window for the "New users" figure. */
const NEW_USER_WINDOW_DAYS = 30;

/** Headline figures for /admin/users, all counted in the database. "Suspended" is isActive=false. */
export const getUserStats = asyncHandler(async (_req: Request, res: Response) => {
  const since = new Date(Date.now() - NEW_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const [total, active, newUsers, email, mobile, google, free, pro, premium] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments(providerFilter('email')),
    User.countDocuments(providerFilter('mobile')),
    User.countDocuments(providerFilter('google')),
    User.countDocuments(planFilter('free')),
    User.countDocuments(planFilter('pro')),
    User.countDocuments(planFilter('premium')),
  ]);
  sendSuccess(res, {
    total,
    active,
    suspended: total - active,
    newUsers,
    newUserWindowDays: NEW_USER_WINDOW_DAYS,
    byProvider: { email, mobile, google },
    byPlan: { free, pro, premium },
  });
});

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, status, provider, plan, from, to, sort, page, limit } = req.query as unknown as {
    search?: string;
    role?: 'user' | 'admin';
    status?: 'active' | 'inactive';
    provider?: 'email' | 'mobile' | 'google';
    plan?: 'free' | 'pro' | 'premium';
    from?: Date;
    to?: Date;
    sort: 'newest' | 'oldest' | 'last_login' | 'last_active' | 'name';
    page: number;
    limit: number;
  };

  // Every condition is ANDed; each may carry its own $or, so they're kept as separate clauses.
  const clauses: FilterQuery<IUser>[] = [];
  if (search) clauses.push(userSearchFilter(search));
  if (role) clauses.push({ role });
  if (status) clauses.push({ isActive: status === 'active' });
  if (provider) clauses.push(providerFilter(provider));
  if (plan) clauses.push(planFilter(plan));
  if (from || to) clauses.push({ createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  const filter: FilterQuery<IUser> = clauses.length ? { $and: clauses } : {};

  const order: Record<typeof sort, Record<string, 1 | -1>> = {
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    last_login: { lastLoginAt: -1, _id: -1 },
    last_active: { lastActiveAt: -1, lastLoginAt: -1, _id: -1 },
    name: { name: 1, _id: 1 },
  };

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort(order[sort])
      .collation(sort === 'name' ? { locale: 'en', strength: 2 } : { locale: 'simple' })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  // Counts are gathered per page rather than for the whole collection, so the list stays
  // cheap however many accounts exist.
  const ids = users.map((u) => u._id);
  const [folderCounts, mediaCounts, lastActive] = await Promise.all([
    Folder.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ownerId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    ]),
    Media.aggregate<{ _id: Types.ObjectId; count: number; bytes: number }>([
      { $match: { ownerId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$ownerId', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
    ]),
    lastActivityByUser(ids),
  ]);

  const foldersBy = new Map(folderCounts.map((f) => [f._id.toString(), f.count]));
  const mediaBy = new Map(mediaCounts.map((m) => [m._id.toString(), m]));

  sendSuccess(
    res,
    users.map((u) => {
      const media = mediaBy.get(u._id.toString());
      return {
        ...toPublicUser(u),
        folderCount: foldersBy.get(u._id.toString()) ?? 0,
        mediaCount: media?.count ?? 0,
        storageUsedBytes: media?.bytes ?? 0,
        lastActiveAt: latest(u.lastActiveAt, lastActive.get(u._id.toString()), u.lastLoginAt),
      };
    }),
    200,
    pageMeta(page, limit, total),
  );
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  const ownerId = user._id;
  const [
    [folderCount, imageCount, videoCount, documentCount, trashCount, sizeAgg],
    [recentActivity, lastActive, review, kidProfile, kidRecords],
  ] = await Promise.all([
    Promise.all([
    Folder.countDocuments({ ownerId, isDeleted: false }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'image' }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'video' }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'document' }),
    Media.countDocuments({ ownerId, isDeleted: true }),
    Media.aggregate<{ _id: null; total: number }>([
      { $match: { ownerId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]),
    ]),
    Promise.all([
      // What they did, what was done to their account, and what named it (failed sign-ins).
      ActivityLog.find(userTimelineFilter(user)).sort({ createdAt: -1, _id: -1 }).limit(10),
      lastActivityByUser([ownerId]),
      Review.findOne({ userId: ownerId }),
      KidGameProfile.findOne({ userId: ownerId }, { totalXp: 1, dailyStreak: 1, achievements: 1 }),
      KidGameRecord.find({ userId: ownerId }, { completed: 1, stars: 1, attempts: 1, lastPlayed: 1 }),
    ]),
  ]);

  const lastPlayed = latest(...kidRecords.map((r) => r.lastPlayed));

  sendSuccess(res, {
    user: {
      ...toPublicUser(user),
      lastActiveAt: latest(user.lastActiveAt, lastActive.get(ownerId.toString()), user.lastLoginAt),
      phoneVerifiedAt: user.phoneVerifiedAt ?? null,
      onboardingCompletedAt: user.onboardingCompletedAt ?? null,
      subscriptionStartedAt: user.subscriptionStartedAt ?? null,
      subscriptionExpiresAt: user.subscriptionExpiresAt ?? null,
      // Masked: enough to recognise a new network, never the full address.
      lastLoginIpMasked: maskIp(user.lastLoginIp),
    },
    recentActivity: await serializeActivity(recentActivity),
    review: review
      ? {
          id: review._id.toString(),
          rating: review.rating,
          reviewText: review.reviewText,
          category: review.category,
          status: review.status,
          isPublic: review.isPublic,
          createdAt: review.createdAt,
        }
      : null,
    // Null when they have never opened Kid Games; zeros would claim they played and scored nothing.
    kidGames:
      kidProfile || kidRecords.length
        ? {
            totalXp: kidProfile?.totalXp ?? 0,
            gamesPlayed: kidRecords.length,
            gamesCompleted: kidRecords.filter((r) => r.completed).length,
            totalAttempts: kidRecords.reduce((sum, r) => sum + (r.attempts ?? 0), 0),
            stars: kidRecords.reduce((sum, r) => sum + (r.stars ?? 0), 0),
            bestDailyStreak: kidProfile?.dailyStreak?.best ?? 0,
            achievements: kidProfile?.achievements?.length ?? 0,
            lastPlayedAt: lastPlayed,
          }
        : null,
    stats: {
      folderCount,
      imageCount,
      videoCount,
      documentCount,
      trashCount,
      storageUsedBytes: sizeAgg[0]?.total ?? 0,
    },
  });
});

/** One account's activity timeline, newest first, a page at a time. */
export const getUserActivity = asyncHandler(async (req: Request, res: Response) => {
  const { status, category, page, limit } = req.query as unknown as {
    status?: 'success' | 'failure';
    category?: ActivityCategory;
    page: number;
    limit: number;
  };
  const user = await User.findById(req.params.id, { email: 1, phoneE164: 1 });
  if (!user) throw AppError.notFound('User not found');

  const clauses: FilterQuery<IActivityLog>[] = [userTimelineFilter(user)];
  if (status) clauses.push(status === 'success' ? { status: { $ne: 'failure' } } : { status: 'failure' });
  if (category) clauses.push({ action: { $in: [...ACTIVITY_CATEGORIES[category]] } });
  const filter = { $and: clauses };

  const [entries, total] = await Promise.all([
    ActivityLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    ActivityLog.countDocuments(filter),
  ]);
  sendSuccess(res, await serializeActivity(entries), 200, pageMeta(page, limit, total));
});

export const setUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };

  // Suspending your own account would lock you out with no way back in through the UI.
  if (req.params.id === req.user!.id) {
    throw AppError.badRequest('You cannot change the status of your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  const suspending = user.isActive && !isActive;
  user.isActive = isActive;
  /**
   * Suspension also ends every session the account holds. requireAuth already refuses an
   * inactive account on each request, but a browser that sent nothing while suspended would
   * otherwise find its old cookie working again the moment the account is reactivated —
   * bumping tokenVersion means reactivation always needs a fresh sign-in.
   */
  if (suspending) user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();

  await logActivity(req, {
    action: isActive ? 'user_activated' : 'user_deactivated',
    targetType: 'user',
    targetId: user._id,
    targetName: accountLabel(user),
    subjectUserId: user._id,
    message: `${isActive ? 'Activated' : 'Suspended'} account ${accountLabel(user)}`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, isActive ? 'Account activated' : 'Account suspended');
});

/**
 * Removes the account only. Their folders and files stay in the database, still stamped
 * with their ownerId, so nothing is destroyed by an administrative action and the data
 * can be reattached if the deletion was a mistake. Deleting the content itself is a
 * separate, deliberate operation that does not exist yet.
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) {
    throw AppError.badRequest('You cannot delete your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  const [folderCount, mediaCount] = await Promise.all([
    Folder.countDocuments({ ownerId: user._id }),
    Media.countDocuments({ ownerId: user._id }),
  ]);

  await User.deleteOne({ _id: user._id });

  await logActivity(req, {
    action: 'user_deleted',
    targetType: 'user',
    targetId: user._id,
    subjectUserId: user._id,
    targetName: user.email,
    message: `Deleted account ${user.email}`,
    metadata: { retainedFolders: folderCount, retainedMedia: mediaCount },
  });

  sendSuccess(
    res,
    { deleted: true, retainedFolders: folderCount, retainedMedia: mediaCount },
    200,
    undefined,
    `Account deleted. ${folderCount} folder(s) and ${mediaCount} file(s) were kept.`,
  );
});

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Installation-wide totals, plus the user-activity figures on the admin dashboard. "Today" starts
 * at `todayStart` — the admin's local midnight, sent by the browser — or the server's UTC midnight
 * when it isn't given (or is implausible). The per-user equivalent is /api/dashboard/stats.
 */
export const getAdminStats = asyncHandler(async (req: Request, res: Response) => {
  const now = Date.now();
  const requested = (req.query as { todayStart?: Date }).todayStart;
  const utcMidnight = new Date(new Date(now).setUTCHours(0, 0, 0, 0));
  const todayStart = requested && Math.abs(now - requested.getTime()) <= 1.5 * DAY_MS ? requested : utcMidnight;
  const weekStart = new Date(now - 7 * DAY_MS);
  const monthStart = new Date(now - 30 * DAY_MS);
  const activeSince = (since: Date): FilterQuery<IUser> => ({ $or: [{ lastActiveAt: { $gte: since } }, { lastLoginAt: { $gte: since } }] });
  const newSince = (since: Date, extra: FilterQuery<IUser> = {}): FilterQuery<IUser> => ({ $and: [{ createdAt: { $gte: since } }, extra] });

  const [
    [totalUsers, activeUsers, totalFolders, totalMedia, totalDocuments, sizeAgg],
    [newToday, newThisWeek, activeToday, activeThisMonth, loginsToday, failedLoginsToday],
    [newEmail, newMobile, newGoogle, free, pro, premium],
    [allEmail, allMobile, allGoogle],
  ] = await Promise.all([
    Promise.all([
      User.countDocuments({}),
      User.countDocuments({ isActive: true }),
      Folder.countDocuments({ isDeleted: false }),
      Media.countDocuments({ isDeleted: false }),
      Media.countDocuments({ isDeleted: false, fileType: 'document' }),
      Media.aggregate<{ _id: null; total: number }>([
        { $match: { isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$size' } } },
      ]),
    ]),
    Promise.all([
      User.countDocuments(newSince(todayStart)),
      User.countDocuments(newSince(weekStart)),
      User.countDocuments(activeSince(todayStart)),
      User.countDocuments(activeSince(monthStart)),
      ActivityLog.countDocuments({ action: 'login', createdAt: { $gte: todayStart } }),
      ActivityLog.countDocuments({ action: 'login_failed', createdAt: { $gte: todayStart } }),
    ]),
    Promise.all([
      User.countDocuments(newSince(weekStart, providerFilter('email'))),
      User.countDocuments(newSince(weekStart, providerFilter('mobile'))),
      User.countDocuments(newSince(weekStart, providerFilter('google'))),
      User.countDocuments(planFilter('free')),
      User.countDocuments(planFilter('pro')),
      User.countDocuments(planFilter('premium')),
    ]),
    // Every account, by how it signs in (same rule as the Users page).
    Promise.all([User.countDocuments(providerFilter('email')), User.countDocuments(providerFilter('mobile')), User.countDocuments(providerFilter('google'))]),
  ]);

  sendSuccess(res, {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    totalFolders,
    totalMedia,
    totalDocuments,
    storageUsedBytes: sizeAgg[0]?.total ?? 0,
    users: {
      todayStart,
      newToday,
      newThisWeek,
      activeToday,
      activeThisMonth,
      loginsToday,
      failedLoginsToday,
      newThisWeekByProvider: { email: newEmail, mobile: newMobile, google: newGoogle },
      byProvider: { email: allEmail, mobile: allMobile, google: allGoogle },
      byPlan: { free, pro, premium },
    },
  });
});

/**
 * The installation-wide audit log for /admin/activity (and the dashboard's recent activity):
 * filterable by category, specific actions, outcome, sign-in method, account, free text and date,
 * newest or oldest first, a page at a time. Entries carry a masked IP and a coarse device
 * description — never the raw address or user agent.
 */
export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  const { actions, category, status, provider, userId, search, from, to, sort, page, limit } = req.query as unknown as {
    actions?: ActivityAction[];
    category?: ActivityCategory;
    status?: 'success' | 'failure';
    provider?: 'email' | 'mobile' | 'google';
    userId?: string;
    search?: string;
    from?: Date;
    to?: Date;
    sort: 'newest' | 'oldest';
    page: number;
    limit: number;
  };

  const clauses: FilterQuery<IActivityLog>[] = [];
  if (actions?.length) clauses.push({ action: { $in: actions } });
  if (category) clauses.push({ action: { $in: [...ACTIVITY_CATEGORIES[category]] } });
  if (status) clauses.push(status === 'success' ? { status: { $ne: 'failure' } } : { status: 'failure' });
  if (provider) clauses.push({ authProvider: provider });
  if (from || to) clauses.push({ createdAt: { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) } });
  if (userId) {
    const user = await User.findById(userId, { email: 1, phoneE164: 1 });
    // An unknown account simply has no events.
    clauses.push(user ? userTimelineFilter(user) : { _id: null });
  }
  if (search) {
    const text = { $regex: escapeRegex(search), $options: 'i' };
    clauses.push({ $or: [{ message: text }, { performedByEmail: text }, { targetName: text }, { subjectIdentifier: text }] });
  }
  const filter: FilterQuery<IActivityLog> = clauses.length ? { $and: clauses } : {};
  const direction = sort === 'oldest' ? 1 : -1;

  const [entries, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: direction, _id: direction })
      .skip((page - 1) * limit)
      .limit(limit),
    ActivityLog.countDocuments(filter),
  ]);

  sendSuccess(res, await serializeActivity(entries), 200, pageMeta(page, limit, total));
});

/**
 * Administrator-only subscription management (requireAuth + requireAdmin on the router).
 *
 * This is the one place a paid plan can become `active`: users can only ever *choose* a plan,
 * which leaves a paid one pending (authController.completeOnboarding). An administrator does
 * this after confirming payment outside the app; it is recorded in the activity log. Admin
 * accounts have no subscription, so they can't be targeted.
 */
export const updateUserSubscription = asyncHandler(async (req: Request, res: Response) => {
  const { plan, subscriptionStatus, subscriptionExpiresAt } = req.body as UpdateSubscriptionInput;

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');
  if (user.role === 'admin') throw AppError.badRequest('Administrator accounts have no subscription');

  const now = new Date();
  const wasActiveOnSamePlan = user.subscriptionStatus === 'active' && user.plan === plan;
  user.plan = plan;
  user.planSelectedAt = user.planSelectedAt ?? now;
  user.subscriptionStatus = subscriptionStatus;
  user.subscriptionStartedAt = subscriptionStatus === 'active' ? (wasActiveOnSamePlan ? user.subscriptionStartedAt ?? now : now) : null;
  user.subscriptionExpiresAt = subscriptionStatus === 'active' && plan !== 'free' ? subscriptionExpiresAt ?? null : null;
  // A plan now exists, so there is nothing left to choose at onboarding.
  if (user.onboardingRequired) {
    user.onboardingRequired = false;
    user.onboardingCompletedAt = user.onboardingCompletedAt ?? now;
  }
  await user.save();

  await logActivity(req, {
    action: 'subscription_updated',
    targetType: 'user',
    targetId: user._id,
    subjectUserId: user._id,
    targetName: accountLabel(user),
    message: `Set ${accountLabel(user)} to ${plan} (${subscriptionStatus})`,
    metadata: { plan, subscriptionStatus, subscriptionExpiresAt: user.subscriptionExpiresAt },
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Subscription updated');
});
