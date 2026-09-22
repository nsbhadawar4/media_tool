import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { serializeMedia } from '../utils/mediaUrls';
import * as folderService from '../services/folderService';
import * as mediaService from '../services/mediaService';

/**
 * The exact phrase a caller must send to permanently destroy something.
 *
 * Enforced on the server, not just in the dialog: a permanent delete is the only
 * unrecoverable operation in this app, so it must not be reachable by a stray click, a
 * replayed request, or a script that happens to know the URL.
 */
export const PERMANENT_DELETE_CONFIRMATION = 'DELETE PERMANENTLY';

/**
 * Unified trash view.
 *
 * Only *directly* deleted items are listed. Anything swept up by a folder deletion is
 * summarised on that folder's entry instead of appearing separately — otherwise trashing
 * one folder of holiday photos would bury the trash under hundreds of rows and make the
 * one file someone actually wants back impossible to find.
 */
export const listTrash = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.id;
  const [folders, media] = await Promise.all([
    Folder.find({ ownerId, isDeleted: true, deletedCascadeRoot: null }).sort({ deletedAt: -1 }),
    Media.find({ ownerId, isDeleted: true, deletedCascadeRoot: null }).sort({ deletedAt: -1 }),
  ]);

  // What each trashed folder is holding, so the UI can state the real cost of destroying it.
  const contents = await Promise.all(
    folders.map(async (folder) => {
      const [folderCount, mediaStats] = await Promise.all([
        Folder.countDocuments({ ownerId, deletedCascadeRoot: folder._id, isDeleted: true }),
        Media.aggregate<{ count: number; bytes: number }>([
          { $match: { ownerId: new Types.ObjectId(ownerId), deletedCascadeRoot: folder._id, isDeleted: true } },
          { $group: { _id: null, count: { $sum: 1 }, bytes: { $sum: '$size' } } },
        ]),
      ]);

      const stats = mediaStats[0] ?? { count: 0, bytes: 0 };
      return {
        ...folder.toObject(),
        contains: { folders: folderCount, media: stats.count, bytes: stats.bytes },
      };
    }),
  );

  sendSuccess(res, {
    folders: contents,
    media: media.map((m) => serializeMedia(m, req.user!.id)),
  });
});

/** Restores a trashed item by id, detecting whether it's a folder or a media file. */
export const restoreTrashItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const folder = await Folder.findOne({ _id: id, ownerId: req.user!.id, isDeleted: true });
  if (folder) {
    const { folder: restored, restoredFolders, restoredMedia, reparentedToRoot } =
      await folderService.restoreFolder(req.user!.id, id);

    await logActivity(req, {
      action: 'folder_restored',
      targetType: 'folder',
      targetId: restored._id,
      targetName: restored.name,
      message:
        `Restored folder "${restored.name}" from trash` +
        (restoredFolders + restoredMedia > 0
          ? ` with ${restoredMedia} file(s) and ${restoredFolders} subfolder(s)`
          : ''),
      metadata: { restoredFolders, restoredMedia, reparentedToRoot },
    });

    sendSuccess(res, {
      type: 'folder',
      item: restored,
      restoredFolders,
      restoredMedia,
      reparentedToRoot,
    });
    return;
  }

  const media = await Media.findOne({ _id: id, ownerId: req.user!.id, isDeleted: true });
  if (media) {
    const restored = await mediaService.restoreMedia(req.user!.id, id);
    await logActivity(req, {
      action: 'media_restored',
      targetType: 'media',
      targetId: restored._id,
      targetName: restored.originalName,
      message: `Restored "${restored.originalName}" from trash`,
    });
    sendSuccess(res, { type: 'media', item: serializeMedia(restored, req.user!.id) });
    return;
  }

  throw AppError.notFound('Trashed item not found');
});

/**
 * Reports what a permanent delete would destroy, without destroying anything.
 *
 * The UI calls this before opening its confirmation dialog so the warning quotes real
 * numbers for this specific folder rather than a generic "this cannot be undone".
 */
export const previewPermanentDelete = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const folder = await Folder.findOne({ _id: id, ownerId: req.user!.id, isDeleted: true });
  if (folder) {
    const scope = await folderService.getFolderDeletionScope(req.user!.id, id);
    sendSuccess(res, {
      type: 'folder',
      name: folder.name,
      isProtected: folder.isProtected,
      folders: scope.folderIds.length,
      media: scope.media.length,
      bytes: scope.totalBytes,
    });
    return;
  }

  const media = await Media.findOne({ _id: id, ownerId: req.user!.id, isDeleted: true });
  if (media) {
    sendSuccess(res, {
      type: 'media',
      name: media.originalName,
      isProtected: false,
      folders: 0,
      media: 1,
      bytes: media.size,
    });
    return;
  }

  throw AppError.notFound('Trashed item not found');
});

/**
 * Permanently deletes a trashed item and its bytes. Irreversible — the request must carry
 * the exact confirmation phrase, and the item must already be in the trash, so nothing
 * visible in the gallery can be destroyed in a single step.
 */
