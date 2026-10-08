import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { User, type IUser } from '../models/User';
import { PendingPhoneSignup } from '../models/PendingPhoneSignup';
import { PhoneSendQuota } from '../models/PhoneSendQuota';
import { AppError } from '../utils/AppError';
import { getSmsProvider } from './sms';
import { runAfterResponse } from './backgroundTasks';

/**
 * Mobile-number signup: the account exists only after the number is proved by a 4-digit code.
 *
 *   start  → validates, stores a pending signup with a hashed code, texts the code
 *   resend → a new code, at most once a minute and a few times per signup
 *   verify → checks the code (5 tries, 10 minutes, once only) and only then creates the account
 *
 * Callers learn nothing about whether a number already has an account: start and resend answer
 * the same way either way, and the text itself goes out after the response (no timing signal).
 * A number that is already registered is sent a notice instead of a code, so its owner is told
 * and nobody else can complete a signup with it.
 */

export const OTP_DIGITS = 4;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** Codes texted per pending signup before it must expire and start over. */
export const MAX_SENDS = 5;
/** Texts to one number per rolling 24 hours, across every signup attempt and address. */
export const MAX_SENDS_PER_PHONE_PER_DAY = 10;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
/** How long an unfinished signup is kept at all. */
const PENDING_TTL_MS = 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

/**
 * Keyed with the server secret rather than a plain hash: a 4-digit code has only 10,000 values,
 * so an unkeyed hash read from a database dump would be reversed instantly.
 */
function hashOtp(phoneE164: string, otp: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`phone-signup:${phoneE164}:${otp}`).digest('hex');
}

