import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { verifySessionToken } from '../services/tokenService';
import { Admin } from '../models/Admin';

/**
 * Requires a valid session cookie. Re-checks the admin still exists and is
 * active on every request rather than trusting the JWT claims blindly —
 * this is a single-admin private app, so the DB round trip is cheap.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) {
    throw AppError.unauthorized('You must be logged in');
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    throw AppError.unauthorized('Session expired or invalid, please log in again');
  }

  const admin = await Admin.findById(payload.sub);
  if (!admin || !admin.isActive) {
    throw AppError.unauthorized('Session no longer valid');
  }

  req.admin = { id: admin._id.toString(), email: admin.email, name: admin.name };
  next();
});
