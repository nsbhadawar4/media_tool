import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_BASE_URL: z.string().default('http://localhost:4000'),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  MEDIA_TOKEN_EXPIRES_IN: z.string().default('2h'),

  COOKIE_NAME: z.string().default('mt_session'),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: boolish(false),
  COOKIE_DOMAIN: optionalString,

  ADMIN_EMAIL: optionalString,
  ADMIN_NAME: optionalString,
  ADMIN_PASSWORD: optionalString,
  ADMIN_PASSWORD_HASH: optionalString,

  FRONTEND_URL: z.string().default('http://localhost:3000'),

  STORAGE_PROVIDER: z.enum(['local', 'r2', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./uploads'),

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

  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().default(512),
  MAX_FILES_PER_UPLOAD: z.coerce.number().int().positive().default(25),

  LOGIN_RATE_LIMIT_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(
    `\nInvalid environment configuration. Check backend/.env against backend/.env.example:\n${issues}\n`,
  );
  process.exit(1);
}

const raw = parsed.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isDevelopment: raw.NODE_ENV === 'development',

  /** Every origin allowed to talk to this API with credentials. */
  allowedOrigins: raw.FRONTEND_URL.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),

  maxFileSizeBytes: raw.MAX_FILE_SIZE_MB * 1024 * 1024,

  /** Absolute path used by the local storage provider. */
  localStorageRoot: path.isAbsolute(raw.LOCAL_STORAGE_DIR)
    ? raw.LOCAL_STORAGE_DIR
    : path.resolve(process.cwd(), raw.LOCAL_STORAGE_DIR),

  tmpDir: path.resolve(process.cwd(), 'tmp'),
} as const;

export type Env = typeof env;
