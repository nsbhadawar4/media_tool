import type { Request, Response } from 'express';
import { ActivityLog } from '../models/ActivityLog';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';

export const listActivity = asyncHandler(async (req: Request, res: Response) => {
  const { action, page, limit } = req.query as unknown as { action?: string; page: number; limit: number };

  const filter: Record<string, unknown> = {};
  if (action) filter.action = action;

  const [items, total] = await Promise.all([
    ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    ActivityLog.countDocuments(filter),
  ]);

  sendSuccess(res, items, 200, { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) });
});
