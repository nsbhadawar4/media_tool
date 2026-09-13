import type { Request, Response } from 'express';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { serializeMedia } from '../utils/mediaUrls';
import * as folderService from '../services/folderService';
import * as mediaService from '../services/mediaService';

/** Unified trash view: deleted folders and deleted media, newest first. */
export const listTrash = asyncHandler(async (req: Request, res: Response) => {
  const [folders, media] = await Promise.all([
    Folder.find({ isDeleted: true }).sort({ deletedAt: -1 }),
    Media.find({ isDeleted: true }).sort({ deletedAt: -1 }),
  ]);

  sendSuccess(res, {
    folders,
    media: media.map((m) => serializeMedia(m, req.admin!.id)),
  });
});

/** Restores a trashed item by id, detecting whether it's a folder or a media file. */
export const restoreTrashItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const folder = await Folder.findOne({ _id: id, isDeleted: true });
  if (folder) {
    const restored = await folderService.restoreFolder(id);
    await logActivity(req, {
      action: 'folder_restored',
      targetType: 'folder',
      targetId: restored._id,
      targetName: restored.name,
      message: `Restored folder "${restored.name}" from trash`,
    });
    sendSuccess(res, { type: 'folder', item: restored });
    return;
  }

  const media = await Media.findOne({ _id: id, isDeleted: true });
  if (media) {
    const restored = await mediaService.restoreMedia(id);
    await logActivity(req, {
      action: 'media_restored',
      targetType: 'media',
      targetId: restored._id,
      targetName: restored.originalName,
      message: `Restored "${restored.originalName}" from trash`,
    });
    sendSuccess(res, { type: 'media', item: serializeMedia(restored, req.admin!.id) });
    return;
  }

  throw AppError.notFound('Trashed item not found');
});

/** Permanently deletes a trashed item — irreversible, so the frontend must confirm first. */
export const permanentlyDeleteTrashItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const folder = await Folder.findOne({ _id: id, isDeleted: true });
  if (folder) {
    await folderService.permanentlyDeleteFolder(id);
    await logActivity(req, {
      action: 'folder_permanently_deleted',
      targetType: 'folder',
      targetId: folder._id,
      targetName: folder.name,
      message: `Permanently deleted folder "${folder.name}"`,
    });
    sendSuccess(res, { type: 'folder', deleted: true });
    return;
  }

  const media = await Media.findOne({ _id: id, isDeleted: true });
  if (media) {
    await mediaService.permanentlyDeleteMedia(id);
    await logActivity(req, {
      action: 'media_permanently_deleted',
      targetType: 'media',
      targetId: media._id,
      targetName: media.originalName,
      message: `Permanently deleted "${media.originalName}"`,
    });
    sendSuccess(res, { type: 'media', deleted: true });
    return;
  }

  throw AppError.notFound('Trashed item not found');
});
