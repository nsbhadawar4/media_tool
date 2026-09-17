import { z } from 'zod';
import { FILE_TYPES } from '../config/constants';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const mediaIdParamSchema = z.object({ id: objectId });

export const uploadMediaBodySchema = z.object({
  folderId: objectId.nullable().optional(),
});

/**
 * Ids for a bulk operation. Capped at the page size the gallery can show at once, so a
 * single request can never be asked to touch an unbounded number of documents.
 */
const bulkIds = z.array(objectId).min(1, 'Select at least one file').max(200);

export const bulkDeleteMediaSchema = z.object({ ids: bulkIds });

export const bulkMoveMediaSchema = z.object({
  ids: bulkIds,
  folderId: objectId.nullable(),
});

export const updateMediaSchema = z.object({
  originalName: z.string().trim().min(1).max(500).optional(),
});

export const moveMediaSchema = z.object({
  folderId: objectId.nullable(),
});

export const sortOptions = [
  'newest',
  'oldest',
  'name_asc',
  'name_desc',
  'size_desc',
  'size_asc',
] as const;

export const listMediaQuerySchema = z.object({
  folderId: objectId.optional(),
  fileType: z.enum(FILE_TYPES).optional(),
  search: z.string().trim().optional(),
  isDeleted: z.coerce.boolean().optional().default(false),
  sort: z.enum(sortOptions).optional().default('newest'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(60),
});

export const searchQuerySchema = z.object({
  q: z.string().trim().optional().default(''),
  fileType: z.enum(FILE_TYPES).optional(),
  sort: z.enum(sortOptions).optional().default('newest'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(60),
});
