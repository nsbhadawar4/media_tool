import type { Request, Response } from 'express';
import { Media } from '../models/Media';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { getStorageProvider } from '../services/storage';
import { serializeMedia } from '../utils/mediaUrls';
import * as mediaService from '../services/mediaService';

const SORT_MAP: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_asc: { originalName: 1 },
  name_desc: { originalName: -1 },
  size_desc: { size: -1 },
  size_asc: { size: 1 },
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const listMedia = asyncHandler(async (req: Request, res: Response) => {
  const { folderId, fileType, search, isDeleted, sort, page, limit } = req.query as unknown as {
    folderId?: string;
    fileType?: string;
    search?: string;
    isDeleted?: boolean;
    sort: string;
    page: number;
    limit: number;
  };

  const filter: Record<string, unknown> = { isDeleted: isDeleted ?? false };
  if (folderId) filter.folderId = folderId;
  if (fileType) filter.fileType = fileType;
  if (search) filter.originalName = { $regex: escapeRegex(search), $options: 'i' };

  const [items, total] = await Promise.all([
    Media.find(filter)
      .sort(SORT_MAP[sort] ?? SORT_MAP.newest)
      .skip((page - 1) * limit)
      .limit(limit),
    Media.countDocuments(filter),
  ]);

  sendSuccess(
    res,
    items.map((m) => serializeMedia(m, req.admin!.id)),
    200,
    { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  );
});

export const getMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw AppError.notFound('File not found');
  sendSuccess(res, serializeMedia(media, req.admin!.id));
});

/** Parses the browser-reported video length, ignoring anything non-finite or implausible. */
function parseDuration(raw: unknown): number | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds);
}

export const uploadMedia = asyncHandler(async (req: Request, res: Response) => {
  // `.fields()` gives a fieldname -> files map rather than a flat array (see middleware/upload).
  const parts = (req.files as Record<string, Express.Multer.File[]> | undefined) ?? {};
  const files = parts.files ?? [];
  const poster = parts.poster?.[0] ?? null;

  if (files.length === 0) throw AppError.badRequest('No files were uploaded');

  const folderId = (req.body.folderId as string | undefined) ?? null;
  const duration = parseDuration(req.body.duration);

  const uploaded: ReturnType<typeof serializeMedia>[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      const media = await mediaService.saveUploadedMedia({
        file: { originalname: file.originalname, path: file.path, mimetype: file.mimetype, size: file.size },
        folderId,
        uploadedBy: req.admin!.id,
        // A poster belongs to exactly one video, so it only applies when this request
        // carries a single file — which is how the frontend always uploads.
        posterPath: files.length === 1 ? poster?.path ?? null : null,
        duration: files.length === 1 ? duration : null,
      });
      uploaded.push(serializeMedia(media, req.admin!.id));
      await logActivity(req, {
        action: 'media_uploaded',
        targetType: 'media',
        targetId: media._id,
        targetName: media.originalName,
        message: `Uploaded "${media.originalName}"`,
        metadata: { folderId },
      });
    } catch (err) {
      failed.push({ fileName: file.originalname, error: err instanceof Error ? err.message : 'Upload failed' });
    }
  }

  sendSuccess(res, { uploaded, failed }, failed.length > 0 && uploaded.length === 0 ? 400 : 201);
});

export const updateMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await mediaService.renameMedia(req.params.id, req.body.originalName);

  await logActivity(req, {
    action: 'media_renamed',
    targetType: 'media',
    targetId: media._id,
    targetName: media.originalName,
    message: `Renamed file to "${media.originalName}"`,
  });

  sendSuccess(res, serializeMedia(media, req.admin!.id));
});

export const moveMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await mediaService.moveMedia(req.params.id, req.body.folderId ?? null);

  await logActivity(req, {
    action: 'media_moved',
    targetType: 'media',
    targetId: media._id,
    targetName: media.originalName,
    message: `Moved "${media.originalName}"`,
    metadata: { folderId: media.folderId },
  });

  sendSuccess(res, serializeMedia(media, req.admin!.id));
});

export const deleteMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await mediaService.softDeleteMedia(req.params.id);

  await logActivity(req, {
    action: 'media_deleted',
    targetType: 'media',
    targetId: media._id,
    targetName: media.originalName,
    message: `Moved "${media.originalName}" to trash`,
  });

  sendSuccess(res, serializeMedia(media, req.admin!.id));
});

export const restoreMedia = asyncHandler(async (req: Request, res: Response) => {
  const media = await mediaService.restoreMedia(req.params.id);

  await logActivity(req, {
    action: 'media_restored',
    targetType: 'media',
    targetId: media._id,
    targetName: media.originalName,
    message: `Restored "${media.originalName}" from trash`,
  });

  sendSuccess(res, serializeMedia(media, req.admin!.id));
});

