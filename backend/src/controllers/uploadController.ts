import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { serializeMedia } from '../utils/mediaUrls';
import { signUploadToken, verifyUploadToken } from '../services/tokenService';
import * as mediaService from '../services/mediaService';
import type { CommitUploadInput, PresignUploadInput } from '../validators/uploadValidators';

/**
 * Step 1 of a direct-to-bucket upload: agree on a destination.
 *
 * Answers one of two ways. `mode: "direct"` carries a presigned PUT URL plus a token
 * describing exactly what may be stored there. `mode: "proxy"` means the active storage
 * provider cannot hand out upload URLs (local development), and the client should post
 * the file to /api/media/upload as before. Reporting that as a mode rather than an error
 * is what lets one client code path serve both environments.
 */
export const presignUpload = asyncHandler(async (req: Request, res: Response) => {
  const { fileName, mimeType, size, folderId } = req.body as PresignUploadInput;

  const target = await mediaService.prepareDirectUpload({
    ownerId: req.user!.id,
    fileName,
    mimeType,
    size,
    folderId: folderId ?? null,
  });

  if (!target) {
    sendSuccess(res, { mode: 'proxy' as const });
    return;
  }

  const { uploadUrl, ...rest } = target;

  sendSuccess(res, {
    mode: 'direct' as const,
    uploadUrl,
    // The browser must send exactly this back on the PUT; it is signed into the URL.
    contentType: target.mimeType,
    uploadToken: signUploadToken({ sub: req.user!.id, ...rest }),
  });
});

/**
 * Step 2: record a file whose bytes are already in storage.
 *
 * The token is the authorisation. It was minted for one account, one key and one set of
 * file properties, so a caller cannot commit a key they were never given — including one
 * belonging to somebody else, which would otherwise graft that file into their library.
 */
export const commitUpload = asyncHandler(async (req: Request, res: Response) => {
  const { uploadToken, width, height, duration } = req.body as CommitUploadInput;

  let payload;
  try {
    payload = verifyUploadToken(uploadToken);
  } catch {
    throw AppError.badRequest('This upload link has expired. Please try uploading again.');
  }

  if (payload.sub !== req.user!.id) {
    throw AppError.forbidden('This upload does not belong to you');
  }

  const media = await mediaService.registerDirectUpload({
    ownerId: req.user!.id,
    uploadedBy: req.user!.id,
    target: {
      key: payload.key,
      storedName: payload.storedName,
      originalName: payload.originalName,
      mimeType: payload.mimeType,
      fileType: payload.fileType,
      folderId: payload.folderId,
      maxSize: payload.maxSize,
    },
    width: width ?? null,
    height: height ?? null,
    duration: duration ?? null,
  });

  await logActivity(req, {
    action: 'media_uploaded',
    targetType: 'media',
    targetId: media._id,
    targetName: media.originalName,
    message: `Uploaded "${media.originalName}"`,
    metadata: { folderId: payload.folderId },
  });

  sendSuccess(res, serializeMedia(media, req.user!.id), 201);
});

/**
 * Attaches a poster frame as a video's thumbnail.
 *
 * Videos are the one case a direct upload cannot cover on its own: there is no ffmpeg
 * here, so the only source of a video thumbnail is the still the browser captured at
 * upload time, and pulling the whole video back through a function to derive one would
 * be far more expensive than accepting the poster it already has. A poster is a few tens
 * of kilobytes, so it fits through the API comfortably.
 */
export const uploadThumbnail = asyncHandler(async (req: Request, res: Response) => {
  const poster = (req.file as Express.Multer.File | undefined) ?? null;
  if (!poster) throw AppError.badRequest('No poster image was uploaded');

  const media = await mediaService.attachThumbnail(req.user!.id, req.params.id, poster.path);
  sendSuccess(res, serializeMedia(media, req.user!.id));
});
