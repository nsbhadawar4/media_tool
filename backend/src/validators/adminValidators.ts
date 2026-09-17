import { z } from 'zod';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

export const userIdParamSchema = z.object({ id: objectId });

export const listUsersQuerySchema = z.object({
  search: z.string().trim().optional(),
  role: z.enum(['user', 'admin']).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});

export const setUserStatusSchema = z.object({
  isActive: z.boolean({ required_error: 'isActive is required' }),
});
