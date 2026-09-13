import { z } from 'zod';
import { FILE_TYPES } from '../config/constants';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const mediaIdParamSchema = z.object({ id: objectId });

export const uploadMediaBodySchema = z.object({
  folderId: objectId.nullable().optional(),
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
