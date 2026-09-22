import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import { User, toPublicUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { signSessionToken } from '../services/tokenService';
import { setSessionCookie, clearSessionCookie } from '../utils/cookies';
import { logActivity } from '../services/activityService';
import type {
  ChangePasswordInput,
  LoginInput,
  SignupInput,
  UpdateProfileInput,
} from '../validators/authValidators';

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

/**
 * The signed-in account, in full.
 *
 * Read from the database rather than from `req.user`, which carries only what the session
 * check needed — id, email, name, role. The profile page shows when the account was
 * created, when it last signed in and the mobile number it was registered with, and none
 * of that is in a session token or belongs in one.
 */
export const me = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized('Session no longer valid');

  sendSuccess(res, toPublicUser(user));
});

/**
 * Updates the details this account signed up with.
 *
 * Only the fields that were sent are written. Email is allowed to change because it is a
 * signup detail like any other, but it is also how this account signs in, so a collision
 * with somebody else's address has to be a clear refusal rather than a database error.
 */
export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const { name, email, mobile } = req.body as UpdateProfileInput;

  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized('Session no longer valid');

  if (email && email !== user.email) {
    const taken = await User.findOne({ email, _id: { $ne: user._id } });
    if (taken) throw AppError.conflict('Another account already uses this email address');
    user.email = email;
    /**
     * A changed address has not been proved to belong to anyone yet. Nothing in this app
     * gates on the flag today, but leaving it true would record a verification that never
     * happened — and would be the wrong answer the moment something does gate on it.
     */
    user.isEmailVerified = false;
  }

  if (name !== undefined) user.name = name;
  if (mobile !== undefined) user.mobile = mobile;

  await user.save();

  await logActivity(req, {
    action: 'profile_updated',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} updated their profile`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Profile updated');
});

/**
 * Changes the account password, given the current one.
 *
 * The session is deliberately left alone. Signing every device out on a password change is
 * defensible, but it would also sign out the browser that just did it, and being thrown
 * back to a login form is a strange reward for tightening your own security.
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  // passwordHash is `select: false`, so it has to be asked for explicitly.
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw AppError.unauthorized('Session no longer valid');

  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.unauthorized('Your current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  await user.save();

  await logActivity(req, {
    action: 'password_changed',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} changed their password`,
  });

  sendSuccess(res, { changed: true }, 200, undefined, 'Password changed');
});
