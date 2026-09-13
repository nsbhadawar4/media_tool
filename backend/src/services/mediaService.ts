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
import { recalculateItemCount } from './folderService';

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
}

export async function saveUploadedMedia(input: SaveUploadedMediaInput): Promise<IMedia> {
  const { file, folderId, uploadedBy } = input;

  const fileType = fileTypeFromMime(file.mimetype) as FileType | null;
  if (!fileType) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw AppError.badRequest(`Unsupported file type for ${file.originalname}`);
  }

  let safeName: string;
  try {
    safeName = assertSafeFilename(file.originalname);
  } catch (err) {
    await fsp.unlink(file.path).catch(() => undefined);
    throw AppError.badRequest(err instanceof Error ? err.message : 'Invalid filename');
  }

  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, isDeleted: false });
    if (!folder) {
      await fsp.unlink(file.path).catch(() => undefined);
      throw AppError.notFound('Target folder not found');
    }
  }

  const { key, storedName } = buildStorageKey(fileType, folderId, safeName);

  let dimensions: { width: number | null; height: number | null } = { width: null, height: null };
  if (fileType === 'image') {
    dimensions = await readImageDimensions(file.path);
  }

  const provider = getStorageProvider();
  const stored = await provider.upload({ key, sourcePath: file.path, contentType: file.mimetype });

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
  await media.save();
  if (media.folderId) await recalculateItemCount(media.folderId.toString());
  return media;
}

export async function permanentlyDeleteMedia(id: string): Promise<void> {
  const media = await Media.findOne({ _id: id, isDeleted: true });
  if (!media) throw AppError.notFound('Deleted file not found');

  const provider = getStorageProvider();
  await provider.delete(media.storageKey);
  if (media.thumbnailKey) await provider.delete(media.thumbnailKey).catch(() => undefined);

  await Media.deleteOne({ _id: id });
}
