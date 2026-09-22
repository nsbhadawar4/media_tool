import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Types } from 'mongoose';
import { Media, type IMedia } from '../models/Media';
import { Folder } from '../models/Folder';
import { getStorageProvider, storageFailure } from './storage';
import {
  EXTENSION_TO_MIME,
  fileTypeFromMime,
  STORAGE_DIR_BY_FILE_TYPE,
  type FileType,
} from '../config/constants';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { assertSafeFilename } from '../utils/filenameSafety';
import { logger } from '../utils/logger';
import { recalculateItemCount, purgeMediaRecords } from './folderService';
import { generateThumbnail } from './thumbnailService';
import { validateUploadedFile, validateStoredCopy } from './fileValidationService';
import { verifyStoredObject } from './storageIntegrityService';
import { UploadErrorCode } from '../utils/uploadErrors';

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

/**
 * Settles what a file actually is, from its name and whatever mimetype the client
 * reported. Returns null when the result isn't a type this app accepts.
 *
 * The browser's reported mimetype is not reliable for Office formats or .mkv — Windows
 * and several browsers send `application/octet-stream` for a perfectly ordinary .xlsx.
 * middleware/upload.ts already treats the extension as authoritative (it is what the
 * allow-list is keyed on), so this resolves the same way rather than rejecting the file.
 * Storing the extension's mimetype also matters downstream: served as octet-stream, a
 * spreadsheet downloads as an unopenable blob.
 *
 * Shared by both upload paths — through the API, and direct to the bucket — so the two
 * can never drift into disagreeing about which files are allowed.
 */
export function resolveFileIdentity(
  safeName: string,
  reportedMimeType: string,
): { mimeType: string; fileType: FileType } | null {
  const extension = path.extname(safeName).toLowerCase();
  const mimeType = EXTENSION_TO_MIME[extension] ?? reportedMimeType;
  const fileType = fileTypeFromMime(mimeType);
  return fileType ? { mimeType, fileType } : null;
}

/** A folder that exists but belongs to another account reads as absent, never as forbidden. */
async function folderIsOwned(ownerId: string, folderId: string | null): Promise<boolean> {
  if (!folderId) return true;
  const folder = await Folder.findOne({ _id: folderId, ownerId, isDeleted: false });
  return folder !== null;
}

