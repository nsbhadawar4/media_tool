import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyMediaToken, verifySessionToken } from '../services/tokenService';
import { Admin } from '../models/Admin';

/**
 * Guards the streaming/download endpoints. These are hit directly by <img>/<video>
 * `src` and by download links, so they accept EITHER:
 *   - a signed, short-lived `?token=` query param scoped to this exact media id, or
 *   - the normal session cookie (works when frontend/backend share a registrable domain).
 * This keeps files fully private without relying on browser SameSite/CORS specifics.
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
    req.admin = { id: payload.sub, email: '', name: '' };
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

  const admin = await Admin.findById(session.sub);
  if (!admin || !admin.isActive) throw AppError.unauthorized('Session no longer valid');

  req.admin = { id: admin._id.toString(), email: admin.email, name: admin.name };
  next();
});
