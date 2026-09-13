import type { Request, Response } from 'express';
import { Admin } from '../models/Admin';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { signSessionToken } from '../services/tokenService';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';
import { logActivity } from '../services/activityService';
import type { LoginInput } from '../validators/authValidators';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body as LoginInput;

  const admin = await Admin.findOne({ email }).select('+passwordHash');
  const passwordMatches = admin ? await admin.comparePassword(password) : false;

  if (!admin || !admin.isActive || !passwordMatches) {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: `Failed login attempt for ${email}`,
    });
    throw AppError.unauthorized('Invalid email or password');
  }

  const token = signSessionToken({ sub: admin._id.toString(), email: admin.email, name: admin.name });
  setSessionCookie(res, token);

  admin.lastLoginAt = new Date();
  admin.lastLoginIp = req.ip;
  await admin.save();

  await logActivity(req, {
    action: 'login',
    targetType: 'auth',
    message: `${admin.email} logged in`,
  });

  sendSuccess(res, { id: admin._id, email: admin.email, name: admin.name });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearSessionCookie(res);
  await logActivity(req, {
    action: 'logout',
    targetType: 'auth',
    message: `${req.admin?.email ?? 'Admin'} logged out`,
  });
  sendSuccess(res, { loggedOut: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, req.admin);
});
