import type { Request, Response } from 'express';
import { Folder, type IFolder } from '../models/Folder';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { serializeFolder } from '../utils/serializeFolder';
import * as folderService from '../services/folderService';

const FOLDER_SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
};

export const listFolders = asyncHandler(async (req: Request, res: Response) => {
  const { parentFolder, includeDeleted, search, sort } = req.query as unknown as {
    parentFolder?: string;
    includeDeleted?: boolean;
    search?: string;
    sort: string;
  };

  const filter: Record<string, unknown> = { isDeleted: includeDeleted ?? false };

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
    const parentDoc = await Folder.findById(parentFolder);
    if (parentDoc) {
      parent = parentDoc;
      breadcrumbs = [...(await folderService.getBreadcrumbs(parentDoc)), { id: parentDoc._id.toString(), name: parentDoc.name }];
    }
  }

  sendSuccess(res, {
    folders: folders.map((f) => serializeFolder(f, req.admin!.id)),
    parent: parent ? serializeFolder(parent as IFolder, req.admin!.id) : null,
    breadcrumbs,
  });
});

export const getFolder = asyncHandler(async (req: Request, res: Response) => {
  const folder = await Folder.findById(req.params.id).populate('coverImage');
  if (!folder) throw AppError.notFound('Folder not found');

  const [subfolders, breadcrumbs] = await Promise.all([
    Folder.find({ parentFolder: folder._id, isDeleted: false }).sort({ name: 1 }).populate('coverImage'),
    folderService.getBreadcrumbs(folder),
  ]);

  sendSuccess(res, {
    folder: serializeFolder(folder, req.admin!.id),
    subfolders: subfolders.map((f) => serializeFolder(f, req.admin!.id)),
    breadcrumbs,
  });
});

export const createFolder = asyncHandler(async (req: Request, res: Response) => {
  const folder = await folderService.createFolder({
    name: req.body.name,
    description: req.body.description,
    parentFolder: req.body.parentFolder ?? null,
    createdBy: req.admin!.id,
  });

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
  const before = await Folder.findById(req.params.id);
  if (!before) throw AppError.notFound('Folder not found');

  const folder = await folderService.updateFolder(req.params.id, req.body);

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
  const folder = await folderService.softDeleteFolder(req.params.id);

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
  const folder = await folderService.restoreFolder(req.params.id);

  await logActivity(req, {
    action: 'folder_restored',
    targetType: 'folder',
    targetId: folder._id,
    targetName: folder.name,
    message: `Restored folder "${folder.name}" from trash`,
  });

  sendSuccess(res, folder);
});

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
