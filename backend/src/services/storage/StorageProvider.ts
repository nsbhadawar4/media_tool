import type { Readable } from 'node:stream';

export interface UploadInput {
  /** Full key/path within the bucket or local root, e.g. "photos/<folderId>/163000-a1b2.jpg" */
  key: string;
  /** Local temp file path to read the bytes from (multer disk storage gives us this). */
  sourcePath: string;
  contentType: string;
}

export interface StoredObjectMeta {
  key: string;
  size: number;
}

/** What an object actually is in storage, as opposed to what a client claimed it would be. */
export interface ObjectStat {
  key: string;
  size: number;
  contentType: string | null;
}

export interface StreamRange {
  start: number;
  end: number;
}

export interface StreamResult {
  stream: Readable;
  contentLength: number;
  contentType: string;
  range?: StreamRange;
  totalSize: number;
}

export interface SignedUrlOptions {
  expiresInSeconds?: number;
  /** Makes the signed response download under this name rather than display inline. */
  downloadFilename?: string;
  /** Content-Type the storage should report, overriding whatever was stored. */
  contentType?: string;
}

export interface UploadUrlInput {
  key: string;
  /** Signed into the URL: the client must send exactly this Content-Type or the PUT fails. */
  contentType: string;
  expiresInSeconds?: number;
}

/**
 * Storage abstraction so the rest of the app never talks to a disk or a bucket directly.
 * Implementations: LocalStorageProvider (dev), S3StorageProvider (also used for R2, which
 * is S3-API-compatible), GridFsStorageProvider (files in MongoDB, for a deployment with
 * no bucket). Swapping STORAGE_PROVIDER in .env is the only thing that changes.
 */
export interface StorageService {
  readonly name: 'local' | 'r2' | 's3' | 'gridfs';

  /** Persist a file that multer already wrote to a temp path, under `key`. */
  upload(input: UploadInput): Promise<StoredObjectMeta>;

  /** Permanently remove an object. Should not throw if the object is already gone. */
  delete(key: string): Promise<void>;

  /** Whether an object exists at this key, without downloading it. */
  exists(key: string): Promise<boolean>;

  /**
   * Size and content type of a stored object, or null when it isn't there. Used to check
   * what a direct-to-bucket upload actually deposited, which is the only trustworthy
   * account of it — the client's claimed size never touched this server.
   */
  stat(key: string): Promise<ObjectStat | null>;

  /**
   * A directly usable, permanent URL for this object, if the provider can produce one
   * (e.g. a public R2/S3 bucket or CDN bound to a custom domain). Returns null when the
   * provider has no such URL (e.g. local dev storage, or a private bucket) — callers must
   * stream the bytes through the API instead.
   */
  getUrl(key: string): string | null;

  /**
   * A time-limited URL granting temporary direct access to a private object
   * (S3/R2 presigned URL). Returns null for providers that can't produce one
   * (local dev storage has no direct-access URL of any kind).
   */
  getSignedUrl(key: string, options?: SignedUrlOptions): Promise<string | null>;

  /**
   * A time-limited URL the browser can PUT bytes straight to, bypassing this API.
   * Returns null for providers that can't offer one, and the caller then falls back to
   * uploading through the API. This is what makes files larger than a request body limit
   * possible at all on a serverless host: the bytes never pass through a function.
   */
  getUploadUrl(input: UploadUrlInput): Promise<string | null>;

  /**
   * Open a (optionally byte-range) read stream for serving/downloading a file.
   * Not part of the minimal upload/delete/getUrl/getSignedUrl/exists contract, but
   * required infrastructure here: it's how this app serves private files (with HTTP
   * Range support for video seeking) without ever exposing a public bucket URL.
   */
  getObjectStream(key: string, range?: StreamRange): Promise<StreamResult>;
}
