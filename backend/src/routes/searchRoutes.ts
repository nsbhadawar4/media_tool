import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';
import { serializeMedia } from '../utils/mediaUrls';
import { searchQuerySchema } from '../validators/mediaValidators';
import type { Request, Response } from 'express';

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

/** Global search across folder names and file names, with type filter + sort. */
const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const { q, fileType, sort, page, limit } = req.query as unknown as {
    q: string;
    fileType?: string;
    sort: string;
    page: number;
    limit: number;
  };

  const regex = q ? { $regex: escapeRegex(q), $options: 'i' } : undefined;

  const folderFilter: Record<string, unknown> = { isDeleted: false };
  if (regex) folderFilter.name = regex;

  const mediaFilter: Record<string, unknown> = { isDeleted: false };
  if (regex) mediaFilter.originalName = regex;
  if (fileType) mediaFilter.fileType = fileType;

  const [folders, mediaItems, mediaTotal] = await Promise.all([
    fileType ? Promise.resolve([]) : Folder.find(folderFilter).sort({ name: 1 }).limit(50),
    Media.find(mediaFilter)
      .sort(SORT_MAP[sort] ?? SORT_MAP.newest)
      .skip((page - 1) * limit)
      .limit(limit),
    Media.countDocuments(mediaFilter),
  ]);

  sendSuccess(
    res,
    {
      folders,
      media: mediaItems.map((m) => serializeMedia(m, req.admin!.id)),
    },
    200,
    { page, limit, total: mediaTotal, totalPages: Math.max(1, Math.ceil(mediaTotal / limit)) },
  );
});

const router = Router();
router.use(requireAuth);
router.get('/', validate({ query: searchQuerySchema }), globalSearch);

export default router;
