import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyMediaToken, verifySessionToken } from '../services/tokenService';
import { User, accountLabel } from '../models/User';
import { isSessionRevoked } from '../services/sessionService';

/**
 * Guards the streaming/download endpoints. These are hit directly by <img>/<video>
 * `src` and by download links, so they accept EITHER:
 *   - a signed, short-lived `?token=` query param scoped to this exact media id, or
 *   - the normal session cookie (works when frontend/backend share a registrable domain).
 * This keeps files fully private without relying on browser SameSite/CORS specifics.
 *
 * This middleware only establishes *who is asking*. It does not decide whether they may
 * have this particular file — the handlers do that by looking the media up with
 * `ownerId: req.user.id`, so a valid session plus someone else's media id is a 404.
 */
export const requireMediaAccess = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const mediaId = req.params.id;
  const token = typeof req.query.token === 'string' ? req.query.token : undefined;

  if (token) {
    let payload;
    try {
      payload = verifyMediaToken(token);
    } catch {
      throw AppError.unauthorized('Link expired or invalid');
    }
    if (payload.mediaId !== mediaId) {
      throw AppError.forbidden('Token does not match this file');
    }
    // A signed link outlives the request that minted it (MEDIA_TOKEN_EXPIRES_IN), so it must
    // stop working the moment its account is suspended, not when it happens to expire.
    if (!(await User.exists({ _id: payload.sub, isActive: true }))) {
      throw AppError.unauthorized('Link expired or invalid');
    }
    // `sub` is whoever the token was minted for; tokens are only ever minted while
    // serializing media that account already owns.
    req.user = { id: payload.sub, email: '', name: '', role: 'user' };
    next();
    return;
  }

  const cookieToken = req.cookies?.[env.COOKIE_NAME];
  if (!cookieToken) throw AppError.unauthorized('You must be logged in');

  let session;
  try {
    session = verifySessionToken(cookieToken);
  } catch {
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  const user = await User.findById(session.sub);
  if (!user || !user.isActive) throw AppError.unauthorized('Session no longer valid');
  // Same revocation rule as requireAuth: a session signed out by a password reset must not
  // keep streaming files through this side door.
  if ((session.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }
  if (session.sid && (await isSessionRevoked(session.sid))) {
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  req.user = { id: user._id.toString(), email: accountLabel(user), name: user.name, role: user.role };
  next();
});
