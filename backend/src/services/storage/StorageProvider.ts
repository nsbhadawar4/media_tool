import type { Readable } from 'node:stream';

export interface PutObjectInput {
  /** Full key/path within the bucket or local root, e.g. "folders/abc/photo-169..._a1b2.jpg" */
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
 * Implementations: LocalStorageProvider, S3StorageProvider (also used for R2, which is
 * S3-API-compatible).
 */
export interface IStorageProvider {
  readonly name: 'local' | 'r2' | 's3';

  /** Persist a file that multer already wrote to a temp path, under `key`. */
  putObject(input: PutObjectInput): Promise<StoredObjectMeta>;

  /** Permanently remove an object. Should not throw if the object is already gone. */
  deleteObject(key: string): Promise<void>;

  /** Open a (optionally byte-range) read stream for serving/downloading a file. */
  getObjectStream(key: string, range?: StreamRange): Promise<StreamResult>;

  /**
   * A directly usable URL for this object, if the provider can produce one
   * (e.g. a public R2/S3 bucket or CDN). Returns null when files must be
   * streamed through the API instead (e.g. local dev storage).
   */
  getPublicUrl(key: string): string | null;
}