export interface SaveUploadedMediaInput {
  file: UploadedFileInput;
  folderId: string | null;
  /** Authenticated caller. Stamped onto the Media document and used to verify the folder. */
  ownerId: string;
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

/**
 * Derives the preview a file of this type must have before it is allowed into the library.
 *
 * Images must have one. The gallery falls back to the full-size original when a thumbnail
 * is missing, so an image that cannot be thumbnailed becomes a tile pointing at bytes the
 * browser is no more able to decode than sharp was - a broken card, from an upload that
 * reported success. Refusing here is what makes that state unreachable.
 *
 * Videos need not. Their still comes from the browser, there is no ffmpeg to recover one,
 * and a video without a thumbnail renders as a video placeholder rather than as a broken
 * image - an honest state the client already handles. Documents never get one at all.
 *
 * Must run before the file is stored: the provider consumes its source, so the pixels are
 * gone by the time the upload returns.
 */
async function derivePreviewKey(
  fileType: FileType,
  sourcePath: string,
  posterPath: string | null,
  storedName: string,
): Promise<string | null> {
  if (fileType === 'image') {
    const key = await generateThumbnail({ sourcePath, storedName });
    if (!key) {
      throw AppError.internal(
        'A preview could not be generated for this image, so it was not saved. Please try again.',
        UploadErrorCode.PreviewGenerationFailed,
      );
    }
    return key;
  }

  if (fileType === 'video' && posterPath) {
    // Not fatal: a browser that could not capture a still still uploaded a valid video.
    return generateThumbnail({ sourcePath: posterPath, storedName });
  }

  return null;
}

/**
 * Stores one uploaded file, or leaves nothing behind.
 *
 * The order is the point:
 *
 *   validate the bytes -> derive the preview -> store -> read back and verify -> record
 *
 * Every earlier version of this created the media record as soon as the provider's write
 * returned, which is what let a file that was never really stored - or was never really an
 * image - become a permanent broken tile. Nothing is recorded now until the object has
 * been located, measured and read back against the checksum taken before it was written,
 * and any failure after the write removes what was written. A caller that gets an error
 * from this can retry it unchanged: there is no half-finished upload to clean up first.
 */
export async function saveUploadedMedia(input: SaveUploadedMediaInput): Promise<IMedia> {
  const { file, folderId, ownerId, uploadedBy, posterPath, duration } = input;
  const provider = getStorageProvider();

  /** What has to be removed from storage if a later step fails. */
  let storedKey: string | null = null;
  let thumbnailKey: string | null = null;

  try {
    let safeName: string;
    try {
      safeName = assertSafeFilename(file.originalname);
    } catch (err) {
      throw AppError.badRequest(
        err instanceof Error ? err.message : 'Invalid filename',
        undefined,
        UploadErrorCode.InvalidFileType,
      );
    }

    // Reads the actual bytes. Everything downstream uses what this returns, never the
    // extension or the client's content type - see fileValidationService.
    const validated = await validateUploadedFile({
      filePath: file.path,
      safeName,
      reportedMimeType: file.mimetype,
    });

    // Uploading into someone else's folder must be impossible, so the folder is looked up
    // by id *and* owner. A folder that exists but belongs to another account reads as absent.
    if (!(await folderIsOwned(ownerId, folderId))) {
      throw AppError.notFound('Target folder not found');
    }

    const { key, storedName } = buildStorageKey(validated.fileType, folderId, safeName);

    thumbnailKey = await derivePreviewKey(validated.fileType, file.path, posterPath ?? null, storedName);

    let stored;
    try {
      stored = await provider.upload({
        key,
        sourcePath: file.path,
        contentType: validated.mimeType,
      });
    } catch (err) {
      throw storageFailure('store the file', err, UploadErrorCode.StorageUploadFailed);
    }
    storedKey = stored.key;

    await verifyStoredObject({
      key: storedKey,
      expectedSize: validated.size,
      expectedSha256: validated.sha256,
      expectedContentType: validated.mimeType,
    });

    if (thumbnailKey) {
      // Its bytes were never in hand here - generateThumbnail wrote and uploaded them - so
      // there is no checksum to compare. That it exists and reads is what the gallery needs.
      const thumbnailStat = await provider.stat(thumbnailKey);
      await verifyStoredObject({ key: thumbnailKey, expectedSize: thumbnailStat?.size ?? 0 });
    }

    let media: IMedia;
    try {
      media = await Media.create({
        ownerId: new Types.ObjectId(ownerId),
        folderId: folderId ?? null,
        originalName: safeName,
        storedName,
        storageKey: stored.key,
        storageProvider: provider.name,
        url: provider.getUrl(stored.key),
        mimeType: validated.mimeType,
        fileType: validated.fileType,
        size: validated.size,
        checksum: validated.sha256,
        width: validated.width,
        height: validated.height,
        duration: validated.fileType === 'video' ? (duration ?? null) : null,
        thumbnailKey,
        uploadedBy: new Types.ObjectId(uploadedBy),
      });
    } catch (err) {
      logger.error(`Could not record uploaded media ${stored.key}`, err);
      throw AppError.internal(
        'The file was stored but could not be recorded, so the upload was cancelled. Please try again.',
        UploadErrorCode.MediaRecordFailed,
      );
    }

    /**
     * Past the point of no return: the file is stored, verified and recorded, which is what
     * this upload promised. The folder's counter and cover image are derived conveniences -
     * the counter is recomputed elsewhere anyway - so failing them must not undo a good
     * upload, and must not trigger the rollback below either.
     */
    if (folderId) {
      try {
        await recalculateItemCount(ownerId, folderId);
        await Folder.updateOne({ _id: folderId, ownerId, coverImage: null }, { coverImage: media._id });
      } catch (err) {
        logger.warn(`Uploaded ${media._id.toString()} but could not update folder ${folderId}`, err);
      }
    }

    return media;
  } catch (err) {
    // Nothing partially uploaded survives a failure - no orphaned object for a record that
    // was never written, and no thumbnail for an original that is not there.
    if (storedKey) {
      const orphan = storedKey;
      await provider.delete(orphan).catch((cleanupError: unknown) => {
        logger.error(`Could not roll back stored object ${orphan}`, cleanupError);
      });
    }
    if (thumbnailKey) {
      await provider.delete(thumbnailKey).catch(() => undefined);
    }
    throw err;
  } finally {
    // Runs on every path, including the successful one - where the provider has already
    // consumed the original and this simply finds nothing to remove.
    await fsp.unlink(file.path).catch(() => undefined);
    if (posterPath) await fsp.unlink(posterPath).catch(() => undefined);
  }
}

export async function renameMedia(ownerId: string, id: string, originalName: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, ownerId, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');
  media.originalName = originalName;
  await media.save();
  return media;
}

export async function moveMedia(
  ownerId: string,
  id: string,
  folderId: string | null,
): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, ownerId, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');

  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, ownerId, isDeleted: false });
    if (!folder) throw AppError.notFound('Target folder not found');
  }

  const previousFolderId = media.folderId ? media.folderId.toString() : null;
  media.folderId = folderId ? new Types.ObjectId(folderId) : null;
  await media.save();

  if (previousFolderId) await recalculateItemCount(ownerId, previousFolderId);
  if (folderId) await recalculateItemCount(ownerId, folderId);

  return media;
}

