import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, 'Folder name is required').max(255),
  description: z.string().trim().max(2000).optional(),
  parentFolder: objectId.nullable().optional(),
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  parentFolder: objectId.nullable().optional(),
  coverImage: objectId.nullable().optional(),
});

export const folderIdParamSchema = z.object({ id: objectId });

export const listFoldersQuerySchema = z.object({
  parentFolder: objectId.optional(),
  includeDeleted: z.coerce.boolean().optional().default(false),
  search: z.string().trim().optional(),
});
