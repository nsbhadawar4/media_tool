import path from "node:path";
import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * Production gets a full policy built from what the app actually loads (audited: no external
 * scripts, styles or fonts — next/font serves fonts from this origin):
 *  - script-src needs 'unsafe-inline': Next streams inline <script> chunks into every page and
 *    the theme pre-paint script is inline. The alternative, per-request nonces, would force
 *    every page to render dynamically. 'unsafe-eval' is not needed in production.
 *  - style-src needs 'unsafe-inline': components use React style={} attributes throughout.
 *  - img-src / media-src / connect-src allow https:. Media URLs are same-origin but redirect
 *    to signed R2/S3 URLs, direct uploads PUT to the bucket, and the Ludo realtime socket is
 *    its own host — all set per deployment, so they can't be listed here safely.
 *  - blob: and data: cover upload previews, video posters, the avatar cropper, profile photos
 *    (data URLs) and the PDF preview (a blob: URL in an <iframe>; Chrome's PDF viewer in that
 *    frame is subject to object-src, which is why object-src allows blob:).
 * The policy still blocks scripts and frames from any other origin, plugins from anywhere but
 * here, the app being framed by another site, <base> hijacking and off-site form posts.
 *
 * Development keeps only the directives that can't interfere with hot reload, which needs eval
 * and a websocket to the dev server.
 */
const isProduction = process.env.NODE_ENV === 'production';
// Vercel's preview deployments inject the feedback toolbar from vercel.live.
const vercelPreview = process.env.VERCEL_ENV === 'preview' ? ' https://vercel.live' : '';

/**
 * A split deployment serves the API (and the media URLs it mints) from its own origin, given by
 * NEXT_PUBLIC_API_URL. That origin is allowed explicitly, so it works even when it isn't https:
 * (e.g. a self-hosted API on plain http). Same-origin deployments leave it unset: nothing added.
 */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!raw) return '';
  try {
    return ` ${new URL(raw).origin}`;
  } catch {
    return '';
  }
}
const api = apiOrigin();

/**
 * Google Identity Services ("Continue with Google"): its script, the button and sign-in popup
 * frames, and its stylesheet. Listed by exact path prefix rather than allowing all of google.com.
 */
const GOOGLE_GSI = ' https://accounts.google.com/gsi/';

const PRODUCTION_CSP: Record<string, string> = {
  'default-src': "'self'",
  'script-src': `'self' 'unsafe-inline'${GOOGLE_GSI}${vercelPreview}`,
  'style-src': `'self' 'unsafe-inline'${GOOGLE_GSI}`,
  'img-src': `'self' data: blob: https:${api}`,
  'media-src': `'self' data: blob: https:${api}`,
  'font-src': "'self' data:",
  'connect-src': `'self' https: wss:${api}`,
  'frame-src': `'self' blob:${api}${GOOGLE_GSI}${vercelPreview}`,
  'worker-src': "'self' blob:",
  'manifest-src': "'self'",
  'object-src': "'self' blob:",
  'frame-ancestors': "'self'",
  'base-uri': "'self'",
  'form-action': "'self'",
};
const DEVELOPMENT_CSP: Record<string, string> = {
  'frame-ancestors': "'self'",
  'base-uri': "'self'",
  'form-action': "'self'",
};

const CONTENT_SECURITY_POLICY = Object.entries(isProduction ? PRODUCTION_CSP : DEVELOPMENT_CSP)
  .map(([directive, value]) => `${directive} ${value}`)
  .join('; ');

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY }],
      },
    ];
  },

  /** Shared Ludo rules (TypeScript source in packages/ludo-core), compiled along with the app. */
  transpilePackages: ["ludo-core"],

  /**
   * The backend lives one level up, outside this directory. Tracing defaults to the
   * Next.js project folder, so without this the compiled backend and its dependencies
   * would be left out of the deployed function and `/api/*` would fail at runtime with
   * a module-not-found.
   */
  outputFileTracingRoot: path.join(__dirname, ".."),

  /**
   * Required by Node at runtime rather than bundled.
   *
   * These resolve their own internals dynamically, or ship a native binary, and a
   * bundler either breaks them or silently drops files they load at runtime. Everything
   * listed here is a dependency of the backend package.
   *
   * `media-tool-backend` itself is deliberately *not* in this list. It is ordinary
   * compiled CommonJS that bundles cleanly, and letting Next bundle it is what makes
   * file tracing follow its `require`s and pull exactly the dependencies it uses into
   * the function. Marking it external instead left the traced bundle missing both its
   * own output and most of its dependencies.
   */
  serverExternalPackages: [
    "express",
    "mongoose",
    "sharp",
    "multer",
    "bcryptjs",
    "jsonwebtoken",
    "helmet",
    "compression",
    "morgan",
    "express-rate-limit",
  ],
};

export default nextConfig;