export async function softDeleteMedia(ownerId: string, id: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, ownerId, isDeleted: false });
  if (!media) throw AppError.notFound('File not found');
  media.isDeleted = true;
  media.deletedAt = new Date();
  // Deleted on its own, so it is its own trash entry and no folder restore will reclaim it.
  media.deletedCascadeRoot = null;
  await media.save();
  if (media.folderId) await recalculateItemCount(ownerId, media.folderId.toString());
  return media;
}

export async function restoreMedia(ownerId: string, id: string): Promise<IMedia> {
  const media = await Media.findOne({ _id: id, ownerId, isDeleted: true });
  if (!media) throw AppError.notFound('Deleted file not found');

  if (media.folderId) {
    const folder = await Folder.findOne({ _id: media.folderId, ownerId });
    if (!folder || folder.isDeleted) {
      media.folderId = null; // parent folder is gone/still trashed — restore to unfiled
    }
  }

  media.isDeleted = false;
  media.deletedAt = null;
  media.deletedCascadeRoot = null;
  await media.save();
  if (media.folderId) await recalculateItemCount(ownerId, media.folderId.toString());
  return media;
}

/**
 * Irreversibly removes one trashed file and its bytes. Shares purgeMediaRecords with the
 * folder purge so both paths delete storage before the record, never the other way round.
 */
