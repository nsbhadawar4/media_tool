import type { Request } from 'express';
import { Types } from 'mongoose';
import { ActivityLog } from '../models/ActivityLog';
import type { ActivityAction, ActivityTargetType } from '../config/constants';

export interface LogActivityInput {
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId?: Types.ObjectId | string | null;
  targetName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
}

/** Best-effort IP extraction; trusts X-Forwarded-For only because we terminate behind a known proxy config. */
function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0]!.trim();
  }
  return req.ip ?? req.socket.remoteAddress ?? null;
}

/**
 * Writes an activity log entry. Never throws — logging must not break the
 * primary request/response flow, so failures are swallowed after a console warning.
 */
export async function logActivity(req: Request, input: LogActivityInput): Promise<void> {
  try {
    await ActivityLog.create({
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      message: input.message,
      performedBy: req.admin ? new Types.ObjectId(req.admin.id) : null,
      performedByEmail: req.admin?.email ?? null,
      ip: extractIp(req),
      userAgent: req.headers['user-agent'] ?? null,
      metadata: input.metadata,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to write activity log', err);
  }
}
