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

export const uploadMedia = asyncHandler(async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  if (files.length === 0) throw AppError.badRequest('No files were uploaded');

  const folderId = (req.body.folderId as string | undefined) ?? null;

  const uploaded: ReturnType<typeof serializeMedia>[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];

  for (const file of files) {
    try {
      const media = await mediaService.saveUploadedMedia({
        file: { originalname: file.originalname, path: file.path, mimetype: file.mimetype, size: file.size },
        folderId,
        uploadedBy: req.admin!.id,
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
