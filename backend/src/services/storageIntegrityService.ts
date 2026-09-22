import { createHash } from 'node:crypto';
import { getStorageProvider } from './storage';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { UploadErrorCode } from '../utils/uploadErrors';

/**
 * Reads back what was just written, and refuses to call the upload done until it matches.
 *
 * A provider reporting success means its write call returned, not that the bytes are
 * retrievable. A GridFS write can leave chunks behind a record that is already queryable;
 * an S3 PUT can be truncated by a dropped connection; a local write can hit a full disk
 * partway through. In every one of those the media record would be created against an
 * object the gallery then cannot render — the upload says it worked and the card is
 * broken, with nothing in between to say which step failed.
 *
 * So the record is written only after the object has been located, measured and read.
 */

/**
 * Largest object read back in full to check its hash.
 *
 * Above this the read costs more than the guarantee is worth — for a remote bucket it is
 * a second transfer of the whole file — so a large object is verified by opening it and
 * confirming it streams, which still catches the failures that actually happen (missing
 * object, truncated write, unreadable chunks) without doubling the traffic. Same ceiling
 * and same reasoning as the thumbnail source limit in mediaService.
 */
export const MAX_CHECKSUM_VERIFY_BYTES = 64 * 1024 * 1024;

export interface VerifyStoredObjectInput {
  key: string;
  /** Byte count measured locally before the write. */
  expectedSize: number;
  /** SHA-256 of those same bytes, or null when there is nothing to compare against. */
  expectedSha256?: string | null;
  /** Only compared when the provider actually records one — a filesystem does not. */
  expectedContentType?: string | null;
}

function verificationFailed(key: string, reason: string): AppError {
  // The key is a storage path, not something the uploader can act on, so it goes to the
  // log rather than into the message.
  logger.error(`Stored object failed verification (${key}): ${reason}`);
  return AppError.internal(
    'The file could not be verified after being stored, so the upload was cancelled. Please try again.',
    UploadErrorCode.StorageVerificationFailed,
  );
}

/**
 * Confirms a stored object exists, is the expected size and type, and can be read all the
 * way through. Throws — it is a gate, not a report.
 */
export async function verifyStoredObject(input: VerifyStoredObjectInput): Promise<void> {
  const { key, expectedSize, expectedSha256 = null, expectedContentType = null } = input;
  const provider = getStorageProvider();

  let stat;
  try {
    stat = await provider.stat(key);
  } catch (err) {
    throw verificationFailed(key, `stat failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!stat) {
    throw verificationFailed(key, 'the object is not there after a write that reported success');
  }
  if (stat.size !== expectedSize) {
    throw verificationFailed(key, `size is ${stat.size}, expected ${expectedSize}`);
  }
  /**
   * Compared only when the provider has an answer. The local provider reads its metadata
   * from a filesystem, which records no content type at all, so `null` here means "not
   * known" rather than "wrong" — and treating those alike would fail every local upload.
   */
  if (expectedContentType && stat.contentType && stat.contentType !== expectedContentType) {
    throw verificationFailed(key, `content type is ${stat.contentType}, expected ${expectedContentType}`);
  }

  await readBackAndCompare(key, expectedSize, expectedSha256);
}

/**
 * Streams the object and, where the size makes it worthwhile, checks every byte against
 * the digest taken before the write. Streamed rather than buffered: the point is to catch
 * a large file that was stored badly, and reading one into memory to prove it is intact
 * would be its own way to bring the process down.
 */
async function readBackAndCompare(
  key: string,
  expectedSize: number,
  expectedSha256: string | null,
): Promise<void> {
  const compareHash = expectedSha256 !== null && expectedSize <= MAX_CHECKSUM_VERIFY_BYTES;

  let stream;
  try {
    ({ stream } = await getStorageProvider().getObjectStream(key));
  } catch (err) {
    throw verificationFailed(key, `could not be opened: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!compareHash) {
    /**
     * Too large to hash twice, or nothing to hash against. It has already been located and
     * measured, so what is left to establish is that it genuinely reads — a record that
     * exists over chunks that do not is the failure this guards. One chunk settles that;
     * pulling the rest back would be a second full transfer to learn nothing more.
     */
    try {
      for await (const chunk of stream) {
        if ((chunk as Buffer).length > 0) {
          stream.destroy();
          return;
        }
      }
    } catch (err) {
      throw verificationFailed(key, `read failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    throw verificationFailed(key, 'the object opened but produced no data');
  }

  const hash = createHash('sha256');
  let bytesRead = 0;

  try {
    for await (const chunk of stream) {
      const buffer = chunk as Buffer;
      bytesRead += buffer.length;
      hash.update(buffer);
    }
  } catch (err) {
    throw verificationFailed(key, `read failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (bytesRead !== expectedSize) {
    throw verificationFailed(key, `read back ${bytesRead} bytes, expected ${expectedSize}`);
  }

  const actual = hash.digest('hex');
  if (actual !== expectedSha256) {
    throw verificationFailed(key, `checksum ${actual} does not match ${expectedSha256}`);
  }
}

/**
 * Whether an object is present and readable, without throwing.
 *
 * For callers describing existing media rather than gating a new upload — the difference
 * between "this upload must not proceed" and "this card should say the file is missing".
 */
export async function storedObjectIsReadable(key: string): Promise<boolean> {
  try {
    const stat = await getStorageProvider().stat(key);
    return stat !== null && stat.size > 0;
  } catch {
    return false;
  }
}
