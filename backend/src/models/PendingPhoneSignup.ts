import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * A mobile-number signup that has not been verified yet. The account itself is only created
 * once the OTP is confirmed (phoneSignupService.verifyPhoneSignup); until then everything the
 * person entered lives here, so an unverified number never becomes a usable account.
 *
 * Nothing secret is stored readable: the password is already a bcrypt hash and the OTP an
 * HMAC. Each document removes itself (TTL index on `expiresAt`) once the signup is abandoned.
 */
export interface IPendingPhoneSignup extends Document {
  _id: Types.ObjectId;
  phoneE164: string;
  /** Display form of the number, copied to the account's `mobile` on success. */
  phoneDisplay: string;
  name: string;
  passwordHash: string;
  /**
   * SHA-256 of the random token handed to the browser that started this signup. Resend and
   * verify require it, so someone restarting a signup for another person's number (replacing
   * the name and password) can't have the real owner's code complete *their* version.
   */
  clientTokenHash: string;
  /**
   * HMAC of the current OTP; null once used, locked out, or when this number already has an
   * account (then no code is issued at all — see startPhoneSignup).
   */
  otpHash: string | null;
  otpExpiresAt: Date;
  otpAttempts: number;
  /** Texts sent for this signup, capped to bound SMS cost and abuse. */
  sendCount: number;
  lastSentAt: Date;
  /** When this whole pending signup is discarded. */
  expiresAt: Date;
}

const pendingPhoneSignupSchema = new Schema<IPendingPhoneSignup>(
  {
    phoneE164: { type: String, required: true, unique: true },
    phoneDisplay: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true },
    clientTokenHash: { type: String, required: true },
    otpHash: { type: String, default: null },
    otpExpiresAt: { type: Date, required: true },
    otpAttempts: { type: Number, default: 0 },
    sendCount: { type: Number, default: 0 },
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

pendingPhoneSignupSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingPhoneSignup = model<IPendingPhoneSignup>('PendingPhoneSignup', pendingPhoneSignupSchema);
