import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import sharp from 'sharp';
import { env } from '../config/env';
import { getStorageProvider } from './storage';
import { logger } from '../utils/logger';

/**
 * sharp keeps recently-read files open in its operation cache, and Windows refuses to
 * unlink a file that still has an open handle — which would leave a temp file behind for
 * every video poster and every failed upload. Nothing here re-reads the same file twice,
 * so the cache has nothing to gain us and is turned off process-wide.
 */
sharp.cache(false);

/**
 * Longest edge of a generated thumbnail. Grid cards top out around 240 CSS px, so 480
 * keeps them crisp on 2x displays while staying a tiny fraction of the original's bytes.
 */
export const THUMBNAIL_MAX_EDGE = 480;
const THUMBNAIL_QUALITY = 72;
const THUMBNAIL_CONTENT_TYPE = 'image/webp';

/** Thumbnails live in their own flat prefix, keyed off the original's unique stored name. */
export function thumbnailKeyFor(storedName: string): string {
  const base = path.basename(storedName).replace(/\.[^.]+$/, '');
  return `thumbnails/${base}.webp`;
}

export interface GenerateThumbnailInput {
  /** Local path to read pixels from — the original upload, or a video poster frame. */
  sourcePath: string;
  /** Unique stored name of the *original* media, used to derive a matching thumbnail key. */
  storedName: string;
}

/**
 * Derives a small WebP thumbnail and hands it to the storage provider, returning its key.
 *
 * Returns null instead of throwing when the source can't be decoded — sharp is built
 * without HEIC/HEIF support in most environments, and a browser-supplied video poster
 * may be missing entirely. A null key is a first-class state: the client falls back to
 * the full-size image (or a type placeholder), so a thumbnail failure never costs an
 * upload.
 */
export async function generateThumbnail({ sourcePath, storedName }: GenerateThumbnailInput): Promise<string | null> {
  const key = thumbnailKeyFor(storedName);
  const tempPath = path.join(env.tmpDir, `thumb-${crypto.randomBytes(8).toString('hex')}.webp`);

  try {
    await sharp(sourcePath, { animated: false })
      .rotate() // applies EXIF orientation, so portrait phone photos aren't shown sideways
      .resize(THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: THUMBNAIL_QUALITY })
      .toFile(tempPath);
  } catch (err) {
    logger.warn(`Could not generate a thumbnail for ${storedName}`, err instanceof Error ? err.message : err);
    await fsp.unlink(tempPath).catch(() => undefined);
    return null;
  }

  try {
    // `upload` consumes (moves) the temp file, so there is nothing left to clean up on success.
    await getStorageProvider().upload({ key, sourcePath: tempPath, contentType: THUMBNAIL_CONTENT_TYPE });
    return key;
  } catch (err) {
    logger.warn(`Could not store the thumbnail for ${storedName}`, err instanceof Error ? err.message : err);
    await fsp.unlink(tempPath).catch(() => undefined);
    return null;
  }
}
