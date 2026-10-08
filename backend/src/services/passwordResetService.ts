import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";
import { User, type IUser } from "../models/User";
import { getEmailProvider } from "./email";
import { runAfterResponse } from "./backgroundTasks";
import { env } from "../config/env";

// Matches authController's BCRYPT_ROUNDS: password hashing cost is the same
const BCRYPT_ROUNDS = 12;

const OTP_DIGITS = 4;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
/** Minimum time between two OTPs for the same account, so "Resend" cannot be used to spam. */
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
/**
 * Codes one account can be sent per rolling 24 hours. Each new code comes with a fresh set of
 * OTP_MAX_ATTEMPTS guesses, so without this an attacker spreading requests over many addresses
 * (the per-IP limiters can't see that) could keep asking for codes once a minute and get ~300
 * guesses an hour at a 10,000-code space. Capped, it is 25 guesses a day.
 */
export const MAX_RESET_CODES_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const RESET_AUTH_TOKEN_BYTES = 32;
/** How long a verified OTP's authorization to set a new password stays good for. */
const RESET_AUTH_TTL_MS = 10 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * The stored form of a reset code: an HMAC keyed with the server secret and bound to the
 * account. A plain SHA-256 of 4 digits could be reversed from a database copy instantly by
 * trying all 10,000; without the secret this can't be.
 */
