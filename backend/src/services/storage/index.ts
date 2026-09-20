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

let cachedProvider: StorageService | null = null;

function buildProvider(): StorageService {
  switch (env.STORAGE_PROVIDER) {
    case 'local':
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
        clientConfig: {
          region: 'auto',
          endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
        },
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
