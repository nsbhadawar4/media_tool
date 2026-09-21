import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
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
        throw new Error(
          'STORAGE_PROVIDER=local cannot be used on a serverless deployment: the filesystem is ' +
            'read-only and ephemeral, so uploaded files would be lost. Set STORAGE_PROVIDER=r2 ' +
            'along with R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME ' +
            'in the project environment variables. See DEPLOYMENT.md.',
        );
      }
      return new LocalStorageProvider();

    case 'r2': {
      const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL } = env;
      if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
        throw new Error(
          'STORAGE_PROVIDER=r2 requires R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME',
        );
      }
      return new S3StorageProvider({
        name: 'r2',
        bucket: R2_BUCKET_NAME,
        publicBaseUrl: R2_PUBLIC_BASE_URL ?? null,
        clientConfig: buildR2ClientConfig({
          accountId: R2_ACCOUNT_ID,
          accessKeyId: R2_ACCESS_KEY_ID,
          secretAccessKey: R2_SECRET_ACCESS_KEY,
        }),
      });
    }

    case 's3': {
      const { S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET_NAME, S3_ENDPOINT, S3_FORCE_PATH_STYLE } =
        env;
      if (!S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_BUCKET_NAME) {
        throw new Error(
          'STORAGE_PROVIDER=s3 requires S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_BUCKET_NAME',
        );
      }
      return new S3StorageProvider({
        name: 's3',
        bucket: S3_BUCKET_NAME,
        clientConfig: {
          region: S3_REGION,
          credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
          ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: S3_FORCE_PATH_STYLE } : {}),
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
