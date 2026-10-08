import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import sharp from 'sharp';
import type { Request, Response } from 'express';
import { User, accountLabel, toPublicUser, type IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { signSessionToken } from '../services/tokenService';
import {
  setSessionCookie,
  clearSessionCookie,
  GOOGLE_NONCE_COOKIE,
  setGoogleNonceCookie,
  clearGoogleNonceCookie,
} from '../utils/cookies';
import {
  isGoogleConfigured,
  newGoogleNonce,
  noncesMatch,
  signInWithGoogle,
  verifyGoogleIdToken,
} from '../services/googleAuthService';
import { logActivity } from '../services/activityService';
import { newSessionId, revokeSession } from '../services/sessionService';
import { resendPhoneSignupCode, startPhoneSignup, verifyPhoneSignup, type VerifyFailure } from '../services/phoneSignupService';
import { isSmsDeliveryAvailable } from '../services/sms';
import { maskPhone, normalizePhone } from '../utils/phone';
import {
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword as applyPasswordReset,
} from '../services/passwordResetService';
import type {
  CompleteOnboardingInput,
  GoogleSignInInput,
  MobileLoginInput,
  MobileSignupResendInput,
  MobileSignupStartInput,
  MobileSignupVerifyInput,
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
  VerifyOtpInput,
} from '../validators/authValidators';

const BCRYPT_ROUNDS = 12;

/**
 * Issues the HTTP-only session cookie for `user`. The one place a session is minted, so
 * login, signup and password reset cannot drift apart. `tokenVersion` is read off the
 * document passed in, which for a reset must be the post-increment one.
 */
function startSession(res: Response, user: IUser, persistent: boolean): void {
  const token = signSessionToken({
    sub: user._id.toString(),
    role: user.role,
    // A label only (requireAuth reloads the account): the email, or the phone for mobile accounts.
    email: accountLabel(user),
    name: user.name,
    tokenVersion: user.tokenVersion ?? 0,
    // Its own id, so logging out can end exactly this session (see revokeSession).
    sid: newSessionId(),
    persistent,
  });
  setSessionCookie(res, token, persistent);
}

/** The account as the actor of an event logged before req.user exists (signing up or in). */
const actorOf = (user: IUser) => ({ id: user._id, label: accountLabel(user) });

/** A brand-new account still has to choose a plan: the start of its onboarding. */
async function logOnboardingStarted(req: Request, user: IUser): Promise<void> {
  if (!user.onboardingRequired) return;
  await logActivity(req, {
    action: 'onboarding_started',
    targetType: 'user',
    targetId: user._id,
    targetName: accountLabel(user),
    message: `${accountLabel(user)} started onboarding`,
    actor: actorOf(user),
  });
}

async function recordSignIn(req: Request, user: IUser): Promise<void> {
  user.lastLoginAt = new Date();
  user.lastActiveAt = user.lastLoginAt;
  user.lastLoginIp = req.ip;
  await user.save();
}

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
    authProvider: 'email',
    // New accounts choose a plan before using the app (see completeOnboarding).
    onboardingRequired: true,
  });

  await logActivity(req, {
    action: 'signup',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} signed up with email`,
    authProvider: 'email',
    actor: actorOf(user),
    subjectIdentifier: user.email,
  });
  await logOnboardingStarted(req, user);

  // The account was just created with a password the caller chose, so it is signed in
  // straight away through the same cookie login uses — the token never reaches JS.
  startSession(res, user, true);
  await recordSignIn(req, user);

  sendSuccess(res, toPublicUser(user), 201, undefined, 'Account created');
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
      status: 'failure',
      authProvider: 'email',
      // Internal only: which account was targeted, so it shows on that account's timeline.
      subjectUserId: user?._id ?? null,
      subjectIdentifier: email,
      metadata: { reason: !user ? 'no_account' : !user.isActive ? 'suspended' : 'wrong_password' },
    });
    throw AppError.unauthorized('Invalid email or password');
  }

  startSession(res, user, rememberMe);
  await recordSignIn(req, user);

  await logActivity(req, {
    action: 'login',
    targetType: 'auth',
    message: `${user.email} logged in`,
    authProvider: 'email',
    actor: actorOf(user),
    subjectIdentifier: user.email ?? null,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Logged in');
});

/**
 * Ends this session on the server as well as in the browser: its id is recorded as revoked, so
 * a copy of the token can't be replayed until it expires. Other devices stay signed in.
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const session = req.authSession;
  if (session?.id) await revokeSession(session.id, req.user!.id, session.expiresAt);
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
 * Sets the profile photo. The upload is cropped square and shrunk to 256px WebP, which
 * lands around 10-20 KB, so it can live on the user document as a data URL — no storage
 * backend, temp file or separate serving route involved, and re-encoding through sharp
 * also guarantees what is stored is a real image rather than whatever the client claimed.
 */
export const uploadAvatar = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw AppError.badRequest('Choose an image to upload');

  let resized: Buffer;
  try {
    resized = await sharp(req.file.buffer)
      .rotate()
      .resize(256, 256, { fit: 'cover' })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw AppError.badRequest('That file could not be read as an image');
  }

  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized('Session no longer valid');

  user.avatarUrl = `data:image/webp;base64,${resized.toString('base64')}`;
  await user.save();

  await logActivity(req, {
    action: 'avatar_updated',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} changed their profile photo`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Profile photo updated');
});

