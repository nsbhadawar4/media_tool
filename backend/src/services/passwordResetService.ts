import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { logger } from "../utils/logger";
import { User, type IUser } from "../models/User";
import { getEmailProvider } from "./email";

// Matches authController's BCRYPT_ROUNDS: password hashing cost is the same
const BCRYPT_ROUNDS = 12;

const OTP_DIGITS = 4;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
/** Minimum time between two OTPs for the same account, so "Resend" cannot be used to spam. */
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const RESET_AUTH_TOKEN_BYTES = 32;
/** How long a verified OTP's authorization to set a new password stays good for. */
const RESET_AUTH_TTL_MS = 10 * 60 * 1000;

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
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
    "+passwordResetOtpLastSentAt",
  );
  if (!user || !user.isActive) return "no_account";

  if (
    user.passwordResetOtpLastSentAt &&
    Date.now() - user.passwordResetOtpLastSentAt.getTime() <
      OTP_RESEND_COOLDOWN_MS
  ) {
    return "cooldown";
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
        passwordResetAuthTokenHash: null,
        passwordResetAuthExpiresAt: null,
      },
    },
  );

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

  try {
    await provider.send({
      to: user.email,
      subject: "Your Media Tool Password Reset OTP",
      text,
      html,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    logger.error(
      `Could not send password reset code to ${user.email}: ${detail}`,
    );
  }

  return "sent";
}

export type VerifyOtpResult = { ok: true; resetToken: string } | { ok: false };

export async function verifyPasswordResetOtp(
  email: string,
  otp: string,
): Promise<VerifyOtpResult> {
  const user = await User.findOne({ email }).select(
    "+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetOtpAttempts",
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
    await User.updateOne(
      { _id: user._id },
      { $inc: { passwordResetOtpAttempts: 1 } },
    );
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