function generateOtp(): string {
  return crypto.randomInt(0, 10 ** OTP_DIGITS).toString().padStart(OTP_DIGITS, '0');
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function codeMessage(otp: string): string {
  return `${otp} is your Media Tool verification code. It expires in 10 minutes. Never share it with anyone.`;
}

const ALREADY_REGISTERED_MESSAGE =
  'Someone tried to sign up for Media Tool with this number, which already has an account. ' +
  'If it was you, sign in instead. If not, you can ignore this message.';

/**
 * Takes one text from this number's daily quota; false once it is used up. Atomic: the
 * conditional update can't pass the cap however many requests race, and an exhausted entry
 * makes the upsert collide with itself (E11000) rather than create a second counter.
 */
async function consumePhoneSendQuota(phoneE164: string): Promise<boolean> {
  const now = new Date();
  // A window that has run out starts afresh.
  await PhoneSendQuota.updateOne(
    { phoneE164, windowStartedAt: { $lte: new Date(now.getTime() - QUOTA_WINDOW_MS) } },
    { $set: { windowStartedAt: now, count: 0, expiresAt: new Date(now.getTime() + QUOTA_WINDOW_MS) } },
  );
  try {
    await PhoneSendQuota.findOneAndUpdate(
      { phoneE164, count: { $lt: MAX_SENDS_PER_PHONE_PER_DAY } },
      { $inc: { count: 1 }, $setOnInsert: { windowStartedAt: now, expiresAt: new Date(now.getTime() + QUOTA_WINDOW_MS) } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000) return false;
    throw err;
  }
}

const QUOTA_EXHAUSTED = 'Too many codes have been requested for this number. Please try again tomorrow.';

function textAfterResponse(to: string, body: string, onFailure?: () => Promise<void>): void {
  const provider = getSmsProvider();
  runAfterResponse(async () => {
    try {
      await provider.send({ to, body });
    } catch (err) {
      logger.error(`Could not send SMS via ${provider.name}: ${err instanceof Error ? err.message : 'unknown error'}`);
      await onFailure?.();
    }
  });
}

/** What the client needs to show the code screen. Identical whether or not the number is taken. */
export interface PendingSignupState {
  phone: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}

/** start's answer: the state plus the token that binds this signup to the browser that began it. */
export interface StartedSignup extends PendingSignupState {
  signupToken: string;
}

/** `now` defaults to the present; a freshly issued code passes its own issue time instead. */
function stateFor(phoneE164: string, lastSentAt: Date, otpExpiresAt: Date, now = Date.now()): PendingSignupState {
  return {
    phone: phoneE164,
    // Rounded up, so a countdown never starts a second short (10:00, not 9:59).
    expiresInSeconds: Math.max(0, Math.ceil((otpExpiresAt.getTime() - now) / 1000)),
    resendInSeconds: Math.max(0, Math.ceil((lastSentAt.getTime() + RESEND_COOLDOWN_MS - now) / 1000)),
  };
}

export async function startPhoneSignup(input: {
  name: string;
  phoneE164: string;
  phoneDisplay: string;
  password: string;
}): Promise<StartedSignup> {
  const now = new Date();
  // Every caller gets a token of the same shape. One that doesn't match a stored signup (the
  // cases below that change nothing) just can't verify anything.
  const signupToken = crypto.randomBytes(32).toString('hex');
  const existing = await PendingPhoneSignup.findOne({ phoneE164: input.phoneE164 });

  // Within the cooldown, or past the send cap: don't text again, and don't let a second request
  // overwrite the first person's pending details either. Same answer as a fresh start.
  if (existing && (now.getTime() - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS || existing.sendCount >= MAX_SENDS)) {
    return { ...stateFor(existing.phoneE164, existing.lastSentAt, existing.otpExpiresAt), signupToken };
  }

  // Checked for registered and new numbers alike (both are texted), so it reveals nothing.
  if (!(await consumePhoneSendQuota(input.phoneE164))) throw AppError.tooManyRequests(QUOTA_EXHAUSTED);

  const alreadyRegistered = Boolean(await User.exists({ phoneE164: input.phoneE164 }));
  const otp = generateOtp();
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await PendingPhoneSignup.updateOne(
    { phoneE164: input.phoneE164 },
    {
      $set: {
        phoneDisplay: input.phoneDisplay,
        name: input.name,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_ROUNDS),
        clientTokenHash: sha256(signupToken),
        // A registered number gets no usable code — verify can never create a second account.
        otpHash: alreadyRegistered ? null : hashOtp(input.phoneE164, otp),
        otpExpiresAt,
        otpAttempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      },
      $inc: { sendCount: 1 },
    },
    { upsert: true },
  );

  textAfterResponse(input.phoneE164, alreadyRegistered ? ALREADY_REGISTERED_MESSAGE : codeMessage(otp), async () => {
    // Nothing was delivered: let them ask again straight away.
    await PendingPhoneSignup.updateOne({ phoneE164: input.phoneE164 }, { $set: { lastSentAt: new Date(0) } });
  });

  return { ...stateFor(input.phoneE164, now, otpExpiresAt, now.getTime()), signupToken };
}

/**
 * A fresh code for an existing pending signup. Answers the same shape whether or not one
 * exists; texts only when the cooldown has passed and the send cap allows.
 */
export async function resendPhoneSignupCode(phoneE164: string, signupToken: string): Promise<PendingSignupState> {
  const now = new Date();
  const pending = await PendingPhoneSignup.findOne({ phoneE164 });
  if (!pending || !safeEqual(sha256(signupToken), pending.clientTokenHash)) {
    return { phone: phoneE164, expiresInSeconds: OTP_TTL_MS / 1000, resendInSeconds: RESEND_COOLDOWN_MS / 1000 };
  }
  if (now.getTime() - pending.lastSentAt.getTime() < RESEND_COOLDOWN_MS || pending.sendCount >= MAX_SENDS) {
    return stateFor(pending.phoneE164, pending.lastSentAt, pending.otpExpiresAt);
  }

  if (!(await consumePhoneSendQuota(phoneE164))) throw AppError.tooManyRequests(QUOTA_EXHAUSTED);

  const alreadyRegistered = Boolean(await User.exists({ phoneE164 }));
  const otp = generateOtp();
  const otpExpiresAt = new Date(now.getTime() + OTP_TTL_MS);
  await PendingPhoneSignup.updateOne(
    { _id: pending._id },
    {
      $set: {
        otpHash: alreadyRegistered ? null : hashOtp(phoneE164, otp),
        otpExpiresAt,
        otpAttempts: 0,
        lastSentAt: now,
        expiresAt: new Date(now.getTime() + PENDING_TTL_MS),
      },
      $inc: { sendCount: 1 },
    },
  );
  textAfterResponse(phoneE164, alreadyRegistered ? ALREADY_REGISTERED_MESSAGE : codeMessage(otp), async () => {
    await PendingPhoneSignup.updateOne({ _id: pending._id }, { $set: { lastSentAt: new Date(0) } });
  });
  return stateFor(phoneE164, now, otpExpiresAt, now.getTime());
}

export type VerifyFailure = 'invalid' | 'incorrect' | 'expired' | 'locked';
export type VerifyResult = { ok: true; user: IUser } | { ok: false; reason: VerifyFailure; attemptsRemaining?: number };

/**
 * Checks the code and, only if it is right, creates the account.
 *
 * The specific reason for a failure (incorrect / expired / locked) is only given to the browser
 * that started this signup — it alone holds the token. Anyone else, and any request for a number
 * with no signup in progress, gets the same generic `invalid`, so the endpoint reveals nothing
 * about which numbers have pending signups or accounts.
 */
export async function verifyPhoneSignup(phoneE164: string, otp: string, signupToken: string): Promise<VerifyResult> {
  const now = new Date();
  const pending = await PendingPhoneSignup.findOne({ phoneE164 });
  // Not this browser's signup (or none at all). Deliberately not counted as an attempt, so
  // nobody can lock out the real signup by guessing with a bad token.
  if (!pending || !safeEqual(sha256(signupToken), pending.clientTokenHash)) return { ok: false, reason: 'invalid' };

  if (pending.otpAttempts >= OTP_MAX_ATTEMPTS) return { ok: false, reason: 'locked' };
  // No live code: already used, or this number is already registered (which must not be said).
  if (!pending.otpHash) return { ok: false, reason: 'invalid' };
  if (pending.otpExpiresAt <= now) return { ok: false, reason: 'expired' };

  // Spend one attempt *before* comparing, atomically. Reading the counter and writing it back
  // afterwards would let parallel wrong guesses all see "0 used" and each write 1 — unlimited
  // guesses. Conditional on this code, so a resend in between doesn't get charged for it.
  const reserved = await PendingPhoneSignup.findOneAndUpdate(
    { _id: pending._id, otpHash: pending.otpHash, otpAttempts: { $lt: OTP_MAX_ATTEMPTS } },
    { $inc: { otpAttempts: 1 } },
    { new: true },
  );
  if (!reserved) {
    // Other guesses used up the last attempts first, or a resend replaced the code.
    const latest = await PendingPhoneSignup.findById(pending._id);
    return latest && latest.otpAttempts >= OTP_MAX_ATTEMPTS ? { ok: false, reason: 'locked' } : { ok: false, reason: 'invalid' };
  }

  if (!safeEqual(hashOtp(phoneE164, otp), pending.otpHash)) {
    const attempts = reserved.otpAttempts;
    // The fifth wrong guess burns the code for good; only a resend issues a new one.
    if (attempts >= OTP_MAX_ATTEMPTS) {
      await PendingPhoneSignup.updateOne({ _id: pending._id, otpHash: pending.otpHash }, { $set: { otpHash: null } });
    }
    return attempts >= OTP_MAX_ATTEMPTS
      ? { ok: false, reason: 'locked' }
      : { ok: false, reason: 'incorrect', attemptsRemaining: OTP_MAX_ATTEMPTS - attempts };
  }

  // Claim the code atomically, so two requests racing with the same correct code can't both win.
  const claimed = await PendingPhoneSignup.findOneAndUpdate(
    { _id: pending._id, otpHash: pending.otpHash },
    { $set: { otpHash: null } },
  );
  if (!claimed) return { ok: false, reason: 'invalid' };

  try {
    const user = await User.create({
      name: pending.name,
      passwordHash: pending.passwordHash,
      phoneE164,
      phoneVerifiedAt: now,
      mobile: pending.phoneDisplay,
      authProvider: 'mobile',
      // New accounts choose a plan before using the app.
      onboardingRequired: true,
      // Never taken from the request: a public endpoint must not be able to mint an admin.
      role: 'user',
    });
    await PendingPhoneSignup.deleteOne({ _id: pending._id });
    return { ok: true, user };
  } catch (err) {
    // The number was registered in the meantime (unique index): same answer as a bad code.
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000) return { ok: false, reason: 'invalid' };
    throw err;
  }
}