/** Drops the profile photo, so the initials stand-in shows again. */
export const removeAvatar = asyncHandler(async (req: Request, res: Response) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized('Session no longer valid');

  user.avatarUrl = null;
  await user.save();

  await logActivity(req, {
    action: 'avatar_updated',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} removed their profile photo`,
  });

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Profile photo removed');
});

/**
 * Changes the account password, given the current one.
 *
 * Every other session is signed out (tokenVersion is bumped, which requireAuth checks on each
 * request) — if the password was changed because someone else had it, their session must not
 * outlive it. The browser that made the change gets a fresh cookie for the new version, with
 * the same "remember me" lifetime it had, so it is not thrown back to a login form.
 */
export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as ChangePasswordInput;

  // passwordHash is `select: false`, so it has to be asked for explicitly.
  const user = await User.findById(req.user!.id).select('+passwordHash');
  if (!user) throw AppError.unauthorized('Session no longer valid');

  if (!(await user.comparePassword(currentPassword))) {
    await logActivity(req, {
      action: 'password_changed',
      targetType: 'auth',
      targetId: user._id,
      targetName: accountLabel(user),
      message: `${accountLabel(user)} entered an incorrect current password`,
      status: 'failure',
    });
    throw AppError.unauthorized('Your current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  await user.save();
  startSession(res, user, req.authSession?.persistent ?? true);

  await logActivity(req, {
    action: 'password_changed',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} changed their password`,
  });

  sendSuccess(res, { changed: true }, 200, undefined, 'Password changed');
});

/**
 * Starts a password reset by emailing a 4-digit code. Also doubles as "resend": the frontend
 * calls this same endpoint again, and requestPasswordReset applies its own cooldown.
 *
 * Every outcome — code sent, still in the cooldown, or no active account at that address —
 * gets the same 200 and the same wording, so the response can't be used to find out which
 * email addresses have accounts. Only a real, active account is actually sent a code.
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body as ForgotPasswordInput;

  const result = await requestPasswordReset(email);

  // The audit log is internal (admins only), so it may record which case this was.
  await logActivity(req, {
    action: 'password_reset_requested',
    targetType: 'auth',
    message:
      result === 'no_account'
        ? `Password reset requested for unknown address ${email}`
        : `Password reset requested for ${email}`,
    subjectIdentifier: email,
    metadata: { outcome: result },
  });

  sendSuccess(res, { requested: true }, 200, undefined, 'If an account exists for this email, a verification code has been sent.');
});

/**
 * Checks a submitted code and, if it's correct, hands back the short-lived authorization
 * that resetPassword requires — never the code itself, and never anything that reveals
 * whether the email had an account at all.
 */
export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp } = req.body as VerifyOtpInput;

  const result = await verifyPasswordResetOtp(email, otp);
  await logActivity(req, {
    action: result.ok ? 'otp_verified' : 'otp_failed',
    targetType: 'auth',
    message: result.ok ? `Password reset code verified for ${email}` : `Wrong or expired password reset code for ${email}`,
    status: result.ok ? 'success' : 'failure',
    subjectIdentifier: email,
    metadata: { purpose: 'password_reset' },
  });
  if (!result.ok) {
    throw AppError.badRequest('That code is invalid or has expired.');
  }

  sendSuccess(res, { verified: true, resetToken: result.resetToken }, 200, undefined, 'Code verified');
});

