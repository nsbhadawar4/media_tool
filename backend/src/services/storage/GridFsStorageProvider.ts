import { createReadStream } from 'node:fs';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import mongoose, { mongo } from 'mongoose';
import { AppError } from '../../utils/AppError';
import type {
  StorageService,
  UploadInput,
  StoredObjectMeta,
  ObjectStat,
  StreamRange,
  StreamResult,
} from './StorageProvider';

/**
 * Its own bucket rather than the driver's default `fs`, so the two collections it creates
 * are recognisable as this app's (`media.files`, `media.chunks`) next to the ordinary
 * ones, and so a database shared with anything else cannot collide with them.
 */
const BUCKET_NAME = 'media';

/**
 * Taken from mongoose's own re-export rather than the `mongodb` package directly.
 * Mongoose bundles its driver, so the two resolve to separate copies of the same types
 * and `mongoose.connection.db` does not satisfy a `Db` imported from the other one —
 * a mismatch TypeScript reports as an unrelated wall of option-type differences.
 */
type Db = NonNullable<typeof mongoose.connection.db>;
type GridFSBucket = mongo.GridFSBucket;
type GridFSFile = mongo.GridFSFile;

/**
 * Stores files in MongoDB itself, using GridFS.
 *
 * For a deployment with nowhere else to put them. A serverless filesystem cannot keep a
 * file, and object storage is a second account to open — so this uses the database that
 * is already there and already backed up, at the cost of two real limits:
 *
 *   - It cannot hand the browser an upload URL, so every byte travels through the API and
 *     the platform's request body cap (4.5 MB on Vercel) becomes the largest file this
 *     deployment can take. `prepareDirectUpload` enforces that up front rather than
 *     letting the platform reject the request with an error this app never sees.
 *   - A database is a more expensive place to keep bytes than a bucket. On an Atlas free
 *     cluster the whole library shares that tier's 512 MB.
 *
 * Neither is a reason to avoid it for a private library of a few hundred photos, and both
 * are reasons to move to `r2`/`s3` when it outgrows that. The migration script already
 * handles the move: this is a `StorageService` like any other.
 */
export class GridFsStorageProvider implements StorageService {
  readonly name = 'gridfs' as const;

  /** Cached against the `Db` it was built from, so a reconnect cannot leave it stale. */
  private cached: { db: Db; bucket: GridFSBucket } | null = null;

  /**
   * Resolved per call rather than in the constructor: the provider is built lazily on
   * first use, which on a cold serverless instance can still be before the connection
   * has finished opening.
   */
  private bucket(): GridFSBucket {
    const db = mongoose.connection.db;
    if (!db) {
      throw AppError.unavailable(
        'The database connection is not ready, so files cannot be read or written yet.',
      );
    }

    const cached = this.cached;
    if (cached && cached.db === db) return cached.bucket;

    const bucket = new mongo.GridFSBucket(db, { bucketName: BUCKET_NAME });
    this.cached = { db, bucket };
    return bucket;
  }

  /**
   * The newest revision stored under this key, or null.
   *
   * GridFS keys on a filename and keeps every write under it as a separate revision,
   * where every other provider here overwrites. Keys are unique per upload, so this only
   * matters for the one key that is deliberately rewritten — a video's thumbnail, when
   * its poster frame is replaced — but for that one it decides whether the gallery shows
   * the new still or the old one.
   */
  private async findFile(key: string): Promise<GridFSFile | null> {
    const [file] = await this.bucket()
      .find({ filename: key })
      .sort({ uploadDate: -1 })
      .limit(1)
      .toArray();
    return file ?? null;
  }

  /** contentType is deprecated on the driver's file document, so metadata carries it too. */
  private static contentTypeOf(file: GridFSFile): string | null {
    const fromMetadata = (file.metadata as { contentType?: unknown } | undefined)?.contentType;
    return file.contentType ?? (typeof fromMetadata === 'string' ? fromMetadata : null);
  }

  async upload({ key, sourcePath, contentType }: UploadInput): Promise<StoredObjectMeta> {
    // Every other provider overwrites a key; GridFS would keep both revisions and leave
    // the old one taking up space forever. Replacing means deleting first.
    await this.delete(key);

    const { size } = await fsp.stat(sourcePath);
    await pipeline(
      createReadStream(sourcePath),
      this.bucket().openUploadStream(key, { contentType, metadata: { contentType } }),
    );

    // The contract is that upload consumes its source, exactly as the local provider's
    // rename and the S3 provider's unlink do.
    await fsp.unlink(sourcePath).catch(() => undefined);

    return { key, size };
  }

  async delete(key: string): Promise<void> {
    const bucket = this.bucket();
    const files = await bucket.find({ filename: key }).toArray();
    for (const file of files) {
      // Already gone is not a failure — the same contract the other providers keep.
      await bucket.delete(file._id).catch(() => undefined);
    }
  }

  async exists(key: string): Promise<boolean> {
    return (await this.findFile(key)) !== null;
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const file = await this.findFile(key);
    if (!file) return null;
    return { key, size: file.length, contentType: GridFsStorageProvider.contentTypeOf(file) };
  }

  async getObjectStream(key: string, range?: StreamRange): Promise<StreamResult> {
    const file = await this.findFile(key);
    if (!file) throw AppError.notFound('File not found in storage');

    const totalSize = file.length;
    const contentType = GridFsStorageProvider.contentTypeOf(file) ?? 'application/octet-stream';

    if (range) {
      const start = Math.max(0, range.start);
      const end = Math.min(range.end, totalSize - 1);
      return {
        // `end` is exclusive here, where an HTTP range's is inclusive. Off by one and a
        // video seek loses its last byte on every request, which decodes as corruption
        // rather than as an error.
        stream: this.bucket().openDownloadStream(file._id, { start, end: end + 1 }),
        contentLength: end - start + 1,
        contentType,
        range: { start, end },
        totalSize,
      };
    }

    return {
      stream: this.bucket().openDownloadStream(file._id),
      contentLength: totalSize,
      contentType,
      totalSize,
    };
  }

  getUrl(): string | null {
    // Bytes live in the database; there is no address for them but this API's own.
    return null;
  }

  async getSignedUrl(): Promise<string | null> {
    // Nothing outside this process can serve them, so there is nothing to sign.
    return null;
  }

  async getUploadUrl(): Promise<string | null> {
    // No endpoint a browser could PUT to, so the client falls back to the API's multipart
    // upload — which is what makes the platform's request body cap the file size ceiling.
    return null;
  }
}
