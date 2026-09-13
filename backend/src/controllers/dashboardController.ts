import type { Request, Response } from 'express';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { serializeMedia } from '../utils/mediaUrls';

export const getStats = asyncHandler(async (req: Request, res: Response) => {
  const [totalFolders, totalImages, totalVideos, totalDocuments, trashFolders, trashMedia, sizeAgg] =
    await Promise.all([
      Folder.countDocuments({ isDeleted: false }),
      Media.countDocuments({ isDeleted: false, fileType: 'image' }),
      Media.countDocuments({ isDeleted: false, fileType: 'video' }),
      Media.countDocuments({ isDeleted: false, fileType: 'document' }),
      Folder.countDocuments({ isDeleted: true }),
      Media.countDocuments({ isDeleted: true }),
      Media.aggregate<{ _id: null; total: number }>([
        { $match: { isDeleted: false } },
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
  const [recentUploads, recentActivity] = await Promise.all([
    Media.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(12),
    ActivityLog.find().sort({ createdAt: -1 }).limit(15),
  ]);

  sendSuccess(res, {
    recentUploads: recentUploads.map((m) => serializeMedia(m, req.admin!.id)),
    recentActivity,
  });
});
