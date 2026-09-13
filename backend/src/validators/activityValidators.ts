import { z } from 'zod';
import { ACTIVITY_ACTIONS } from '../config/constants';

export const listActivityQuerySchema = z.object({
  action: z.enum(ACTIVITY_ACTIONS).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
});
