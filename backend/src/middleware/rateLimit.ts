import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../utils/apiResponse';

export const loginRateLimiter = rateLimit({
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
