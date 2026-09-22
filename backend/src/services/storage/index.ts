import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import { GridFsStorageProvider } from './GridFsStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { S3StorageProvider } from './S3StorageProvider';
import type { StorageService } from './StorageProvider';

export type {
  StorageService,
  UploadInput,
  UploadUrlInput,
  SignedUrlOptions,
  StoredObjectMeta,
  ObjectStat,
  StreamRange,
  StreamResult,
} from './StorageProvider';

export interface R2Credentials {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Pulls the bare account id out of whatever was pasted into R2_ACCOUNT_ID.
 *
 * Cloudflare shows the account id as the subdomain of the bucket's S3 endpoint, so the
 * endpoint — or the whole `https://…` URL — is what people copy out of the dashboard.
 * Interpolated as-is into the endpoint below, that yields
 * `https://https://<id>.r2.cloudflarestorage.com.r2.cloudflarestorage.com`, and every
 * request built from it fails with an SDK error that mentions neither the variable nor
 * the mistake. Accepting both spellings costs one regex and removes an entire class of
 * "uploads return Internal server error" deployments.
 */
export function normalizeR2AccountId(value: string): string {
  const host = value
    .trim()
    .replace(/^https?:\/\//i, '')
    // Drops a trailing bucket path or slash, so a copied endpoint-with-bucket also works.
    .replace(/\/.*$/, '');

  const fromEndpoint = /^([^.]+)\.r2\.cloudflarestorage\.com$/i.exec(host);
  return fromEndpoint ? fromEndpoint[1]! : host;
}

/**
 * S3 client settings for Cloudflare R2.
 *
 * Exported so the two lines that actually make R2 work can be asserted by a test rather
 * than trusted — they are invisible in behaviour until an upload silently stops producing
 * thumbnails, which is exactly the kind of regression nobody notices for weeks.
 *
 * R2 speaks the S3 API but not the checksum framing this SDK applies by default. Since
 * v3.729 a PutObject with a streamed body goes out as `content-encoding: aws-chunked`
 * with a trailing CRC32 (`x-amz-trailer`) and no `content-length`, and R2 rejects that.
 * The browser's presigned uploads are unaffected, because the SDK signs no checksum into
 * a presigned URL — so the damage is confined to the puts this server makes itself, which
 * is every thumbnail and every video poster. Those fail softly, leaving a library of
 * files with no previews and nothing obvious to explain it.
 *
 * WHEN_REQUIRED keeps a checksum on the operations that genuinely mandate one and sends
 * everything else as a plain, length-delimited PUT.
 */
export function buildR2ClientConfig({ accountId, accessKeyId, secretAccessKey }: R2Credentials): S3ClientConfig {
  return {
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  };
}

let cachedProvider: StorageService | null = null;

/**
 * A deployment that is not configured to store files, reported so the operator can read
 * it.
 *
 * These used to be plain `Error`s, which the global handler treats as an unexpected fault
 * and — in production, correctly for a genuine fault — replaces with "Internal server
 * error". The result was an app that knew exactly which variable was missing and told
 * nobody: every upload failed with five words that name nothing and suggest no fix. A
 * misconfiguration is not a secret; these messages name variable *names*, never values.
 */
function configError(message: string): AppError {
  return AppError.unavailable(message);
}

function buildProvider(): StorageService {
  switch (env.STORAGE_PROVIDER) {
    case 'local':
      /**
       * A Vercel Function's filesystem is read-only apart from /tmp, and /tmp does not
       * outlive the instance. Left to run, this provider either throws EROFS on the first
       * upload or appears to work and loses the file minutes later — and both surface to
       * the user as "my images are broken", long after the cause. Failing here instead
       * puts the actual problem, and its fix, in the deployment log.
       */
      if (env.isServerless && !env.ALLOW_LOCAL_STORAGE_ON_SERVERLESS) {
        throw configError(
          'STORAGE_PROVIDER=local cannot be used on a serverless deployment: the filesystem is ' +
            'read-only and ephemeral, so uploaded files would be lost. Set STORAGE_PROVIDER=r2 ' +
            'along with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME ' +
            'in the project environment variables. See DEPLOYMENT.md.',
        );
      }
      return new LocalStorageProvider();

    /**
     * Nothing to configure: it uses MONGODB_URI, which the app cannot start without, so
     * there is no combination of variables that can leave this one half-set. That is most
     * of the point of it — see GridFsStorageProvider for what it costs instead.
     */
    case 'gridfs':
      return new GridFsStorageProvider();

    case 'r2': {
      const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL } = env;
      if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
        // Names what is *missing* as well as what is required: with four variables to set,
        // "requires A, B, C and D" leaves the operator to diff that list by eye against a
        // dashboard, which is exactly where a typo'd name hides.
        const missing = [
          ['R2_ACCOUNT_ID', R2_ACCOUNT_ID],
          ['R2_ACCESS_KEY_ID', R2_ACCESS_KEY_ID],
          ['R2_SECRET_ACCESS_KEY', R2_SECRET_ACCESS_KEY],
          ['R2_BUCKET_NAME', R2_BUCKET_NAME],
        ]
          .filter(([, value]) => !value)
          .map(([name]) => name);

        throw configError(
          'STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and ' +
            `R2_BUCKET_NAME. Not set: ${missing.join(', ')}. See DEPLOYMENT.md §4.`,
        );
      }

      const accountId = normalizeR2AccountId(R2_ACCOUNT_ID);
      if (!/^[A-Za-z0-9_-]+$/.test(accountId)) {
        throw configError(
          'R2_ACCOUNT_ID is not a Cloudflare account id. Copy the id itself, or the ' +
            'https://<account-id>.r2.cloudflarestorage.com endpoint it appears in — not the ' +
            'bucket URL or the API token. See DEPLOYMENT.md §3.',
        );
      }

      return new S3StorageProvider({
        name: 'r2',
        bucket: R2_BUCKET_NAME,
        publicBaseUrl: R2_PUBLIC_BASE_URL ?? null,
        clientConfig: buildR2ClientConfig({
          accountId,
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        }),
      });
    }

    case 's3': {
      const { S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_ENDPOINT, S3_FORCE_PATH_STYLE } =
        env;
      if (!S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET_NAME) {
        const missing = [
          ['S3_REGION', S3_REGION],
          ['S3_ACCESS_KEY_ID', S3_ACCESS_KEY_ID],
          ['S3_SECRET_ACCESS_KEY', S3_SECRET_ACCESS_KEY],
          ['S3_BUCKET_NAME', S3_BUCKET_NAME],
        ]
          .filter(([, value]) => !value)
          .map(([name]) => name);

        throw configError(
          'STORAGE_PROVIDER=s3 requires S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and ' +
            `S3_BUCKET_NAME. Not set: ${missing.join(', ')}.`,
        );
      }
      return new S3StorageProvider({
        name: 's3',
        bucket: S3_BUCKET_NAME,
        clientConfig: {
          region: S3_REGION,
          credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
          ...(S3_ENDPOINT
            ? {
                endpoint: S3_ENDPOINT,
                forcePathStyle: S3_FORCE_PATH_STYLE,
                /**
                 * S3_ENDPOINT is only ever set to reach something that is not Amazon S3 —
                 * MinIO, Backblaze, R2 by hand. The `aws-chunked` body framing with a
                 * trailing checksum that the SDK applies by default is an AWS extension,
                 * and an S3-compatible service is under no obligation to decode it; one
                 * that does not will either reject the upload or store the framing as
                 * part of the file. Amazon S3 itself, reached without a custom endpoint,
                 * keeps the default. Same reasoning as buildR2ClientConfig above.
                 */
                requestChecksumCalculation: 'WHEN_REQUIRED' as const,
                responseChecksumValidation: 'WHEN_REQUIRED' as const,
              }
            : {}),
        },
      });
    }

    default:
      throw AppError.internal(`Unknown STORAGE_PROVIDER: ${env.STORAGE_PROVIDER}`);
  }
}

