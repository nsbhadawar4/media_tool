import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { Types } from 'mongoose';
import sharp from 'sharp';
import { Media, type IMedia } from '../models/Media';
import { Folder } from '../models/Folder';
import { getStorageProvider } from './storage';
import { fileTypeFromMime, STORAGE_DIR_BY_FILE_TYPE, type FileType } from '../config/constants';
import { AppError } from '../utils/AppError';
import { assertSafeFilename } from '../utils/filenameSafety';
import { recalculateItemCount, purgeMediaRecords } from './folderService';
import { generateThumbnail } from './thumbnailService';

export interface UploadedFileInput {
  originalname: string;
  path: string; // temp path written by multer
  mimetype: string;
  size: number;
}

/**
 * Builds a collision-proof storage key. Keys are organized type-first
 * (photos/videos/documents — mirroring backend/uploads/{photos,videos,documents}),
 * then by folder so a bucket stays browsable. The folder segment is the folder's
 * stable _id, not its name, so renaming or moving a folder never requires touching
 * any already-uploaded file's storage key.
 */
function buildStorageKey(
  fileType: FileType,
  folderId: string | null,
  safeOriginalName: string,
): { key: string; storedName: string } {
  const ext = path.extname(safeOriginalName).toLowerCase();
  const unique = crypto.randomBytes(8).toString('hex');
  const storedName = `${Date.now()}-${unique}${ext}`;
  const folderSegment = folderId ?? 'unfiled';
  return { key: `${STORAGE_DIR_BY_FILE_TYPE[fileType]}/${folderSegment}/${storedName}`, storedName };
}

async function readImageDimensions(filePath: string): Promise<{ width: number | null; height: number | null }> {
  try {
    const metadata = await sharp(filePath).metadata();
    return { width: metadata.width ?? null, height: metadata.height ?? null };
  } catch {
    // HEIC or an unusual encoder sharp can't probe — not fatal, dimensions are optional.
    return { width: null, height: null };
  }
}

export interface SaveUploadedMediaInput {
  file: UploadedFileInput;
  folderId: string | null;
  uploadedBy: string;
  /**
   * Optional poster frame for a video, grabbed in the browser at upload time (see the
   * frontend's videoPoster util). There is no ffmpeg dependency here, so this is the only
   * source of a video thumbnail — absent it, the client renders a placeholder instead.
   */
  posterPath?: string | null;
  /** Video length in seconds, also read in the browser. */
  duration?: number | null;
}

export async function saveUploadedMedia(input: SaveUploadedMediaInput): Promise<IMedia> {
  const { file, folderId, uploadedBy, posterPath, duration } = input;

  // Both temp files are abandoned on every failure path below, so clean them up together.
  const discardTempFiles = async () => {
    await fsp.unlink(file.path).catch(() => undefined);
    if (posterPath) await fsp.unlink(posterPath).catch(() => undefined);
  };

  const fileType = fileTypeFromMime(file.mimetype) as FileType | null;
  if (!fileType) {
    await discardTempFiles();
    throw AppError.badRequest(`Unsupported file type for ${file.originalname}`);
  }

  let safeName: string;
  try {
    safeName = assertSafeFilename(file.originalname);
  } catch (err) {
    await discardTempFiles();
    throw AppError.badRequest(err instanceof Error ? err.message : 'Invalid filename');
  }

  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, isDeleted: false });
    if (!folder) {
      await discardTempFiles();
      throw AppError.notFound('Target folder not found');
    }
  }

  const { key, storedName } = buildStorageKey(fileType, folderId, safeName);

  let dimensions: { width: number | null; height: number | null } = { width: null, height: null };
  if (fileType === 'image') {
    dimensions = await readImageDimensions(file.path);
  }

  // Must run before the upload below: the storage provider *moves* its source file, so
  // reading pixels from `file.path` afterwards would find nothing there.
  let thumbnailKey: string | null = null;
  if (fileType === 'image') {
    thumbnailKey = await generateThumbnail({ sourcePath: file.path, storedName });
  } else if (fileType === 'video' && posterPath) {
    thumbnailKey = await generateThumbnail({ sourcePath: posterPath, storedName });
    // generateThumbnail reads the poster but never removes it, so drop it here either way.
    await fsp.unlink(posterPath).catch(() => undefined);
  }

  const provider = getStorageProvider();
  let stored;
  try {
    stored = await provider.upload({ key, sourcePath: file.path, contentType: file.mimetype });
  } catch (err) {
    // A failed upload leaves multer's temp file behind; without this it accumulates in tmp/.
    await discardTempFiles();
    throw err;
  }

  const media = await Media.create({
    folderId: folderId ?? null,
    originalName: safeName,
    storedName,
    storageKey: stored.key,
    storageProvider: provider.name,
    url: provider.getUrl(stored.key),
    mimeType: file.mimetype,
    fileType,
    size: stored.size,
    width: dimensions.width,
    height: dimensions.height,
    duration: fileType === 'video' ? (duration ?? null) : null,
    thumbnailKey,
    uploadedBy: new Types.ObjectId(uploadedBy),
  });

  if (folderId) {
    await recalculateItemCount(folderId);
    await Folder.updateOne({ _id: folderId, coverImage: null }, { coverImage: media._id });
  }

  return media;
}

