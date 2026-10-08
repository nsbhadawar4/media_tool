import { Schema, model, type Document } from 'mongoose';

/**
 * Texts sent to one phone number within a rolling 24-hour window, across every signup attempt.
 *
 * Per-signup limits (cooldown, send cap) reset when a pending signup expires, and per-IP limits
 * reset with a new address; this is the cap neither can get around — it bounds how many texts
 * anyone can make the app send to a single number (SMS cost, and harassment of that number).
 * Entries remove themselves when their window ends (TTL index).
 */
export interface IPhoneSendQuota extends Document {
  phoneE164: string;
  windowStartedAt: Date;
  count: number;
  expiresAt: Date;
}

const phoneSendQuotaSchema = new Schema<IPhoneSendQuota>({
  phoneE164: { type: String, required: true, unique: true },
  windowStartedAt: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
});

phoneSendQuotaSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PhoneSendQuota = model<IPhoneSendQuota>('PhoneSendQuota', phoneSendQuotaSchema);