/** Completes a password reset with the authorization verifyOtp minted. */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const { resetToken, newPassword } = req.body as ResetPasswordInput;

  const user = await applyPasswordReset(resetToken, newPassword);
  if (!user) {
    throw AppError.badRequest('This reset session is invalid or has expired. Please start again.');
  }

  await logActivity(req, {
    action: 'password_reset',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email,
    message: `${user.email} reset their password`,
    actor: actorOf(user),
    subjectIdentifier: user.email ?? null,
  });

  /**
   * `user` is the post-update document, so its tokenVersion is the incremented one: every
   * older session (including this browser's) is dead, and this new cookie is the only
   * live one. Session-only rather than persistent, as nothing here says "remember me".
   */
  startSession(res, user, false);
  await recordSignIn(req, user);

  sendSuccess(res, toPublicUser(user), 200, undefined, 'Password reset successfully');
});

/* -------------------------------------------------------------------------------------------
 * Mobile-number signup and login
 * ----------------------------------------------------------------------------------------- */

const INVALID_MOBILE = 'Enter a valid mobile number for the selected country';
const SMS_UNAVAILABLE = 'Mobile signup isn’t available right now. Please sign up with your email or Google instead.';

/** Refuses before anything is stored or "sent" when no provider can actually deliver a text. */
function assertSmsAvailable(): void {
  if (!isSmsDeliveryAvailable()) throw AppError.unavailable(SMS_UNAVAILABLE, 'SMS_UNAVAILABLE');
}

/** Lets the sign-up form say up front whether mobile signup can work on this deployment. */
export const mobileSignupConfig = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, { enabled: isSmsDeliveryAvailable() });
});

const VERIFY_FAILURES: Record<VerifyFailure, { message: string; code: string }> = {
  invalid: { message: 'That code is invalid or has expired.', code: 'OTP_INVALID' },
  incorrect: { message: 'That code is incorrect.', code: 'OTP_INCORRECT' },
  expired: { message: 'This code has expired. Request a new one.', code: 'OTP_EXPIRED' },
  locked: { message: 'Too many incorrect attempts. Request a new code.', code: 'OTP_LOCKED' },
};

/**
 * Step 1 of mobile signup: validates, stores the pending signup and texts a code. Nothing is
 * created yet. The answer is the same whether or not the number already has an account (that
 * owner is texted a notice instead) — see phoneSignupService.
 */
export const startMobileSignup = asyncHandler(async (req: Request, res: Response) => {
  assertSmsAvailable();
  const { name, country, mobile, password } = req.body as MobileSignupStartInput;
  const phone = normalizePhone(country, mobile);
  if (!phone) throw AppError.badRequest(INVALID_MOBILE, [{ path: 'mobile', message: INVALID_MOBILE }]);

  const state = await startPhoneSignup({ name, phoneE164: phone.e164, phoneDisplay: phone.international, password });
  await logActivity(req, {
    action: 'otp_requested',
    targetType: 'auth',
    targetName: maskPhone(phone.e164),
    message: `Verification code requested for ${maskPhone(phone.e164)}`,
    authProvider: 'mobile',
    subjectIdentifier: phone.e164,
    metadata: { purpose: 'mobile_signup' },
  });
  sendSuccess(res, { ...state, maskedPhone: maskPhone(phone.e164) }, 200, undefined, `We sent a 4-digit code to ${maskPhone(phone.e164)}.`);
});

export const resendMobileSignupCode = asyncHandler(async (req: Request, res: Response) => {
  assertSmsAvailable();
  const { phone, signupToken } = req.body as MobileSignupResendInput;
  const state = await resendPhoneSignupCode(phone, signupToken);
  await logActivity(req, {
    action: 'otp_resent',
    targetType: 'auth',
    targetName: maskPhone(phone),
    message: `New verification code requested for ${maskPhone(phone)}`,
    authProvider: 'mobile',
    subjectIdentifier: phone,
    metadata: { purpose: 'mobile_signup' },
  });
  sendSuccess(res, { ...state, maskedPhone: maskPhone(phone) }, 200, undefined, 'If a new code was due, it is on its way.');
});

