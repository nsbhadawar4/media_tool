import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';
import { sendError } from '../utils/apiResponse';
import { MongoRateLimitStore } from './mongoRateLimitStore';

/**
 * Counters for the authentication limiters live in MongoDB, shared by every serverless
 * instance (see MongoRateLimitStore). If the database can't be reached the request is let
 * through rather than failed — it needs the database anyway, and fails there on its own.
 */
const shared = (name: string): Pick<Options, 'store' | 'passOnStoreError'> => ({
  store: new MongoRateLimitStore(name),
  passOnStoreError: true,
});

export const loginRateLimiter = rateLimit({
  ...shared('login-ip'),
  windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
  max: env.LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many login attempts. Please try again later.');
  },
});

/**
 * Signup is rate limited by IP too. Unlike login this counts *successful* requests as
 * well — the abuse to prevent here is bulk account creation, which by definition succeeds.
 */
export const signupRateLimiter = rateLimit({
  ...shared('signup-ip'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many accounts created from this address. Please try again later.');
  },
});

/**
 * Requesting a reset counts even when it succeeds, same as signup — the abuse to prevent
 * is emailing someone else's address over and over, which by definition "succeeds" every
 * time from this endpoint's point of view.
 */
export const forgotPasswordRateLimiter = rateLimit({
  ...shared('forgot-ip'),
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many password reset requests. Please try again later.');
  },
});

/**
 * Verifying a code is a guessing endpoint against a deliberately small keyspace (4
 * digits, 10,000 possibilities) — the account-level lockout in passwordResetService (5
 * wrong guesses invalidates the code entirely, forcing a resend) is the real defense.
 * This just bounds how fast one IP can even try, the same role loginRateLimiter plays
 * for a password guess.
 */
export const verifyOtpRateLimiter = rateLimit({
  ...shared('reset-verify-ip'),
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many attempts. Please request a new code.');
  },
});

/** Looser general limiter applied to the whole API to blunt brute-force/scanning. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many requests. Please slow down.');
  },
});

/**
 * Review submissions and edits, per account (it runs after requireAuth). Generous for a person
 * fixing a typo, tight enough that an edit loop cannot flood the moderation queue.
 */
export const reviewWriteRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
  handler: (_req, res) => {
    sendError(res, 429, 'You have updated your review a lot recently. Please try again later.');
  },
});

/**
 * Mobile signup texts cost money and can be abused to spam a number or run up SMS bills, so
 * starting / resending is limited per address on top of the per-number cooldown and send cap
 * in phoneSignupService.
 */
export const phoneOtpSendRateLimiter = rateLimit({
  ...shared('sms-send-ip'),
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many verification requests. Please try again later.');
  },
});

/** Guessing a 4-digit code: 5 tries per code already, and this caps tries across codes too. */
export const phoneOtpVerifyRateLimiter = rateLimit({
  ...shared('sms-verify-ip'),
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    sendError(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
  },
});

/** The account a sign-in attempt is for, normalised; null when the body names none. */
function loginAccountKey(req: Request): string | null {
  const body = (req.body ?? {}) as { email?: unknown; country?: unknown; mobile?: unknown };
  if (typeof body.email === 'string' && body.email.trim()) return `email:${body.email.trim().toLowerCase()}`;
  if (typeof body.mobile === 'string' && body.mobile.replace(/\D/g, '')) {
    return `mobile:${String(body.country ?? '').toUpperCase()}:${body.mobile.replace(/\D/g, '')}`;
  }
  return null;
}

/**
 * Failed sign-ins per *account*, whatever address they come from — the per-IP limiter can't see
 * a guessing run spread across many addresses. Keyed by what was typed, so it behaves the same
 * for accounts that exist and ones that don't (nothing to learn from it). The trade-off is that
 * someone can hold an account's sign-in shut for one window; 15 minutes keeps that a nuisance.
 */
export const loginAccountRateLimiter = rateLimit({
  ...shared('login-account'),
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: (req) => loginAccountKey(req) === null,
  keyGenerator: (req) => loginAccountKey(req) ?? 'none',
  handler: (_req, res) => {
    sendError(res, 429, 'Too many failed sign-in attempts for this account. Please wait 15 minutes and try again.');
  },
});