export async function renameMedia(id: string, originalName: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');
  media.originalName = originalName;
  await media.save();
  return media;
}

export async function moveMedia(id: string, folderId: string | null): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');

  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, isDeleted: false });
    if (!folder) throw AppError.notFound('Target folder not found');
  }

  const previousFolderId = media.folderId ? media.folderId.toString() : null;
  media.folderId = folderId ? new Types.ObjectId(folderId) : null;
  await media.save();

  if (previousFolderId) await recalculateItemCount(previousFolderId);
  if (folderId) await recalculateItemCount(folderId);

  return media;
}

export async function softDeleteMedia(id: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');
  media.isDeleted = true;
  media.deletedAt = new Date();
  // Deleted on its own, so it is its own trash entry and no folder restore will reclaim it.
  media.deletedCascadeRoot = null;
  await media.save();
  if (media.folderId) await recalculateItemCount(media.folderId.toString());
  return media;
}

export async function restoreMedia(id: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, isDeleted: true });
  if (!media) throw AppError.notFound('Deleted file not found');

  if (media.folderId) {
    const folder = await Folder.findById(media.folderId);
    if (!folder || folder.isDeleted) {
      media.folderId = null; // parent folder is gone/still trashed — restore to unfiled
    }
  }

  media.isDeleted = false;
  media.deletedAt = null;
  media.deletedCascadeRoot = null;
  await media.save();
  if (media.folderId) await recalculateItemCount(media.folderId.toString());
  return media;
}

/**
 * Irreversibly removes one trashed file and its bytes. Shares purgeMediaRecords with the
 * folder purge so both paths delete storage before the record, never the other way round.
 */
export async function permanentlyDeleteMedia(id: string): Promise<{ freedBytes: number }> {
  const media = await Media.findOne({ _id: id, isDeleted: true });
  if (!media) throw AppError.notFound('Deleted file not found');

  const { failed, freedBytes } = await purgeMediaRecords([media]);
  if (failed.length > 0) {
    throw AppError.internal(`Could not remove "${media.originalName}" from storage: ${failed[0]!.error}`);
  }

  return { freedBytes };
}

export interface BulkResult {
  /** Items the operation actually applied to, in the order the database returned them. */
  succeeded: IMedia[];
  failed: Array<{ id: string; error: string }>;
}

/** Every distinct folder whose itemCount a bulk operation could have invalidated. */
function affectedFolderIds(...groups: Array<Array<Types.ObjectId | null>>): string[] {
  const ids = new Set<string>();
  for (const group of groups) {
    for (const id of group) {
      if (id) ids.add(id.toString());
    }
  }
  return [...ids];
}

/**
 * Soft-deletes many files in one pass.
 *
 * Deliberately partial: ids that no longer resolve (already trashed, or deleted by another
 * tab) are reported in `failed` rather than failing the whole request, so a stale selection
 * can't block the items that are still valid.
 */
export async function bulkSoftDeleteMedia(ids: string[]): Promise<BulkResult> {
  const items = await Media.find({ _id: { $in: ids }, isDeleted: false });
  const found = new Set(items.map((m) => m._id.toString()));
  const failed = ids
    .filter((id) => !found.has(id))
    .map((id) => ({ id, error: 'File not found or already in trash' }));

  if (items.length === 0) return { succeeded: [], failed };

  const deletedAt = new Date();
  // A bulk delete is still a direct action per file, so each becomes its own trash entry.
  await Media.updateMany(
    { _id: { $in: [...found] } },
    { isDeleted: true, deletedAt, deletedCascadeRoot: null },
  );

  for (const folderId of affectedFolderIds(items.map((m) => m.folderId))) {
    await recalculateItemCount(folderId);
  }

  // Reflect the update on the in-memory docs so callers can serialize them straight back.
  for (const item of items) {
    item.isDeleted = true;
    item.deletedAt = deletedAt;
  }

  return { succeeded: items, failed };
}

/** Moves many files into one folder (or to unfiled when `folderId` is null). */
export async function bulkMoveMedia(ids: string[], folderId: string | null): Promise<BulkResult> {
  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, isDeleted: false });
    if (!folder) throw AppError.notFound('Target folder not found');
  }

  const items = await Media.find({ _id: { $in: ids }, isDeleted: false });
  const found = new Set(items.map((m) => m._id.toString()));
  const failed = ids.filter((id) => !found.has(id)).map((id) => ({ id, error: 'File not found' }));

  if (items.length === 0) return { succeeded: [], failed };

  const target = folderId ? new Types.ObjectId(folderId) : null;
  const previousFolderIds = items.map((m) => m.folderId);
  await Media.updateMany({ _id: { $in: [...found] } }, { folderId: target });

  for (const affected of affectedFolderIds(previousFolderIds, [target])) {
    await recalculateItemCount(affected);
  }

  for (const item of items) {
    item.folderId = target;
  }

  return { succeeded: items, failed };
}
