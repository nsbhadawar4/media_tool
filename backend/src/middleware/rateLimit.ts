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
