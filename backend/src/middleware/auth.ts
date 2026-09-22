import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifySessionToken } from '../services/tokenService';
import { clearSessionCookie } from '../utils/cookies';
import { User } from '../models/User';

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

  req.user = {
    id: user._id.toString(),
    email: user.email,
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