/** Lazily built, memoized singleton — call sites never need to know which provider is active. */
export function getStorageProvider(): StorageService {
  if (!cachedProvider) {
    cachedProvider = buildProvider();
  }
  return cachedProvider;
}

/**
 * Whether this deployment is configured to store files at all, without throwing and
 * without a network round trip.
 *
 * For the health check, which is unauthenticated: it reports only the yes/no, never the
 * reason, because the reason names the provider and its variables and that describes the
 * deployment to an anonymous caller. It is the difference between an operator knowing to
 * look at the storage variables and having to discover it by attempting an upload.
 *
 * "Ready" here means configured — the credentials are present and well-formed. It cannot
 * mean "the bucket accepts them", which only a real request can establish, so an upload
 * can still fail after this returns true. The upload path reports that case itself.
 */
export function isStorageConfigured(): boolean {
  try {
    getStorageProvider();
    return true;
  } catch {
    return false;
  }
}

/**
 * Turns a failed storage call into an error that says so.
 *
 * Nothing below this line is the caller's fault: the bucket rejected our credentials,
 * or could not be reached, or does not exist. As a bare SDK error it reaches the global
 * handler as an unexpected fault and becomes "Internal server error" — five words that
 * send an operator looking for a bug in the application when the answer is a variable in
 * the dashboard.
 *
 * The SDK's error *name* is included and its message is not. A name — `InvalidAccessKeyId`,
 * `NoSuchBucket`, `SignatureDoesNotMatch`, `AccessDenied` — identifies the condition
 * exactly in one word, while the message tends to carry the endpoint, and with it the
 * account id, to whoever happens to be signed in. The full error goes to the log, where
 * the operator and only the operator can read it.
 */
export function storageFailure(action: string, err: unknown, code?: string): AppError {
  // A configuration error already carries the better message; do not bury it.
  if (err instanceof AppError) return err;

  logger.error(`Storage could not ${action}`, err);

  const name = err instanceof Error ? err.name : '';
  const condition = name && name !== 'Error' ? ` (${name})` : '';

  return AppError.unavailable(
    `File storage is unavailable${condition}, so the server could not ${action}. ` +
      "Check the deployment's storage credentials and bucket name — see DEPLOYMENT.md §4.",
    code,
  );
}
