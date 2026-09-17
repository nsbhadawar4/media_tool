import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { serializeMedia } from '../utils/mediaUrls';

/**
 * These are the signed-in user's own numbers, never installation-wide totals — every
 * count below is filtered by ownerId. Whole-application statistics live behind
 * /api/admin/stats, which requires an administrator.
 */
export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;

  const [totalFolders, totalImages, totalVideos, totalDocuments, trashFolders, trashMedia, sizeAgg] =
    await Promise.all([
      Folder.countDocuments({ ownerId, isDeleted: false }),
      Media.countDocuments({ ownerId, isDeleted: false, fileType: 'image' }),
      Media.countDocuments({ ownerId, isDeleted: false, fileType: 'video' }),
      Media.countDocuments({ ownerId, isDeleted: false, fileType: 'document' }),
      Folder.countDocuments({ ownerId, isDeleted: true }),
      Media.countDocuments({ ownerId, isDeleted: true }),
      Media.aggregate<{ _id: null; total: number }>([
        // An aggregation has no owner filter of its own, so it has to be the first stage.
        { $match: { ownerId: new Types.ObjectId(ownerId), isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$size' } } },
      ]),
    ]);

  sendSuccess(res, {
    totalFolders,
    totalImages,
    totalVideos,
    totalDocuments,
    storageUsedBytes: sizeAgg[0]?.total ?? 0,
    trashItems: trashFolders + trashMedia,
  });
});

export const getRecent = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;

  const [recentUploads, recentFolders, recentActivity] = await Promise.all([
    Media.find({ ownerId, isDeleted: false }).sort({ createdAt: -1 }).limit(12),
    Folder.find({ ownerId, isDeleted: false }).sort({ createdAt: -1 }).limit(8).populate('coverImage'),
    ActivityLog.find({ performedBy: ownerId }).sort({ createdAt: -1 }).limit(15),
  ]);

  sendSuccess(res, {
    recentUploads: recentUploads.map((m) => serializeMedia(m, ownerId)),
    recentFolders,
    recentActivity,
  });
});
