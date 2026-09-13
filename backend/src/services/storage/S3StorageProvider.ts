import fs from 'node:fs';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presignS3Url } from '@aws-sdk/s3-request-presigner';
import { AppError } from '../../utils/AppError';
import type {
  StorageService,
  UploadInput,
  StoredObjectMeta,
  StreamRange,
  StreamResult,
} from './StorageProvider';

export interface S3ProviderOptions {
  name: 's3' | 'r2';
  bucket: string;
  clientConfig: S3ClientConfig;
  /** Optional public base URL (custom domain / CDN) to build direct links from. */
  publicBaseUrl?: string | null;
}

/**
 * Works for both Amazon S3 and Cloudflare R2 — R2 exposes an S3-compatible API,
 * so only the client configuration (endpoint/credentials) differs between the two.
 */
export class S3StorageProvider implements StorageService {
  readonly name: 's3' | 'r2';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string | null;

  constructor(opts: S3ProviderOptions) {
    this.name = opts.name;
    this.bucket = opts.bucket;
    this.publicBaseUrl = opts.publicBaseUrl ?? null;
    this.client = new S3Client(opts.clientConfig);
  }

  async upload({ key, sourcePath, contentType }: UploadInput): Promise<StoredObjectMeta> {
    const body = fs.createReadStream(sourcePath);
    const stat = fs.statSync(sourcePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: stat.size,
      }),
    );
    await fs.promises.unlink(sourcePath).catch(() => undefined);
    return { key, size: stat.size };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key })).catch((err) => {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status !== 404) throw err;
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404) return false;
      throw err;
    }
  }

  async getObjectStream(key: string, range?: StreamRange): Promise<StreamResult> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      );
      const totalSize = parseTotalSize(res.ContentRange, res.ContentLength);
      return {
        stream: res.Body as unknown as import('node:stream').Readable,
        contentLength: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
        range,
        totalSize,
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (status === 404 || status === 403) throw AppError.notFound('File not found in storage');
      throw err;
    }
  }

  getUrl(key: string): string | null {
    if (!this.publicBaseUrl) return null;
    const base = this.publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }

  /** Presigned GET URL — grants temporary direct access to an otherwise-private object. */
  async getSignedUrl(key: string, expiresInSeconds = 3600): Promise<string | null> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return presignS3Url(this.client, command, { expiresIn: expiresInSeconds });
  }
}

function parseTotalSize(contentRange: string | undefined, contentLength: number | undefined): number {
  // ContentRange looks like "bytes 0-99/1000"
  if (contentRange) {
    const match = /\/(\d+)$/.exec(contentRange);
    if (match) return Number(match[1]);
  }
  return contentLength ?? 0;
}
