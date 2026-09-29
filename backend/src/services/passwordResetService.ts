import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { User, type IUser } from '../models/User';
import { getEmailProvider } from './email';

// Matches authController's BCRYPT_ROUNDS: password hashing cost is the same everywhere a
// password is set, whichever path sets it.
const BCRYPT_ROUNDS = 12;

const OTP_DIGITS = 4;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
/** A code this short is guessable in ~5000 tries on average; this is the real defense. */
const OTP_MAX_ATTEMPTS = 5;
/** Minimum time between two OTPs for the same account, so "Resend" cannot be used to spam. */
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const RESET_AUTH_TOKEN_BYTES = 32;
/** How long a verified OTP's authorization to set a new password stays good for. */
const RESET_AUTH_TTL_MS = 10 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Cryptographically random, uniform over 0000–9999 — `crypto.randomInt` avoids the modulo bias `% 10000` on `randomBytes` would introduce. */
function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, '0');
}

/**
 * Starts a reset for this address, if an active account uses it, and emails a one-time
 * code.
 *
 * Resolves the same way — nothing thrown, nothing returned that differs — whether or not
 * the email matched anything, and whether or not a resend was skipped for the cooldown.
 * forgotPassword sends one generic response regardless, and a caller that *could* tell
 * the difference here would just move the enumeration hole from the response into the
 * timing/control-flow instead of closing it.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email }).select('+passwordResetOtpLastSentAt');
  if (!user || !user.isActive) return;

  if (
    user.passwordResetOtpLastSentAt &&
    Date.now() - user.passwordResetOtpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    return;
  }

  const otp = generateOtp();
  const now = new Date();
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetOtpHash: sha256Hex(otp),
        passwordResetOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        passwordResetOtpAttempts: 0,
        passwordResetOtpLastSentAt: now,
        // A fresh code starts a new verification round; an authorization left over from
        // a previous one must not outlive it.
        passwordResetAuthTokenHash: null,
        passwordResetAuthExpiresAt: null,
      },
    },
  );

  const text =
    `Your media_tool password reset code is: ${otp}\n\n` +
    `This code expires in 10 minutes and can only be used once.\n\n` +
    `If you didn't request this, you can safely ignore this email — your password will not change.`;
  const html =
    `<p>Your media_tool password reset code is:</p>` +
    `<p style="font-size:32px;font-weight:700;letter-spacing:10px;margin:16px 0">${otp}</p>` +
    `<p>This code expires in 10 minutes and can only be used once.</p>` +
    `<p>If you didn't request this, you can safely ignore this email. Your password will not change.</p>`;

  try {
    await getEmailProvider().send({ to: user.email, subject: 'Your media_tool password reset code', text, html });
  } catch (err) {
    /**
     * Never surfaced to the caller: a delivery failure here must not turn into a
     * different HTTP response than a successful send, or the response would leak
     * whether this address has an account.
     *
     * Logs only `err.message`, never the error object or anything built above — the code
     * must never reach a log, and a provider's thrown error is not guaranteed to stay
     * that disciplined (an SDK exception can carry the request that caused it).
     */
    const detail = err instanceof Error ? err.message : 'unknown error';
    logger.error(`Could not send password reset code to ${user.email}: ${detail}`);
  }
}

export type VerifyOtpResult = { ok: true; resetToken: string } | { ok: false };

/**
 * Checks a submitted code against the account's current one and, if it matches, consumes
 * it and mints a short-lived authorization for the next step (resetPassword).
 *
 * Every failure mode — no account, inactive, no code outstanding, expired, too many wrong
 * guesses, or simply wrong — returns the same `{ ok: false }`, on purpose: verifyOtp's
 * caller answers all of them with one generic message, the same reasoning as
 * requestPasswordReset.
 *
 * A wrong guess increments passwordResetOtpAttempts; once that reaches OTP_MAX_ATTEMPTS
 * the code stops working even if a later guess would have matched it, forcing a resend.
 * With only 10,000 possible 4-digit codes this lockout — not the OTP's own size — is what
 * actually makes it hard to guess.
 */
export async function verifyPasswordResetOtp(email: string, otp: string): Promise<VerifyOtpResult> {
  const user = await User.findOne({ email }).select(
    '+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts',
  );

  if (
    !user ||
    !user.isActive ||
    !user.passwordResetOtpHash ||
    !user.passwordResetOtpExpiresAt ||
    user.passwordResetOtpExpiresAt < new Date() ||
    (user.passwordResetOtpAttempts ?? 0) >= OTP_MAX_ATTEMPTS
  ) {
    return { ok: false };
  }

  if (user.passwordResetOtpHash !== sha256Hex(otp)) {
    await User.updateOne({ _id: user._id }, { $inc: { passwordResetOtpAttempts: 1 } });
    return { ok: false };
  }

  const resetToken = crypto.randomBytes(RESET_AUTH_TOKEN_BYTES).toString('hex');

  /**
   * Matched again on the OTP hash it just validated, and clears it as part of the same
   * update: a second verify racing this one (with the same code) can no longer find a
   * match once this commits, so the code is consumed exactly once regardless of timing.
   */
  const updated = await User.findOneAndUpdate(
    { _id: user._id, passwordResetOtpHash: user.passwordResetOtpHash },
    {
      $set: {
        passwordResetOtpHash: null,
        passwordResetOtpExpiresAt: null,
        passwordResetOtpAttempts: 0,
        passwordResetAuthTokenHash: sha256Hex(resetToken),
        passwordResetAuthExpiresAt: new Date(Date.now() + RESET_AUTH_TTL_MS),
      },
    },
    { new: true },
  );

  if (!updated) return { ok: false }; // lost a race with a concurrent verify or resend

  return { ok: true, resetToken };
}

/**
 * Verifies a reset authorization and, if it's valid, applies the new password in the
 * same atomic update that consumes it.
 *
 * This is deliberately not the OTP: resetPassword only ever succeeds against a
 * passwordResetAuthTokenHash, and the only place that field is ever set is a successful
 * verifyPasswordResetOtp — so a password cannot be reset without a verified code, even by
 * a caller that skips straight to this endpoint.
 *
 * findOneAndUpdate matches and clears the authorization in one MongoDB operation, so a
 * second request racing this one can never find it still valid.
 *
 * Also bumps tokenVersion, which invalidates every session token issued before this
 * moment (see requireAuth). Unlike changePassword, this deliberately signs every device
 * out: whoever is completing a reset may not be the device that is still logged in with
 * the password just replaced.
 */
export async function resetPassword(resetToken: string, newPassword: string): Promise<IUser | null> {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  return User.findOneAndUpdate(
    {
      passwordResetAuthTokenHash: sha256Hex(resetToken),
      passwordResetAuthExpiresAt: { $gt: new Date() },
    },
    {
      $set: { passwordHash, passwordResetAuthTokenHash: null, passwordResetAuthExpiresAt: null },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
}
