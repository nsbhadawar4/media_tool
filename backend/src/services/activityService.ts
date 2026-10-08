import type { Request } from 'express';
import { Types } from 'mongoose';
import { ActivityLog } from '../models/ActivityLog';
import type { ActivityAction, ActivityStatus, ActivityTargetType } from '../config/constants';
import type { AuthProvider } from '../models/User';

export interface LogActivityInput {
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId?: Types.ObjectId | string | null;
  targetName?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  /** Defaults to success. */
  status?: ActivityStatus;
  authProvider?: AuthProvider | null;
  /**
   * Who did it, when the request has no session yet (signing up or in). Otherwise the signed-in
   * user (req.user) is the actor.
   */
  actor?: { id: Types.ObjectId | string; label: string } | null;
  /** Whose timeline the event belongs to; defaults to the actor. See IActivityLog.subjectUserId. */
  subjectUserId?: Types.ObjectId | string | null;
  /** The email (lower-cased) or E.164 number the event named. */
  subjectIdentifier?: string | null;
}

function extractIp(req: Request): string | null {
  return req.ip ?? req.socket?.remoteAddress ?? null;
}

/** Keys that must never be written to the log, at any depth. */
const SECRET_KEY = /pass|otp|token|secret|hash|jwt|cookie|credential|authorization|api[-_]?key|session/i;
const MAX_STRING = 500;

/**
 * Metadata is free-form, so it is filtered on the way in: anything named like a secret is dropped
 * (wherever it is nested), long strings are cut, and depth is bounded. The log is an audit trail,
 * not a place a password or code could ever end up.
 */
export function sanitizeMetadata(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) return value;
  if (value instanceof Types.ObjectId) return value;
  if (depth >= 3) return undefined;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitizeMetadata(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY.test(key)) continue;
      const clean = sanitizeMetadata(v, depth + 1);
      if (clean !== undefined) out[key] = clean;
    }
    return out;
  }
  return undefined;
}

const toId = (id: Types.ObjectId | string | null | undefined) => (id ? new Types.ObjectId(id.toString()) : null);

/**
 * Records one meaningful business or security event (never every request). Failures to write are
 * swallowed: the audit log must not break the action it describes.
 */
export async function logActivity(req: Request, input: LogActivityInput): Promise<void> {
  try {
    const actorId = input.actor ? toId(input.actor.id) : req.user ? new Types.ObjectId(req.user.id) : null;
    const actorLabel = input.actor?.label ?? req.user?.email ?? null;
    await ActivityLog.create({
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetName: input.targetName ?? null,
      message: input.message,
      performedBy: actorId,
      performedByEmail: actorLabel,
      ip: extractIp(req),
      userAgent: req.headers['user-agent']?.slice(0, MAX_STRING) ?? null,
      metadata: input.metadata ? sanitizeMetadata(input.metadata) : undefined,
      status: input.status ?? 'success',
      authProvider: input.authProvider ?? null,
      subjectUserId: input.subjectUserId !== undefined ? toId(input.subjectUserId) : actorId,
      subjectIdentifier: input.subjectIdentifier ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Failed to write activity log', err);
  }
}