export async function permanentlyDeleteMedia(
  ownerId: string,
  id: string,
): Promise<{ freedBytes: number }> {
  const media = await Media.findOne({ _id: id, ownerId, isDeleted: true });
  if (!media) throw AppError.notFound('Deleted file not found');

  const { failed, freedBytes } = await purgeMediaRecords(ownerId, [media]);
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
export async function bulkSoftDeleteMedia(ownerId: string, ids: string[]): Promise<BulkResult> {
  const items = await Media.find({ _id: { $in: ids }, ownerId, isDeleted: false });
  const found = new Set(items.map((m) => m._id.toString()));
  const failed = ids
    .filter((id) => !found.has(id))
    .map((id) => ({ id, error: 'File not found or already in trash' }));

  if (items.length === 0) return { succeeded: [], failed };

  const deletedAt = new Date();
  // A bulk delete is still a direct action per file, so each becomes its own trash entry.
  await Media.updateMany(
    { _id: { $in: [...found] }, ownerId },
    { isDeleted: true, deletedAt, deletedCascadeRoot: null },
  );

  for (const folderId of affectedFolderIds(items.map((m) => m.folderId))) {
    await recalculateItemCount(ownerId, folderId);
  }

  // Reflect the update on the in-memory docs so callers can serialize them straight back.
  for (const item of items) {
    item.isDeleted = true;
    item.deletedAt = deletedAt;
  }

  return { succeeded: items, failed };
}

/** Moves many files into one folder (or to unfiled when `folderId` is null). */
export async function bulkMoveMedia(
  ownerId: string,
  ids: string[],
  folderId: string | null,
): Promise<BulkResult> {
  if (folderId) {
    const folder = await Folder.findOne({ _id: folderId, ownerId, isDeleted: false });
    if (!folder) throw AppError.notFound('Target folder not found');
  }

  const items = await Media.find({ _id: { $in: ids }, ownerId, isDeleted: false });
  const found = new Set(items.map((m) => m._id.toString()));
  const failed = ids.filter((id) => !found.has(id)).map((id) => ({ id, error: 'File not found' }));

  if (items.length === 0) return { succeeded: [], failed };

  const target = folderId ? new Types.ObjectId(folderId) : null;
  const previousFolderIds = items.map((m) => m.folderId);
  await Media.updateMany({ _id: { $in: [...found] }, ownerId }, { folderId: target });

  for (const affected of affectedFolderIds(previousFolderIds, [target])) {
    await recalculateItemCount(ownerId, affected);
  }

  for (const item of items) {
    item.folderId = target;
  }

  return { succeeded: items, failed };
}

/* -------------------------------------------------------------------------- */
/* Direct-to-bucket uploads                                                     */
/* -------------------------------------------------------------------------- */

/**
 * On a serverless host a request body is capped well below the size of an ordinary
 * photo, so bytes cannot travel through the API at all. These two functions split an
 * upload in half around that: the server decides *where* the file may go and signs a URL
 * for exactly that spot, the browser PUTs the bytes straight to storage, and the server
 * then records what actually arrived.
 *
 * Every decision that matters — the name, the resolved type, the target folder, the size
 * ceiling — is made here in `prepare`, carried in a signed token, and re-checked in
 * `register`. The client never gets to name a storage key.
 */

/**
 * Largest stored object worth pulling back out of storage to derive metadata from.
 *
 * A direct upload never passes through this server, so the only way to read a file's
 * pixels is to download it again. That is affordable for an ordinary photo and not for
 * a 200 MB raw scan, which would spend function time and memory to produce a 20 KB
 * thumbnail. Past this ceiling both the thumbnail and the dimensions are skipped, and
 * null is already a supported value for each.
 */
const MAX_DERIVED_SOURCE_BYTES = 64 * 1024 * 1024;

/**
 * Streams a stored object to a temp file so sharp can read it. Returns null — never
 * throws — when the object is too large or cannot be fetched: everything derived from
 * it is optional, and a failure here must not cost an upload that already succeeded.
 */
async function downloadToTemp(
  storageKey: string,
  storedName: string,
  byteSize: number,
): Promise<string | null> {
  if (byteSize > MAX_DERIVED_SOURCE_BYTES) {
    logger.info(`Skipping derived metadata for ${storedName}: larger than the download ceiling`);
    return null;
  }

  const extension = path.extname(storedName) || '.bin';
  const target = path.join(env.tmpDir, `src-${crypto.randomBytes(8).toString('hex')}${extension}`);

  try {
    await fsp.mkdir(env.tmpDir, { recursive: true });
    const { stream } = await getStorageProvider().getObjectStream(storageKey);
    await pipeline(stream, createWriteStream(target));
    return target;
  } catch (err) {
    logger.warn(`Could not download ${storedName}`, err instanceof Error ? err.message : err);
    await fsp.unlink(target).catch(() => undefined);
    return null;
  }
}

/** One decimal place, with a trailing ".0" trimmed — "4.4", not "4.44" or "4". */
function formatMegabytes(bytes: number): string {
  return (Math.round((bytes / (1024 * 1024)) * 10) / 10).toString();
}

export interface PrepareDirectUploadInput {
  ownerId: string;
  fileName: string;
  /** What the browser thinks the file is; the extension still wins (resolveFileIdentity). */
  mimeType: string;
  /** Declared up front only to fail early — the real size is measured at register time. */
  size: number;
  folderId: string | null;
}

export interface DirectUploadTarget {
  uploadUrl: string;
  key: string;
  storedName: string;
  originalName: string;
  mimeType: string;
  fileType: FileType;
  folderId: string | null;
  maxSize: number;
}

/**
 * Validates an intended upload and mints a presigned PUT URL for it.
 *
 * Returns null when the active storage provider cannot presign (local dev), which is the
 * signal for the caller to answer "upload through the API instead" rather than an error.
 */
export async function prepareDirectUpload(
  input: PrepareDirectUploadInput,
): Promise<DirectUploadTarget | null> {
  const { ownerId, fileName, mimeType, size, folderId } = input;

  let safeName: string;
  try {
    safeName = assertSafeFilename(fileName);
  } catch (err) {
    throw AppError.badRequest(err instanceof Error ? err.message : 'Invalid filename');
  }

  const identity = resolveFileIdentity(safeName, mimeType);
  if (!identity) throw AppError.badRequest(`Unsupported file type for ${fileName}`);

  if (size > env.maxFileSizeBytes) {
    throw AppError.tooLarge(`Files must be ${env.MAX_FILE_SIZE_MB} MB or smaller`);
  }

  if (!(await folderIsOwned(ownerId, folderId))) {
    throw AppError.notFound('Target folder not found');
  }

  const { key, storedName } = buildStorageKey(identity.fileType, folderId, safeName);

  /**
   * The first point at which a deployment's storage configuration is actually exercised,
   * and therefore where a missing variable or a rejected credential surfaces. Reported as
   * what it is rather than as an unexplained fault — an upload that fails here has nothing
   * to do with the file the user picked, and telling them "Internal server error" sends
   * them retrying a file that was never the problem.
   */
  let uploadUrl: string | null;
  try {
    uploadUrl = await getStorageProvider().getUploadUrl({
      key,
      contentType: identity.mimeType,
    });
  } catch (err) {
    throw storageFailure('prepare an upload', err);
  }

  if (!uploadUrl) {
    /**
     * Proxy mode: this provider has no URL for the browser to PUT to, so the bytes come
     * through the API and the platform's request body cap is the real ceiling — lower
     * than MAX_FILE_SIZE_MB, and worth saying here.
     *
     * The alternative is silence: the platform rejects an oversized body before the
     * function is even invoked, so the app never sees the request and the user gets a
     * failure with no explanation attached to a file that was only ever too large.
     */
    if (size > env.proxyUploadMaxBytes) {
      throw AppError.tooLarge(
        `Files must be ${formatMegabytes(env.proxyUploadMaxBytes)} MB or smaller on this ` +
          'deployment, because they are stored through the API rather than uploaded straight ' +
          'to a bucket. Object storage (STORAGE_PROVIDER=r2 or s3) removes this limit.',
      );
    }
    return null;
  }

  return {
    uploadUrl,
    key,
    storedName,
    originalName: safeName,
    mimeType: identity.mimeType,
    fileType: identity.fileType,
    folderId,
    maxSize: env.maxFileSizeBytes,
  };
}

export interface RegisterDirectUploadInput {
  ownerId: string;
  uploadedBy: string;
  /** Contents of the upload token minted by prepareDirectUpload, already verified. */
  target: Omit<DirectUploadTarget, 'uploadUrl'>;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
}

/**
 * Records a file the browser uploaded directly, after confirming it really is in storage
 * and really is within the size it was allowed.
 *
 * The size check is not a formality. Nothing stops a client PUTting more bytes than it
 * declared — the presigned URL constrains the key and the content type, not the length —
 * so the object is measured here, and one that overruns is deleted rather than recorded.
 */
export async function registerDirectUpload(input: RegisterDirectUploadInput): Promise<IMedia> {
  const { ownerId, uploadedBy, target, width, height, duration } = input;
  const provider = getStorageProvider();

  /** Removed unless this function returns a record that describes it. */
  let thumbnailKey: string | null = null;
  let localCopy: string | null = null;
  let succeeded = false;

  const discardUpload = async (reason: string) => {
    logger.warn(`Discarding direct upload ${target.key}: ${reason}`);
    await provider.delete(target.key).catch(() => undefined);
  };

  try {
    let stat;
    try {
      stat = await provider.stat(target.key);
    } catch (err) {
      throw storageFailure('confirm the upload', err, UploadErrorCode.StorageVerificationFailed);
    }

    if (!stat) {
      throw AppError.badRequest(
        'The uploaded file was not found in storage. Please try again.',
        undefined,
        UploadErrorCode.StorageUploadFailed,
      );
    }

    /**
     * The size check is not a formality. Nothing stops a client PUTting more bytes than it
     * declared - the presigned URL constrains the key and the content type, not the length.
     */
    if (stat.size > target.maxSize) {
      await discardUpload('larger than the size it was authorised for');
      throw AppError.tooLarge(
        `Files must be ${env.MAX_FILE_SIZE_MB} MB or smaller`,
        UploadErrorCode.FileTooLarge,
      );
    }
    if (stat.size === 0) {
      await discardUpload('empty');
      throw AppError.badRequest('The uploaded file was empty', undefined, UploadErrorCode.EmptyFile);
    }

    // Re-checked rather than trusted from the token: the folder may have been deleted, or
    // moved to the trash, in the time the browser spent uploading.
    if (!(await folderIsOwned(ownerId, target.folderId))) {
      await discardUpload('its target folder no longer exists');
      throw AppError.notFound('Target folder not found');
    }

    /**
     * Bytes that never passed through this server still have to be examined, or a direct
     * upload would be the way around every check the through-the-API path applies: a
     * renamed text file would become an image record and a permanently broken tile, which
     * is exactly the failure this whole pipeline exists to make unreachable.
     *
     * Pulling the object back is the only way to see it. Past the ceiling that is not
     * affordable, and the file is accepted on the strength of the signed token's declared
     * type - a deliberate, bounded trade, not an oversight: only the account that was
     * granted the upload can reach that path, and the ceiling is far above any photo.
     */
    localCopy = await downloadToTemp(target.key, target.storedName, stat.size);

    let validated = null;
    if (localCopy) {
      try {
        validated = await validateStoredCopy({
          filePath: localCopy,
          safeName: target.originalName,
          reportedMimeType: target.mimeType,
        });
      } catch (err) {
        await discardUpload('it failed validation');
        throw err;
      }

      if (validated.fileType !== target.fileType) {
        await discardUpload(`its contents are ${validated.fileType}, not ${target.fileType}`);
        throw AppError.badRequest(
          'This file does not match the type it was uploaded as.',
          undefined,
          UploadErrorCode.InvalidFileContent,
        );
      }

      if (validated.fileType === 'image') {
        thumbnailKey = await generateThumbnail({
          sourcePath: localCopy,
          storedName: target.storedName,
        });
        if (!thumbnailKey) {
          await discardUpload('no preview could be generated for it');
          throw AppError.internal(
            'A preview could not be generated for this image, so it was not saved. Please try again.',
            UploadErrorCode.PreviewGenerationFailed,
          );
        }
      }
    }

    let media: IMedia;
    try {
      media = await Media.create({
        ownerId: new Types.ObjectId(ownerId),
        folderId: target.folderId ?? null,
        originalName: target.originalName,
        storedName: target.storedName,
        storageKey: target.key,
        storageProvider: provider.name,
        url: provider.getUrl(target.key),
        // From the bytes when they could be read, from the signed token when they could not.
        mimeType: validated?.mimeType ?? target.mimeType,
        fileType: validated?.fileType ?? target.fileType,
        size: stat.size,
        checksum: validated?.sha256 ?? null,
        // Measured server-side where possible; the client's values are the fallback.
        width: validated?.width ?? width ?? null,
        height: validated?.height ?? height ?? null,
        duration: target.fileType === 'video' ? (duration ?? null) : null,
        thumbnailKey,
        uploadedBy: new Types.ObjectId(uploadedBy),
      });
    } catch (err) {
      logger.error(`Could not record direct upload ${target.key}`, err);
      await discardUpload('its record could not be written');
      throw AppError.internal(
        'The file was stored but could not be recorded, so the upload was cancelled. Please try again.',
        UploadErrorCode.MediaRecordFailed,
      );
    }

    succeeded = true;

    if (target.folderId) {
      try {
        await recalculateItemCount(ownerId, target.folderId);
        await Folder.updateOne(
          { _id: target.folderId, ownerId, coverImage: null },
          { coverImage: media._id },
        );
      } catch (err) {
        logger.warn(`Recorded ${media._id.toString()} but could not update its folder`, err);
      }
    }

    return media;
  } finally {
    if (localCopy) await fsp.unlink(localCopy).catch(() => undefined);
    // A thumbnail derived for a record that was never written would otherwise sit in the
    // bucket forever with nothing referring to it.
    if (!succeeded && thumbnailKey) await provider.delete(thumbnailKey).catch(() => undefined);
  }
}

/**
 * Attaches a thumbnail derived from a client-supplied image (a video's poster frame) to
 * media the caller owns. Replaces any existing thumbnail, deleting the old object.
 */
export async function attachThumbnail(
  ownerId: string,
  mediaId: string,
  posterPath: string,
): Promise<IMedia> {
  const media = await Media.findOne({ _id: mediaId, ownerId, isDeleted: false });
  if (!media) {
    await fsp.unlink(posterPath).catch(() => undefined);
    throw AppError.notFound('File not found');
  }

  const previousKey = media.thumbnailKey ?? null;
  const thumbnailKey = await generateThumbnail({ sourcePath: posterPath, storedName: media.storedName });
  // generateThumbnail reads the poster but never removes it, so drop it here either way.
  await fsp.unlink(posterPath).catch(() => undefined);

  if (!thumbnailKey) return media;

  media.thumbnailKey = thumbnailKey;
  await media.save();

  if (previousKey && previousKey !== thumbnailKey) {
    await getStorageProvider().delete(previousKey).catch(() => undefined);
  }

  return media;
}