export function hashPasswordResetOtp(userId: string, otp: string): string {
  return crypto.createHmac("sha256", env.JWT_SECRET).update(`password-reset:${userId}:${otp}`).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function generateOtp(): string {
  return crypto
    .randomInt(0, 10 ** OTP_DIGITS)
    .toString()
    .padStart(OTP_DIGITS, "0");
}

export type RequestResetResult = "sent" | "cooldown" | "no_account";
export async function requestPasswordReset(
  email: string,
): Promise<RequestResetResult> {
  const provider = getEmailProvider();

  const user = await User.findOne({ email }).select(
    "+passwordResetOtpLastSentAt +passwordResetSendWindowStartedAt +passwordResetSendCount",
  );
  if (!user || !user.isActive) return "no_account";

  if (
    user.passwordResetOtpLastSentAt &&
    Date.now() - user.passwordResetOtpLastSentAt.getTime() <
      OTP_RESEND_COOLDOWN_MS
  ) {
    return "cooldown";
  }

  const now = new Date();
  const windowOpen =
    user.passwordResetSendWindowStartedAt &&
    now.getTime() - user.passwordResetSendWindowStartedAt.getTime() < DAY_MS;
  const sentToday = windowOpen ? (user.passwordResetSendCount ?? 0) : 0;
  // Same neutral answer as the cooldown: the caller can't tell this apart from anything else.
  if (sentToday >= MAX_RESET_CODES_PER_DAY) return "cooldown";

  const otp = generateOtp();
  // Conditional on the send time we just read, so two requests racing past the cooldown check
  // can't both issue a code (and both reset the attempt counter).
  const issued = await User.updateOne(
    { _id: user._id, passwordResetOtpLastSentAt: user.passwordResetOtpLastSentAt ?? null },
    {
      $set: {
        passwordResetOtpHash: hashPasswordResetOtp(user._id.toString(), otp),
        passwordResetOtpExpiresAt: new Date(now.getTime() + OTP_TTL_MS),
        passwordResetOtpAttempts: 0,
        passwordResetOtpLastSentAt: now,
        passwordResetAuthTokenHash: null,
        passwordResetAuthExpiresAt: null,
        passwordResetSendWindowStartedAt: windowOpen ? user.passwordResetSendWindowStartedAt : now,
        passwordResetSendCount: sentToday + 1,
      },
    },
  );
  if (issued.modifiedCount === 0) return "cooldown";

  const text =
    `Hi,

` +
    `We received a request to reset your Media Tool password.

` +
    `Your verification code is:

${otp}

` +
    `This code will expire in 10 minutes and can only be used once.

` +
    `If you did not request a password reset, you can safely ignore this email. Your password will not be changed.

` +
    `For security reasons, please do not share this code with anyone.

` +
    `Thanks,
Media Tool Team`;
  // Inline styles and a single fluid column so Gmail and mobile clients render it cleanly.
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#1f2937;max-width:480px;margin:0 auto;padding:16px">` +
    `<p style="margin:0 0 16px">Hi,</p>` +
    `<p style="margin:0 0 16px">We received a request to reset your Media Tool password.</p>` +
    `<p style="margin:0 0 8px">Your verification code is:</p>` +
    `<p style="margin:0 0 16px;padding:16px;background:#f3f4f6;border-radius:8px;text-align:center;font-size:32px;font-weight:700;letter-spacing:10px;color:#111827">${otp}</p>` +
    `<p style="margin:0 0 16px">This code will expire in 10 minutes and can only be used once.</p>` +
    `<p style="margin:0 0 16px">If you did not request a password reset, you can safely ignore this email. Your password will not be changed.</p>` +
    `<p style="margin:0 0 16px">For security reasons, please do not share this code with anyone.</p>` +
    `<p style="margin:0">Thanks,<br>Media Tool Team</p>` +
    `</div>`;

  /**
   * Sent after the response, not inside it. Awaiting the provider here made a real account
   * answer measurably slower than an unknown address, and a delivery failure answered 503
   * only for real accounts — both revealed which addresses have accounts. The caller now gets
   * the same neutral answer either way (see authController.forgotPassword).
   *
   * A failure is still handled, just not reported to the caller: it is logged for the
   * operator, and the resend cooldown is cleared so the person can ask again straight away.
   * Misconfiguration (missing provider settings) is still caught up front, before the account
   * lookup, by getEmailProvider() above — so that case fails loudly for every address alike.
   */
  // Always set: this account was just found by its email address.
  const recipient = user.email as string;
  const userId = user._id;
  runAfterResponse(async () => {
    try {
      await provider.send({
        to: recipient,
        subject: "Your Media Tool Password Reset OTP",
        text,
        html,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "unknown error";
      logger.error(
        `Could not send password reset code via ${provider.name} to ${recipient}: ${detail}`,
      );
      // Nothing was delivered, so don't make the user wait out the resend cooldown.
      await User.updateOne(
        { _id: userId },
        { $set: { passwordResetOtpLastSentAt: null } },
      );
    }
  });

  return "sent";
}

export type VerifyOtpResult = { ok: true; resetToken: string } | { ok: false };

export async function verifyPasswordResetOtp(
  email: string,
  otp: string,
): Promise<VerifyOtpResult> {
  // Spend one attempt *before* comparing, atomically. Reading the counter and incrementing it
  // afterwards would let parallel guesses all see "0 attempts used" and blow past the limit.
  const user = await User.findOneAndUpdate(
    {
      email,
      isActive: true,
      passwordResetOtpHash: { $type: "string" },
      passwordResetOtpExpiresAt: { $gt: new Date() },
      passwordResetOtpAttempts: { $not: { $gte: OTP_MAX_ATTEMPTS } },
    },
    { $inc: { passwordResetOtpAttempts: 1 } },
    { new: true },
  ).select("+passwordResetOtpHash +passwordResetOtpAttempts");

  if (!user || !user.passwordResetOtpHash) return { ok: false };

  if (!safeEqualHex(user.passwordResetOtpHash, hashPasswordResetOtp(user._id.toString(), otp))) {
    return { ok: false };
  }

  const resetToken = crypto.randomBytes(RESET_AUTH_TOKEN_BYTES).toString("hex");

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

export async function resetPassword(
  resetToken: string,
  newPassword: string,
): Promise<IUser | null> {
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  return User.findOneAndUpdate(
    {
      passwordResetAuthTokenHash: sha256Hex(resetToken),
      passwordResetAuthExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        passwordHash,
        passwordResetAuthTokenHash: null,
        passwordResetAuthExpiresAt: null,
      },
      $inc: { tokenVersion: 1 },
    },
    { new: true },
  );
}