interface PermanentDeleteOutcome {
  type: 'folder' | 'media';
  name: string;
  deletedFolders: number;
  deletedMedia: number;
  freedBytes: number;
  failed: Array<{ id: string; name: string; error: string }>;
}

/**
 * Destroys one trashed item, whichever kind it is, and records what it cost.
 *
 * Shared by the single and bulk endpoints so the two cannot drift: a deletion carried out
 * one at a time and the same deletion carried out as part of a selection must free the
 * same bytes, write the same activity entry, and refuse the same protected folders.
 *
 * Looks the item up by id *and* owner, so another account's id reads as absent rather
 * than as forbidden — and can never be deleted through either route.
 */
async function permanentlyDeleteOne(req: Request, id: string): Promise<PermanentDeleteOutcome> {
  const ownerId = req.user!.id;

  const folder = await Folder.findOne({ _id: id, ownerId, isDeleted: true });
  if (folder) {
    const result = await folderService.permanentlyDeleteFolder(ownerId, id);

    await logActivity(req, {
      action: 'folder_permanently_deleted',
      targetType: 'folder',
      targetId: folder._id,
      targetName: folder.name,
      message:
        `Permanently deleted folder "${folder.name}" — ` +
        `${result.deletedMedia} file(s), ${result.deletedFolders} folder(s), ${result.freedBytes} bytes freed`,
      metadata: {
        deletedMedia: result.deletedMedia,
        deletedFolders: result.deletedFolders,
        freedBytes: result.freedBytes,
        failed: result.failed,
      },
    });

    return { type: 'folder', name: folder.name, ...result };
  }

  const media = await Media.findOne({ _id: id, ownerId, isDeleted: true });
  if (media) {
    const { freedBytes } = await mediaService.permanentlyDeleteMedia(ownerId, id);

    await logActivity(req, {
      action: 'media_permanently_deleted',
      targetType: 'media',
      targetId: media._id,
      targetName: media.originalName,
      message: `Permanently deleted "${media.originalName}" (${freedBytes} bytes freed)`,
      metadata: { freedBytes },
    });

    return {
      type: 'media',
      name: media.originalName,
      deletedFolders: 0,
      deletedMedia: 1,
      freedBytes,
      failed: [],
    };
  }

  throw AppError.notFound('Trashed item not found');
}

export const permanentlyDeleteTrashItem = asyncHandler(async (req: Request, res: Response) => {
  const { confirm } = req.body as { confirm?: string };

  if (confirm !== PERMANENT_DELETE_CONFIRMATION) {
    throw AppError.badRequest(
      `Permanent deletion must be confirmed by sending confirm: "${PERMANENT_DELETE_CONFIRMATION}"`,
    );
  }

  const outcome = await permanentlyDeleteOne(req, req.params.id);

  if (outcome.failed.length > 0) {
    throw AppError.internal(
      `${outcome.failed.length} file(s) could not be removed from storage and are still in the trash. Nothing else was deleted.`,
    );
  }

  const { name: _name, ...result } = outcome;
  sendSuccess(res, { ...result, deleted: true });
});

/**
 * Permanently deletes several trashed items in one request.
 *
 * Per item rather than all-or-nothing, matching every other bulk endpoint here: a
 * selection made from a list is routinely stale by the time it is acted on — something
 * restored in another tab, a folder already swept up by deleting its parent — and
 * refusing the whole batch over one such entry would make the feature useless exactly
 * when it is most wanted. What went and what did not is reported item by item.
 *
 * The confirmation phrase is required once for the request, not once per item: it exists
 * so that destroying something is deliberate, and confirming the same selection nine times
 * would train people to type it without reading.
 */
export const permanentlyDeleteTrashItems = asyncHandler(async (req: Request, res: Response) => {
  const { ids, confirm } = req.body as { ids: string[]; confirm?: string };

  if (confirm !== PERMANENT_DELETE_CONFIRMATION) {
    throw AppError.badRequest(
      `Permanent deletion must be confirmed by sending confirm: "${PERMANENT_DELETE_CONFIRMATION}"`,
    );
  }

  const succeeded: Array<{ id: string; name: string; type: 'folder' | 'media' }> = [];
  const failed: Array<{ id: string; error: string }> = [];
  let deletedFolders = 0;
  let deletedMedia = 0;
  let freedBytes = 0;

  for (const id of ids) {
    try {
      const outcome = await permanentlyDeleteOne(req, id);

      // A folder whose storage would not let go of some of its files stays in the trash;
      // counting it as deleted would tell the user bytes were freed that were not.
      if (outcome.failed.length > 0) {
        failed.push({
          id,
          error: `${outcome.failed.length} file(s) could not be removed from storage; this item is still in the trash.`,
        });
        continue;
      }

      succeeded.push({ id, name: outcome.name, type: outcome.type });
      deletedFolders += outcome.deletedFolders;
      deletedMedia += outcome.deletedMedia;
      freedBytes += outcome.freedBytes;
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : 'Could not be deleted' });
    }
  }

  sendSuccess(
    res,
    { succeeded, failed, deletedFolders, deletedMedia, freedBytes },
    // Nothing at all went through: the request failed, and the status should say so.
    succeeded.length === 0 && failed.length > 0 ? 400 : 200,
  );
});