/** Step 2: the code is checked and, only if it is right, the account is created and signed in. */
export const verifyMobileSignup = asyncHandler(async (req: Request, res: Response) => {
  const { phone, otp, signupToken } = req.body as MobileSignupVerifyInput;
  const result = await verifyPhoneSignup(phone, otp, signupToken);
  if (!result.ok) {
    await logActivity(req, {
      action: 'otp_failed',
      targetType: 'auth',
      targetName: maskPhone(phone),
      message: `Mobile verification failed for ${maskPhone(phone)} (${result.reason})`,
      status: 'failure',
      authProvider: 'mobile',
      subjectIdentifier: phone,
      metadata: { purpose: 'mobile_signup', reason: result.reason },
    });
    const failure = VERIFY_FAILURES[result.reason];
    const message =
      result.reason === 'incorrect' && result.attemptsRemaining !== undefined
        ? `${failure.message} ${result.attemptsRemaining} attempt${result.attemptsRemaining === 1 ? '' : 's'} left.`
        : failure.message;
    throw AppError.badRequest(
      message,
      result.attemptsRemaining !== undefined ? { attemptsRemaining: result.attemptsRemaining } : undefined,
      failure.code,
    );
  }
  const { user } = result;

  await logActivity(req, {
    action: 'otp_verified',
    targetType: 'auth',
    targetId: user._id,
    targetName: maskPhone(phone),
    message: `Mobile number ${maskPhone(phone)} verified`,
    authProvider: 'mobile',
    actor: actorOf(user),
    subjectIdentifier: phone,
    metadata: { purpose: 'mobile_signup' },
  });
  await logActivity(req, {
    action: 'signup',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.phoneE164 ?? null,
    message: `${maskPhone(phone)} signed up with a mobile number`,
    authProvider: 'mobile',
    actor: actorOf(user),
    subjectIdentifier: phone,
  });
  await logOnboardingStarted(req, user);

  startSession(res, user, true);
  await recordSignIn(req, user);
  sendSuccess(res, toPublicUser(user), 201, undefined, 'Account created');
});

/** Password login for accounts identified by a verified mobile number. Mirrors `login`. */
export const loginWithMobile = asyncHandler(async (req: Request, res: Response) => {
  const { country, mobile, password, rememberMe } = req.body as MobileLoginInput;
  const phone = normalizePhone(country, mobile);

  const user = phone ? await User.findOne({ phoneE164: phone.e164 }).select('+passwordHash') : null;
  const passwordMatches = user ? await user.comparePassword(password) : false;

  // One message for every failure, as with email login.
  if (!user || !user.isActive || !passwordMatches) {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: `Failed mobile login attempt for ${phone ? maskPhone(phone.e164) : 'an invalid number'}`,
      status: 'failure',
      authProvider: 'mobile',
      subjectUserId: user?._id ?? null,
      subjectIdentifier: phone?.e164 ?? null,
      metadata: { reason: !user ? 'no_account' : !user.isActive ? 'suspended' : 'wrong_password' },
    });
    throw AppError.unauthorized('Invalid mobile number or password');
  }

  startSession(res, user, rememberMe);
  await recordSignIn(req, user);
  await logActivity(req, {
    action: 'login',
    targetType: 'auth',
    message: `${maskPhone(user.phoneE164!)} logged in`,
    authProvider: 'mobile',
    actor: actorOf(user),
    subjectIdentifier: user.phoneE164 ?? null,
  });
  sendSuccess(res, toPublicUser(user), 200, undefined, 'Logged in');
});

/* -------------------------------------------------------------------------------------------
 * Google sign-in
 * ----------------------------------------------------------------------------------------- */

const GOOGLE_NOT_CONFIGURED = 'Google sign-in is not set up on this server yet. Use email or mobile instead.';

/**
 * What the sign-in button needs: whether Google is configured, the (public) client ID, and a
 * fresh nonce — also set as an HTTP-only cookie so the sign-in can check Google echoed it.
 */
export const googleConfig = asyncHandler(async (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!isGoogleConfigured()) {
    sendSuccess(res, { enabled: false, clientId: null, nonce: null });
    return;
  }
  const nonce = newGoogleNonce();
  setGoogleNonceCookie(res, nonce);
  sendSuccess(res, { enabled: true, clientId: env.GOOGLE_CLIENT_ID!, nonce });
});

const GOOGLE_REFUSALS: Record<'unverified-email' | 'admin-account' | 'inactive' | 'conflict', { status: number; message: string }> = {
  'unverified-email': { status: 403, message: 'Your Google account’s email address isn’t verified, so it can’t be used to sign in.' },
  'admin-account': { status: 403, message: 'This account signs in with its email and password.' },
  conflict: { status: 409, message: 'This email is already connected to a different Google account.' },
  inactive: { status: 401, message: 'This account cannot sign in.' },
};

/**
 * Verifies Google's ID token server-side and signs in through the same session as every other
 * method (startSession). The account, role and onboarding state all come from the database.
 */
