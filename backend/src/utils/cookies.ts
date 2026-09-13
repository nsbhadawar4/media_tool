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
