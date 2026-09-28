import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { logger } from '../utils/logger';
import { User, type IUser } from '../models/User';
import { getEmailProvider } from './email';

// Matches authController's BCRYPT_ROUNDS: password hashing cost is the same everywhere a
// password is set, whichever path sets it.
const BCRYPT_ROUNDS = 12;

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** `origin` is a scheme+host with no trailing slash — see authController.resolveFrontendOrigin. */
export function buildResetUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/reset-password?token=${token}`;
}

/**
 * Starts a reset for this address, if an active account uses it, and emails the link.
 *
 * Resolves the same way — nothing thrown, nothing returned that differs — whether or not
 * the email matched anything. forgotPassword sends one generic response either way, and a
 * caller that *could* tell the difference here would just move the enumeration hole from
 * the response into the timing/control-flow instead of closing it.
 *
 * `origin` is resolved by the caller (see authController.resolveFrontendOrigin) rather
 * than read from config in here: it has to be correct on localhost *and* on whichever
 * Vercel domain the request actually arrived on (production or any preview deployment),
 * and only the request itself knows which of those this is.
 */
export async function requestPasswordReset(email: string, origin: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user || !user.isActive) return;

  const token = crypto.randomBytes(RESET_TOKEN_BYTES).toString('hex');
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        passwordResetTokenHash: hashToken(token),
        passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    },
  );

  const resetUrl = buildResetUrl(origin, token);
  const text =
    `We received a request to reset your media_tool password.\n\n` +
    `Reset it here (this link expires in 30 minutes):\n${resetUrl}\n\n` +
    `If you didn't request this, you can safely ignore this email — your password will not change.`;
  const html =
    `<p>We received a request to reset your media_tool password.</p>` +
    `<p><a href="${resetUrl}" style="display:inline-block;padding:10px 20px;background:#6D5EF8;` +
    `color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>` +
    `<p>Or paste this link into your browser: ${resetUrl}</p>` +
    `<p>This link expires in 30 minutes. If you didn't request this, you can safely ignore this ` +
    `email — your password will not change.</p>`;

  try {
    await getEmailProvider().send({ to: user.email, subject: 'Reset your media_tool password', text, html });
  } catch (err) {
    /**
     * Never surfaced to the caller: a delivery failure here must not turn into a
     * different HTTP response than a successful send, or the response would leak
     * whether this address has an account.
     *
     * Logs only `err.message`, not the error object or anything built above — the reset
     * URL and its token must never reach a log, and a provider's thrown error is not
     * guaranteed to stay that disciplined (an SDK exception can carry the request that
     * caused it).
     */
    const detail = err instanceof Error ? err.message : 'unknown error';
    logger.error(`Could not send password reset email to ${user.email}: ${detail}`);
  }
}

/**
 * Verifies a reset token and, if it's valid, applies the new password in the same atomic
 * update that consumes the token.
 *
 * findOneAndUpdate matches and clears the token in one MongoDB operation, so a second
 * request with the same token — even one racing this one — can never find it still
 * valid: whichever request's update lands first is the only one that can match.
 *
 * Also bumps tokenVersion, which invalidates every session token issued before this
 * moment (see requireAuth). Unlike changePassword, this deliberately signs every device
 * out: whoever is completing a reset may not be the device that is still logged in with
 * the password just replaced.
 */
export async function resetPassword(rawToken: string, newPassword: string): Promise<IUser | null> {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  return User.findOneAndUpdate(
    {
      passwordResetTokenHash: hashToken(rawToken),
      passwordResetExpiresAt: { $gt: new Date() },
    },
    {
      $set: { passwordHash, passwordResetTokenHash: null, passwordResetExpiresAt: null },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
}
