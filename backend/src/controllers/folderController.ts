import type { Request, Response } from 'express';
import { Folder, type IFolder } from '../models/Folder';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { serializeFolder } from '../utils/serializeFolder';
import * as folderService from '../services/folderService';
import { env } from '../config/env';
import { logger } from '../utils/logger';

const FOLDER_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

export const listFolders = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const { parentFolder, includeDeleted, search, sort } = req.query as unknown as {
    parentFolder?: string;
    includeDeleted?: boolean;
    search?: string;
    sort: string;
  };

  // ownerId is the first key of every filter in this file and comes from the session
  // cookie, never from the request — see services/folderService for the reasoning.
  const filter: Record<string, unknown> = { ownerId, isDeleted: includeDeleted ?? false };

  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  } else {
    filter.parentFolder = parentFolder ?? null;
  }

  const folders = await Folder.find(filter)
    .sort(FOLDER_SORT_MAP[sort] ?? FOLDER_SORT_MAP.name_asc)
    .populate('coverImage');

  let breadcrumbs: Array<{ id: string; name: string }> = [];
  let parent: IFolder | null = null;
  if (parentFolder) {
    const parentDoc = await Folder.findOne({ _id: parentFolder, ownerId });
    if (parentDoc) {
      parent = parentDoc;
      breadcrumbs = [...(await folderService.getBreadcrumbs(parentDoc)), { id: parentDoc._id.toString(), name: parentDoc.name }];
    }
  }

  sendSuccess(res, {
    folders: folders.map((f) => serializeFolder(f, req.user!.id)),
    parent: parent ? serializeFolder(parent as IFolder, req.user!.id) : null,
    breadcrumbs,
  });
});

export const getFolder = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  // Another account's folder id returns 404, not 403: confirming it exists would itself
  // tell the caller something about an account that is not theirs.
  const folder = await Folder.findOne({ _id: req.params.id, ownerId }).populate('coverImage');
  if (!folder) throw AppError.notFound('Folder not found');

  const [subfolders, breadcrumbs] = await Promise.all([
    Folder.find({ ownerId, parentFolder: folder._id, isDeleted: false })
      .sort({ name: 1 })
      .populate('coverImage'),
    folderService.getBreadcrumbs(folder),
  ]);

  sendSuccess(res, {
    folder: serializeFolder(folder, req.user!.id),
    subfolders: subfolders.map((f) => serializeFolder(f, req.user!.id)),
    breadcrumbs,
  });
});

export const createFolder = asyncHandler(async (req: Request, res: Response) => {
  // Development-only trace of the write path into MongoDB. Names and ids only —
  // never credentials, tokens or cookies.
  if (env.isDevelopment) {
    logger.info(`Creating folder: ${JSON.stringify({ name: req.body.name, parentFolder: req.body.parentFolder ?? null })}`);
  }

  const folder = await folderService.createFolder({
    ownerId: req.user!.id,
    name: req.body.name,
    description: req.body.description,
    parentFolder: req.body.parentFolder ?? null,
    createdBy: req.user!.id,
  });

  if (env.isDevelopment) {
    logger.info(`Folder created in MongoDB: ${folder._id.toString()}`);
  }

  await logActivity(req, {
    action: 'folder_created',
    targetType: 'folder',
    targetId: folder._id,
    targetName: folder.name,
    message: `Created folder "${folder.name}"`,
  });

  sendSuccess(res, folder, 201);
});

export const updateFolder = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const before = await Folder.findOne({ _id: req.params.id, ownerId });
  if (!before) throw AppError.notFound('Folder not found');

  const folder = await folderService.updateFolder(ownerId, req.params.id, req.body);

  const renamed = req.body.name && req.body.name !== before.name;
  await logActivity(req, {
    action: renamed ? 'folder_renamed' : 'folder_updated',
    targetType: 'folder',
    targetId: folder._id,
    targetName: folder.name,
    message: renamed ? `Renamed folder "${before.name}" to "${folder.name}"` : `Updated folder "${folder.name}"`,
  });

  sendSuccess(res, folder);
});

export const deleteFolder = asyncHandler(async (req: Request, res: Response) => {
  const folder = await folderService.softDeleteFolder(req.user!.id, req.params.id);

  await logActivity(req, {
    action: 'folder_deleted',
    targetType: 'folder',
    targetId: folder._id,
    targetName: folder.name,
    message: `Moved folder "${folder.name}" to trash`,
  });

  sendSuccess(res, folder);
});

export const restoreFolder = asyncHandler(async (req: Request, res: Response) => {
  const result = await folderService.restoreFolder(req.user!.id, req.params.id);
  const { folder, restoredFolders, restoredMedia, reparentedToRoot } = result;

  await logActivity(req, {
    action: 'folder_restored',
    targetType: 'folder',
    targetId: folder._id,
    targetName: folder.name,
    message:
      `Restored folder "${folder.name}" from trash` +
      (restoredFolders + restoredMedia > 0
        ? ` with ${restoredMedia} file(s) and ${restoredFolders} subfolder(s)`
        : ''),
    metadata: { restoredFolders, restoredMedia, reparentedToRoot },
  });

  sendSuccess(res, { folder, restoredFolders, restoredMedia, reparentedToRoot });
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