/** Parses a single-range `Range: bytes=start-end` header. Returns null for anything else (multi-range, malformed). */
function parseRange(header: string | undefined, totalSize: number): { start: number; end: number } | null {
  if (!header?.startsWith('bytes=')) return null;
  const [startStr, endStr] = header.replace('bytes=', '').split('-');
  if (startStr === undefined) return null;

  let start: number;
  let end: number;
  if (startStr === '') {
    // suffix range: bytes=-500 -> last 500 bytes
    const suffixLength = Number(endStr);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, totalSize - suffixLength);
    end = totalSize - 1;
  } else {
    start = Number(startStr);
    end = endStr ? Number(endStr) : totalSize - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0) return null;
  return { start, end: Math.min(end, totalSize - 1) };
}

async function streamMediaResponse(req: Request, res: Response, disposition: 'inline' | 'attachment') {
  const media = await Media.findById(req.params.id);
  if (!media) throw AppError.notFound('File not found');

  const provider = getStorageProvider();

  // First call without a range just to learn the total size for parsing the Range header.
  const probe = await provider.getObjectStream(media.storageKey);
  probe.stream.destroy();

  const range = parseRange(req.headers.range, probe.totalSize);
  const result = await provider.getObjectStream(media.storageKey, range ?? undefined);

  res.setHeader('Content-Type', media.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="${encodeURIComponent(media.originalName)}"`,
  );

  if (result.range) {
    res.status(206);
    res.setHeader('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.totalSize}`);
    res.setHeader('Content-Length', result.contentLength);
  } else {
    res.setHeader('Content-Length', result.totalSize);
  }

  result.stream.on('error', () => res.destroy());
  result.stream.pipe(res);
}

export const streamMedia = asyncHandler(async (req: Request, res: Response) => {
  await streamMediaResponse(req, res, 'inline');
});

export const downloadMedia = asyncHandler(async (req: Request, res: Response) => {
  await streamMediaResponse(req, res, 'attachment');
});

/**
 * Serves the derived thumbnail. Kept separate from `streamMedia` on purpose: thumbnails
 * are small, immutable and requested dozens at a time by the gallery, so they get an
 * aggressive cache header and skip the Range handling that streaming a video needs.
 */
export const streamThumbnail = asyncHandler(async (req: Request, res: Response) => {
  const media = await Media.findById(req.params.id);
  if (!media) throw AppError.notFound('File not found');
  if (!media.thumbnailKey) throw AppError.notFound('No thumbnail for this file');

  const result = await getStorageProvider().getObjectStream(media.thumbnailKey);

  res.setHeader('Content-Type', 'image/webp');
  res.setHeader('Content-Length', result.totalSize);
  // Derived from bytes that never change, and the URL is scoped by a signed token, so it
  // is safe to let the browser keep it for as long as that token could live.
  res.setHeader('Cache-Control', 'private, max-age=86400, immutable');

  result.stream.on('error', () => res.destroy());
  result.stream.pipe(res);
});

/** Shared shape for both bulk endpoints: what went through, and what didn't. */
function bulkResponse(result: mediaService.BulkResult, adminId: string) {
  return {
    succeeded: result.succeeded.map((m) => serializeMedia(m, adminId)),
    failed: result.failed,
  };
}

export const bulkDeleteMedia = asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body as { ids: string[] };
  const result = await mediaService.bulkSoftDeleteMedia(ids);

  if (result.succeeded.length > 0) {
    // One summary entry rather than one per file — a 40-item delete should read as a
    // single action in the activity feed, not bury everything else in it.
    await logActivity(req, {
      action: 'media_deleted',
      targetType: 'media',
      targetName: null,
      message: `Moved ${result.succeeded.length} file${result.succeeded.length === 1 ? '' : 's'} to trash`,
      metadata: { names: result.succeeded.map((m) => m.originalName) },
    });
  }

  sendSuccess(res, bulkResponse(result, req.admin!.id));
});

export const bulkMoveMedia = asyncHandler(async (req: Request, res: Response) => {
  const { ids, folderId } = req.body as { ids: string[]; folderId: string | null };
  const result = await mediaService.bulkMoveMedia(ids, folderId);

  if (result.succeeded.length > 0) {
    await logActivity(req, {
      action: 'media_moved',
      targetType: 'media',
      targetName: null,
      message: `Moved ${result.succeeded.length} file${result.succeeded.length === 1 ? '' : 's'}`,
      metadata: { folderId, names: result.succeeded.map((m) => m.originalName) },
    });
  }

  sendSuccess(res, bulkResponse(result, req.admin!.id));
});
