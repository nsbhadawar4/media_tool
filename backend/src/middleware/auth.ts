import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifySessionToken } from '../services/tokenService';
import { clearSessionCookie } from '../utils/cookies';
import { User, accountLabel } from '../models/User';
import { isSessionRevoked } from '../services/sessionService';

/**
 * Requires a valid session cookie, and re-reads the account on every request rather than
 * trusting the JWT claims. The token is signed, but it is also long-lived: without this
 * round trip a deactivated user, or one whose role was downgraded, would keep full access
 * until their cookie happened to expire.
 *
 * A cookie that is present but no longer usable is also *removed* here, not merely
 * refused. The frontend routes signed-out visitors on cookie presence alone, so one this
 * endpoint will never accept again would keep sending them back into the signed-in area
 * — and /auth/logout, the endpoint that would otherwise clear it, sits behind this very
 * check, leaving nobody able to get rid of it.
 */
/** How stale lastActiveAt may get before a request refreshes it. */
export const LAST_ACTIVE_RESOLUTION_MS = 5 * 60 * 1000;

/**
 * "Last active" without a database write per request: only when the stored time is more than
 * LAST_ACTIVE_RESOLUTION_MS old, and conditionally, so parallel requests (or instances) racing
 * past the check write once between them. A failure here never fails the request.
 */
async function touchLastActive(userId: Types.ObjectId, lastActiveAt: Date | null): Promise<void> {
  const now = Date.now();
  if (lastActiveAt && now - lastActiveAt.getTime() < LAST_ACTIVE_RESOLUTION_MS) return;
  const staleBefore = new Date(now - LAST_ACTIVE_RESOLUTION_MS);
  try {
    await User.updateOne(
      { _id: userId, $or: [{ lastActiveAt: null }, { lastActiveAt: { $lt: staleBefore } }] },
      { $set: { lastActiveAt: new Date(now) } },
    );
  } catch {
    // Best effort only.
  }
}

export const requireAuth = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized('You must be logged in');
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    clearSessionCookie(res);
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) {
    clearSessionCookie(res);
    throw AppError.unauthorized('Session no longer valid');
  }

  /**
   * `?? 0` on both sides: a token signed before tokenVersion existed decodes with it
   * `undefined`, and every account that has never completed a password reset is still at
   * the schema default of 0. Comparing `undefined` against `0` directly would treat every
   * pre-existing session as stale the moment this shipped — normalising both to 0 is what
   * keeps deploying this feature from signing everyone out.
   */
  if ((payload.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    clearSessionCookie(res);
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  // Logged out elsewhere (or here, with a copy of the token): this one session is over.
  if (payload.sid && (await isSessionRevoked(payload.sid))) {
    clearSessionCookie(res);
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  await touchLastActive(user._id, user.lastActiveAt ?? null);

  req.authSession = {
    id: payload.sid,
    expiresAt: new Date(((payload as { exp?: number }).exp ?? 0) * 1000),
    // Tokens from before this flag existed were always persistent cookies.
    persistent: payload.persistent ?? true,
  };
  req.user = {
    id: user._id.toString(),
    // Used to label log and activity entries: the email, or the verified phone for mobile accounts.
    email: accountLabel(user),
    name: user.name,
    // Read from the database, not the token, so a role change takes effect immediately.
    role: user.role,
  };
  next();
});

/** Must be chained after requireAuth. Anything else is a 403, never a redirect. */
export const requireAdmin = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(AppError.unauthorized('You must be logged in'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(AppError.forbidden('Administrator access required'));
    return;
  }
  next();
};
