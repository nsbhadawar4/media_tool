import type { Response } from 'express';
import { env } from '../config/env';

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function parseMaxAge(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!match) return ONE_WEEK_MS;
  const value = Number(match[1]);
  const unit = match[2];
  const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's' | 'm' | 'h' | 'd'];
  return value * unitMs;
}

/**
 * `persistent: true` sets a normal maxAge cookie that survives browser restarts
 * ("Remember me" checked). `persistent: false` omits maxAge entirely, making it a
 * browser-session cookie the browser discards when closed — the JWT itself still
 * expires after JWT_EXPIRES_IN either way, that upper bound doesn't change.
 */
export function setSessionCookie(res: Response, token: string, persistent = true): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    ...(persistent ? { maxAge: parseMaxAge(env.JWT_EXPIRES_IN) } : {}),
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/',
  });
}

/**
 * The nonce for one Google sign-in attempt. HTTP-only, scoped to the Google endpoints, and
 * short-lived; Google echoes the same value inside its signed ID token, and the sign-in is
 * refused unless the two match. That binds the token to the browser that asked for it, which
 * stops a replayed token and a cross-site "log in as me" request.
 */
export const GOOGLE_NONCE_COOKIE = 'mt_google_nonce';

export function setGoogleNonceCookie(res: Response, nonce: string): void {
  res.cookie(GOOGLE_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    maxAge: 10 * 60 * 1000,
    path: '/api/auth/google',
  });
}

export function clearGoogleNonceCookie(res: Response): void {
  res.clearCookie(GOOGLE_NONCE_COOKIE, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/api/auth/google',
  });
}
