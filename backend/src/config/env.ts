import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * True when this process is a Vercel Function (Vercel sets VERCEL=1 during both build
 * and runtime). Three things differ there and nowhere else: the filesystem is read-only
 * apart from /tmp, the frontend is served from the same origin as the API, and calling
 * process.exit() takes down an instance that may be serving other requests.
 */
export const isServerless = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);

/** Coerces the loose strings people actually put in .env files into booleans. */
const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined || v.trim() === '') return def;
      return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
    });

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

/**
 * Cookies must carry Secure in any deployed environment. Defaulting this off everywhere
 * would mean one forgotten .env line silently ships session cookies over plaintext, so
 * the default tracks the environment and only an explicit value overrides it.
 */
const secureByDefault = isServerless || process.env.NODE_ENV === 'production';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),

  /**
   * Origin that media URLs are built against. Empty means "same origin as the request",
   * which is what a single-project Vercel deployment wants: the API and the frontend
   * share a domain there, so `/api/media/...` already resolves correctly, and hardcoding
   * a host would break every preview deployment, each of which gets its own URL.
   */
  API_BASE_URL: z.string().default(isServerless ? '' : 'http://localhost:5000'),

  // MongoDB Atlas connection string. Required, with no fallback on purpose: a default
  // here would let the app start against some other database and silently write there.
  MONGODB_URI: z
    .string({ required_error: 'MONGODB_URI is required' })
    .trim()
    .min(1, 'MONGODB_URI is required')
    .refine((v) => v.startsWith('mongodb://') || v.startsWith('mongodb+srv://'), {
      message: 'MONGODB_URI must be a mongodb:// or mongodb+srv:// connection string',
    }),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MEDIA_TOKEN_EXPIRES_IN: z.string().default('2h'),
  /** Lifetime of the token that authorises one direct-to-bucket upload. */
  UPLOAD_TOKEN_EXPIRES_IN: z.string().default('30m'),

  COOKIE_NAME: z.string().default('mt_session'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: boolish(secureByDefault),
  COOKIE_DOMAIN: optionalString,

  ADMIN_EMAIL: optionalString,
  ADMIN_NAME: optionalString,
  ADMIN_PASSWORD: optionalString,
  ADMIN_PASSWORD_HASH: optionalString,

  FRONTEND_URL: z.string().default('http://localhost:3000'),

  /**
   * How many proxy hops sit in front of this app, for X-Forwarded-For. Security-relevant
   * rather than cosmetic: it decides which address the login rate limiter counts against,
   * so trusting more hops than actually exist lets a caller spoof the header and claim a
   * fresh quota per forged IP. On Vercel there is exactly one hop.
   */
  TRUST_PROXY: z.string().default(isServerless ? '1' : ''),

  STORAGE_PROVIDER: z.enum(['local', 'r2', 's3']).default('local'),
  // Directory the `local` storage provider writes to, relative to backend/.
  // LOCAL_STORAGE_DIR is the previous name for this and is still honoured below.
  UPLOAD_DIR: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().optional(),

  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET_NAME: optionalString,
  R2_PUBLIC_BASE_URL: optionalString,

  S3_REGION: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_BUCKET_NAME: optionalString,
  S3_ENDPOINT: optionalString,
  S3_FORCE_PATH_STYLE: boolish(false),

  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(500),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(25),

  LOGIN_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  const summary = `Invalid environment configuration:\n${issues}`;

  // eslint-disable-next-line no-console
  console.error(`\n${summary}\n\nCheck backend/.env against backend/.env.example.\n`);

  /**
   * Always thrown, never process.exit().
   *
   * Three different kinds of process load this module: the standalone API server, the
   * one-off CLI scripts, and the Vercel Function that Next.js builds from
   * app/api/[...path]/route.ts. Only the first of those owns its process. Exiting from
   * inside a module the other two merely import takes the host down with it — a Next.js
   * server dies mid-request with no response at all, instead of returning a 500 naming
   * the variable that is missing, and a serverless instance drops whatever other requests
   * it was serving.
   *
   * Deciding to exit belongs to whoever owns the process. server.ts catches this and
   * exits 1 with the message above, so `npm run dev` behaves exactly as it always has.
   */
  throw new Error(summary);
}

const raw = parsed.data;

/** UPLOAD_DIR is the documented name; LOCAL_STORAGE_DIR stays supported for older .env files. */
const uploadDir = raw.UPLOAD_DIR ?? raw.LOCAL_STORAGE_DIR ?? 'uploads';

/** Express's `trust proxy` setting: a hop count, a named preset, or false when unset. */
function resolveTrustProxy(value: string): number | string | boolean {
  const trimmed = value.trim();
  if (trimmed === '') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed.toLowerCase() === 'true') return true;
  if (trimmed.toLowerCase() === 'false') return false;
  return trimmed;
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',
  isServerless,

  /** Every origin allowed to talk to this API with credentials. */
  allowedOrigins: raw.FRONTEND_URL.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  /**
   * True when the browser reaches the API on the origin it loaded the app from, so no
   * cross-origin request is ever made and CORS has nothing left to negotiate.
   */
  isSameOrigin: raw.API_BASE_URL.trim() === '',

  trustProxy: resolveTrustProxy(raw.TRUST_PROXY),

  maxFileSizeBytes: raw.MAX_FILE_SIZE_MB * 1024 * 1024,

  /** Absolute path used by the local storage provider. */
  localStorageRoot: path.isAbsolute(uploadDir)
    ? uploadDir
    : path.resolve(process.cwd(), uploadDir),

  /**
   * Scratch space for bytes on their way somewhere else (multer's landing zone, sharp's
   * thumbnail output). /tmp is the only writable path in a Vercel Function — everything
   * else in the bundle is read-only, so writing beside the source fails with EROFS.
   */
  tmpDir: isServerless ? '/tmp' : path.resolve(process.cwd(), 'tmp'),
} as const;

export type Env = typeof env;
