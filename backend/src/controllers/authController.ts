import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { User, toPublicUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { signSessionToken } from '../services/tokenService';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';
import { logActivity } from '../services/activityService';
import type { LoginInput, SignupInput } from '../validators/authValidators';

const BCRYPT_ROUNDS = 12;

export const signup = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, password, mobile } = req.body as SignupInput;

  const existing = await User.findOne({ email });
  if (existing) {
    throw AppError.conflict('An account with this email already exists');
  }

  const user = await User.create({
    name,
    email,
    passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    mobile: mobile ?? null,
    // Hard-coded, never read from the request: a public endpoint must not be able to
    // mint an administrator, whatever the client sends.
    role: 'user',
  });

  await logActivity(req, {
    action: 'signup',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} signed up`,
  });

  // No session cookie here — signup leads to the login page, so a stolen signup response
  // is not also a live session.
  sendSuccess(res, toPublicUser(user), 201, undefined, 'Account created. You can now log in.');
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, rememberMe } = req.body as LoginInput;

  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordMatches = user ? await user.comparePassword(password) : false;

  // One message for every failure mode, so the response cannot be used to discover
  // which addresses have accounts.
  if (!user || !user.isActive || !passwordMatches) {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: `Failed login attempt for ${email}`,
    });
    throw AppError.unauthorized('Invalid email or password');
  }

  const token = signSessionToken({
    sub: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
  });
  setSessionCookie(res, token, rememberMe);

  user.lastLoginAt = new Date();
  user.lastLoginIp = req.ip;
  await user.save();

  await logActivity(req, {
    action: 'login',
    targetType: 'auth',
    message: `${user.email} logged in`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Logged in');
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  clearSessionCookie(res);
  await logActivity(req, {
    action: 'logout',
    targetType: 'auth',
    message: `${req.user?.email ?? 'User'} logged out`,
  });
  sendSuccess(res, { loggedOut: true }, 200, undefined, 'Logged out');
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  sendSuccess(res, req.user);
});
