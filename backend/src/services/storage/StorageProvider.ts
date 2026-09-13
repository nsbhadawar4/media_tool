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

/**
 * Storage abstraction so the rest of the app never talks to a disk or a bucket directly.
 * Implementations: LocalStorageProvider (dev), S3StorageProvider (also used for R2, which
 * is S3-API-compatible). Swapping STORAGE_PROVIDER in .env is the only thing that changes.
 */
export interface StorageService {
  readonly name: 'local' | 'r2' | 's3';

  /** Persist a file that multer already wrote to a temp path, under `key`. */
  upload(input: UploadInput): Promise<StoredObjectMeta>;

  /** Permanently remove an object. Should not throw if the object is already gone. */
  delete(key: string): Promise<void>;

  /** Whether an object exists at this key, without downloading it. */
  exists(key: string): Promise<boolean>;

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
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string | null>;

  /**
   * Open a (optionally byte-range) read stream for serving/downloading a file.
   * Not part of the minimal upload/delete/getUrl/getSignedUrl/exists contract, but
   * required infrastructure here: it's how this app serves private files (with HTTP
   * Range support for video seeking) without ever exposing a public bucket URL.
   */
  getObjectStream(key: string, range?: StreamRange): Promise<StreamResult>;
}
