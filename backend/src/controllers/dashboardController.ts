import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { serializeMedia } from '../utils/mediaUrls';
import { env } from '../config/env';
import { FILE_TYPES } from '../config/constants';

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

interface TypeUsage {
  count: number;
  bytes: number;
}

/**
 * The signed-in user's own storage, for /manage-storage: what the library takes up by kind of
 * file, what Trash still holds (deleted files keep their space until Trash is emptied), and how
 * many folders there are. Scoped to req.user — the only owner this can ever describe.
 *
 * `limitBytes` is null: no per-account storage limit exists, and none is invented here. The
 * largest single upload allowed is reported instead, since that limit does exist.
 */
export const getStorage = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = new Types.ObjectId(req.user!.id);

  const [groups, folderCount] = await Promise.all([
    // One pass over this owner's files (served by the { ownerId, … } indexes).
    Media.aggregate<{ _id: { fileType: string; isDeleted: boolean }; count: number; bytes: number }>([
      { $match: { ownerId } },
      { $group: { _id: { fileType: '$fileType', isDeleted: '$isDeleted' }, count: { $sum: 1 }, bytes: { $sum: '$size' } } },
    ]),
    Folder.countDocuments({ ownerId, isDeleted: false }),
  ]);

  const empty = (): TypeUsage => ({ count: 0, bytes: 0 });
  const byType: Record<string, TypeUsage> = Object.fromEntries([...FILE_TYPES, 'other'].map((t) => [t, empty()]));
  const trash = empty();
  for (const g of groups) {
    const target = g._id.isDeleted ? trash : byType[(FILE_TYPES as readonly string[]).includes(g._id.fileType) ? g._id.fileType : 'other']!;
    target.count += g.count;
    target.bytes += g.bytes;
  }
  const library = Object.values(byType).reduce((sum, t) => ({ count: sum.count + t.count, bytes: sum.bytes + t.bytes }), empty());

  sendSuccess(res, {
    limitBytes: null,
    usedBytes: library.bytes + trash.bytes,
    libraryBytes: library.bytes,
    totalFiles: library.count,
    totalFolders: folderCount,
    byType,
    trash,
    maxUploadBytes: env.maxFileSizeBytes,
  });
});
