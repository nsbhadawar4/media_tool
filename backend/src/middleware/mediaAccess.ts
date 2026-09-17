import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyMediaToken, verifySessionToken } from '../services/tokenService';
import { User } from '../models/User';

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

  req.user = { id: user._id.toString(), email: user.email, name: user.name, role: user.role };
  next();
});
