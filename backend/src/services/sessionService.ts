import { randomUUID } from 'node:crypto';
import type { Types } from 'mongoose';
import { RevokedSession } from '../models/RevokedSession';

/** A fresh, unguessable id for a new session token. */
export function newSessionId(): string {
  return randomUUID();
}

/**
 * Ends one session everywhere. Idempotent: logging out twice with the same token is fine.
 * `expiresAt` is the token's own expiry, after which the entry is no longer needed.
 */
export async function revokeSession(sid: string, userId: Types.ObjectId | string, expiresAt: Date): Promise<void> {
  await RevokedSession.updateOne({ sid }, { $setOnInsert: { sid, userId, expiresAt } }, { upsert: true });
}

export async function isSessionRevoked(sid: string): Promise<boolean> {
  return Boolean(await RevokedSession.exists({ sid }));
}