export const googleSignIn = asyncHandler(async (req: Request, res: Response) => {
  if (!isGoogleConfigured()) throw AppError.unavailable(GOOGLE_NOT_CONFIGURED, 'GOOGLE_NOT_CONFIGURED');
  const { credential } = req.body as GoogleSignInInput;
  const expectedNonce = req.cookies?.[GOOGLE_NONCE_COOKIE] as string | undefined;
  // Single use, whatever happens next.
  clearGoogleNonceCookie(res);

  let identity;
  try {
    identity = await verifyGoogleIdToken(credential);
  } catch {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: 'Google sign-in token could not be verified',
      status: 'failure',
      authProvider: 'google',
      metadata: { reason: 'invalid_token' },
    });
    throw AppError.unauthorized('Google sign-in could not be verified. Please try again.');
  }
  if (!noncesMatch(expectedNonce, identity.nonce)) {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: `Google sign-in for ${identity.email} refused: nonce mismatch`,
      status: 'failure',
      authProvider: 'google',
      subjectIdentifier: identity.email?.toLowerCase() ?? null,
      metadata: { reason: 'nonce_mismatch' },
    });
    throw AppError.unauthorized('Google sign-in expired or came from somewhere else. Please try again.');
  }

  const result = await signInWithGoogle(identity);
  if (!result.ok) {
    await logActivity(req, {
      action: 'login_failed',
      targetType: 'auth',
      message: `Refused Google sign-in for ${identity.email} (${result.reason})`,
      status: 'failure',
      authProvider: 'google',
      subjectIdentifier: identity.email?.toLowerCase() ?? null,
      metadata: { reason: result.reason },
    });
    const refusal = GOOGLE_REFUSALS[result.reason];
    throw new AppError(refusal.message, refusal.status);
  }

  const { user, created, passwordDisabled } = result;
  await logActivity(req, {
    action: created ? 'signup' : 'login',
    targetType: 'auth',
    targetId: user._id,
    targetName: user.email ?? null,
    message: created ? `${user.email} signed up with Google` : `${user.email} signed in with Google`,
    authProvider: 'google',
    actor: actorOf(user),
    subjectIdentifier: user.email ?? null,
  });
  if (passwordDisabled) {
    // Linking proved the address for the first time; the old password was switched off.
    await logActivity(req, {
      action: 'email_verified',
      targetType: 'auth',
      targetId: user._id,
      targetName: user.email ?? null,
      message: `${user.email} verified through Google; the previous password was turned off`,
      authProvider: 'google',
      actor: actorOf(user),
      subjectIdentifier: user.email ?? null,
    });
  }
  if (created) await logOnboardingStarted(req, user);

  startSession(res, user, true);
  await recordSignIn(req, user);
  sendSuccess(
    res,
    { user: toPublicUser(user), created, passwordDisabled },
    created ? 201 : 200,
    undefined,
    created ? 'Account created' : 'Signed in',
  );
});

/**
 * Records the plan the signed-in user chose and completes onboarding.
 *
 * Free is activated at once. A paid plan is only ever saved as `pending`: there is no payment
 * gateway, so nothing has been charged and nothing may be activated — the user keeps using
 * Free (effectivePlan) until a verified payment exists. The account comes from the session,
 * the plan name is validated, and every status and date is decided here, never by the client.
 */
export const completeOnboarding = asyncHandler(async (req: Request, res: Response) => {
  const { plan } = req.body as CompleteOnboardingInput;
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.unauthorized('Session no longer valid');
  if (user.role === 'admin') throw AppError.forbidden('Administrators have no plan to choose');

  const now = new Date();
  const isPaid = plan !== 'free';
  const wasOnboarding = user.onboardingRequired === true;
  user.plan = plan;
  user.planSelectedAt = now;
  user.subscriptionStatus = isPaid ? 'pending' : 'active';
  user.subscriptionStartedAt = isPaid ? null : now;
  user.subscriptionExpiresAt = null;
  user.onboardingRequired = false;
  user.onboardingCompletedAt = user.onboardingCompletedAt ?? now;
  await user.save();

  await logActivity(req, {
    action: 'plan_selected',
    targetType: 'user',
    targetId: user._id,
    targetName: accountLabel(user),
    message: isPaid
      ? `${accountLabel(user)} chose ${plan} — pending until payment is verified`
      : `${accountLabel(user)} chose the Free plan`,
    metadata: { plan, subscriptionStatus: user.subscriptionStatus },
  });
  if (wasOnboarding) {
    await logActivity(req, {
      action: 'onboarding_completed',
      targetType: 'user',
      targetId: user._id,
      targetName: accountLabel(user),
      message: `${accountLabel(user)} completed onboarding`,
    });
  }

  sendSuccess(
    res,
    toPublicUser(user),
    200,
    undefined,
    isPaid ? 'Plan saved — payment is required before it becomes active.' : 'You’re all set',
  );
});
