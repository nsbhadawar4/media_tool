import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { User, toPublicUser } from '../models/User';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listUsers = asyncHandler(async (req: Request, res: Response) => {
  const { search, role, status, page, limit } = req.query as unknown as {
    search?: string;
    role?: 'user' | 'admin';
    status?: 'active' | 'inactive';
    page: number;
    limit: number;
  };

  const filter: Record<string, unknown> = {};
  if (search) {
    const regex = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: regex }, { email: regex }];
  }
  if (role) filter.role = role;
  if (status) filter.isActive = status === 'active';

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  // Counts are gathered per page rather than for the whole collection, so the list stays
  // cheap however many accounts exist.
  const ids = users.map((u) => u._id);
  const [folderCounts, mediaCounts] = await Promise.all([
    Folder.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { ownerId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    ]),
    Media.aggregate<{ _id: Types.ObjectId; count: number; bytes: number }>([
      { $match: { ownerId: { $in: ids }, isDeleted: false } },
      { $group: { _id: '$ownerId', count: { $sum: 1 }, bytes: { $sum: '$size' } } },
    ]),
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
      };
    }),
    200,
    { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  );
});

export const getUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  const ownerId = user._id;
  const [folderCount, imageCount, videoCount, documentCount, trashCount, sizeAgg] = await Promise.all([
    Folder.countDocuments({ ownerId, isDeleted: false }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'image' }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'video' }),
    Media.countDocuments({ ownerId, isDeleted: false, fileType: 'document' }),
    Media.countDocuments({ ownerId, isDeleted: true }),
    Media.aggregate<{ _id: null; total: number }>([
      { $match: { ownerId, isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]),
  ]);

  sendSuccess(res, {
    user: toPublicUser(user),
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

export const setUserStatus = asyncHandler(async (req: Request, res: Response) => {
  const { isActive } = req.body as { isActive: boolean };

  // Suspending your own account would lock you out with no way back in through the UI.
  if (req.params.id === req.user!.id) {
    throw AppError.badRequest('You cannot change the status of your own account');
  }

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  user.isActive = isActive;
  await user.save();

  await logActivity(req, {
    action: isActive ? 'user_activated' : 'user_deactivated',
    targetType: 'user',
    targetId: user._id,
    targetName: user.email,
    message: `${isActive ? 'Activated' : 'Deactivated'} account ${user.email}`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, isActive ? 'Account activated' : 'Account deactivated');
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

/** Installation-wide totals. The per-user equivalent is /api/dashboard/stats. */
export const getAdminStats = asyncHandler(async (_req: Request, res: Response) => {
  const [totalUsers, activeUsers, totalFolders, totalMedia, sizeAgg] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ isActive: true }),
    Folder.countDocuments({ isDeleted: false }),
    Media.countDocuments({ isDeleted: false }),
    Media.aggregate<{ _id: null; total: number }>([
      { $match: { isDeleted: false } },
      { $group: { _id: null, total: { $sum: '$size' } } },
    ]),
  ]);

  sendSuccess(res, {
    totalUsers,
    activeUsers,
    inactiveUsers: totalUsers - activeUsers,
    totalFolders,
    totalMedia,
    storageUsedBytes: sizeAgg[0]?.total ?? 0,
  });
});
