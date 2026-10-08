import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { sendError } from '../utils/apiResponse';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function refuse(res: Response): void {
  sendError(res, 403, 'Cross-site requests are not allowed.', undefined, 'CROSS_SITE_REQUEST');
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Cross-site request forgery guard for every state-changing request.
 *
 * The session cookie is SameSite=Lax by default, which already keeps it off cross-site POSTs —
 * but that is a deployment setting (COOKIE_SAMESITE=none is allowed for split-origin setups),
 * and a plain HTML form can POST to this API without any CORS preflight. So the request's own
 * provenance is checked too, using what browsers send and pages can't forge:
 *  - `Sec-Fetch-Site: cross-site` → refused. Same-origin and same-site (an API subdomain) pass.
 *  - Otherwise, an `Origin` header must be this site or one of FRONTEND_URL's origins.
 * Requests with neither header don't come from a browser page (curl, server-to-server, tests),
 * and so can't be forged by one.
 */
export function originGuard(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();

  const fetchSite = req.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    refuse(res);
    return;
  }
  if (fetchSite) return next();

  const origin = req.get('origin');
  if (!origin) return next();

  const host = hostOf(origin);
  const ownHosts = [req.get('x-forwarded-host'), req.get('host')].filter(Boolean);
  const allowed = host !== null && (ownHosts.includes(host) || env.allowedOrigins.some((o) => hostOf(o) === host));
  if (!allowed) {
    refuse(res);
    return;
  }
  next();
}
