/**
 * Proves that deleting media in a bucket-backed deployment removes the right bytes —
 * and only the right bytes.
 *
 * The rest of the trash suite runs against local disk. This runs the same service
 * functions with the storage factory genuinely selecting an S3-compatible provider,
 * which is the class Cloudflare R2 uses, pointed at an in-process bucket. So the code
 * under test is the production path: `getStorageProvider()` → `S3StorageProvider` →
 * a real `S3Client` → DeleteObject over HTTP.
 *
 * `s3` rather than `r2` is the configured provider only because the R2 endpoint is
 * derived from an account id and cannot be aimed at localhost. Both names build the very
 * same `S3StorageProvider`; the R2-specific client settings are covered separately in
 * r2Storage.test.ts.
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startFakeS3, type FakeS3 } from './helpers/fakeS3';

const BUCKET = 'media-tool-test';

let bucket: FakeS3;
let mongo: MongoMemoryServer;
let tempDir: string;

/**
 * Configuration has to be in place before `src/config/env` is first imported, and the
 * endpoint is not known until the server is listening — which is why every application
 * import in this file is dynamic and happens inside a test.
 */
before(async () => {
  bucket = await startFakeS3(BUCKET);
  mongo = await MongoMemoryServer.create();
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-tool-bucket-'));

  process.env.MONGODB_URI = mongo.getUri('media_tool_bucket_tests');
  process.env.JWT_SECRET = 'test-only-secret-not-used-outside-tests';
  process.env.NODE_ENV = 'test';
  process.env.UPLOAD_DIR = tempDir;

  process.env.STORAGE_PROVIDER = 's3';
  process.env.S3_REGION = 'auto';
  process.env.S3_BUCKET_NAME = BUCKET;
  process.env.S3_ACCESS_KEY_ID = 'AKIAEXAMPLEEXAMPLE';
  process.env.S3_SECRET_ACCESS_KEY = 'not-a-real-secret-key';
  process.env.S3_ENDPOINT = bucket.endpoint;
  process.env.S3_FORCE_PATH_STYLE = 'true';

  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI);
});

after(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
  await mongo.stop();
  await bucket.close();
  await fsp.rm(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const { Media } = await import('../src/models/Media');
  await Media.deleteMany({});
  bucket.objects.clear();
});

/** Puts an object in the bucket and records it, as a completed upload would have. */
async function seedMedia(options: {
  ownerId: string;
  storageKey: string;
  thumbnailKey?: string | null;
  isDeleted?: boolean;
}) {
  const { Media } = await import('../src/models/Media');
  const { Types } = await import('mongoose');
  const { getStorageProvider } = await import('../src/services/storage');
  const provider = getStorageProvider();

  const source = path.join(tempDir, `seed-${Math.random().toString(16).slice(2)}.jpg`);
  await fsp.writeFile(source, Buffer.alloc(512, 1));
  await provider.upload({ key: options.storageKey, sourcePath: source, contentType: 'image/jpeg' });

  if (options.thumbnailKey) {
    const thumbSource = path.join(tempDir, `seed-${Math.random().toString(16).slice(2)}.webp`);
    await fsp.writeFile(thumbSource, Buffer.alloc(64, 2));
    await provider.upload({
      key: options.thumbnailKey,
      sourcePath: thumbSource,
      contentType: 'image/webp',
    });
  }

  return Media.create({
    ownerId: new Types.ObjectId(options.ownerId),
    folderId: null,
    originalName: 'photo.jpg',
    storedName: path.basename(options.storageKey),
    storageKey: options.storageKey,
    storageProvider: provider.name,
    url: provider.getUrl(options.storageKey),
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: 512,
    thumbnailKey: options.thumbnailKey ?? null,
    isDeleted: options.isDeleted ?? false,
    deletedAt: options.isDeleted ? new Date() : null,
  });
}

const ALICE = '6aab87a711540c1852a355f3';
const BOB = '6aabe9f033600c1272f910b8';

test('the storage factory really selected a bucket provider', async () => {
  const { getStorageProvider } = await import('../src/services/storage');
  const provider = getStorageProvider();

  assert.equal(provider.name, 's3');
  // A bucket provider can sign; that is what distinguishes it from local disk and what
  // the upload and serving paths branch on.
  assert.ok(await provider.getUploadUrl({ key: 'images/unfiled/x.jpg', contentType: 'image/jpeg' }));
});

test('a permanent delete removes the object and its thumbnail from the bucket', async () => {
  const { permanentlyDeleteMedia } = await import('../src/services/mediaService');
  const { Media } = await import('../src/models/Media');

  const media = await seedMedia({
    ownerId: ALICE,
    storageKey: 'images/unfiled/alice-photo.jpg',
    thumbnailKey: 'thumbnails/alice-photo.webp',
    isDeleted: true,
  });

  assert.equal(bucket.objects.has('images/unfiled/alice-photo.jpg'), true);
  assert.equal(bucket.objects.has('thumbnails/alice-photo.webp'), true);

  const { freedBytes } = await permanentlyDeleteMedia(ALICE, media._id.toString());

  assert.equal(freedBytes, 512);
  assert.equal(bucket.objects.has('images/unfiled/alice-photo.jpg'), false, 'the object survived');
  assert.equal(bucket.objects.has('thumbnails/alice-photo.webp'), false, 'the thumbnail survived');
  assert.equal(await Media.countDocuments({ _id: media._id }), 0, 'the record survived');
});

test("one account cannot delete another account's bytes", async () => {
  const { permanentlyDeleteMedia } = await import('../src/services/mediaService');
  const { Media } = await import('../src/models/Media');

  const aliceMedia = await seedMedia({
    ownerId: ALICE,
    storageKey: 'images/unfiled/alice-secret.jpg',
    isDeleted: true,
  });

  /**
   * The lookup is scoped by owner, so Bob's request finds nothing — and the important
   * part is what does *not* happen: no DeleteObject is issued for a key he named. A
   * purge that resolved the record first and checked ownership second would already
   * have destroyed the file by the time it refused.
   */
  await assert.rejects(permanentlyDeleteMedia(BOB, aliceMedia._id.toString()));

  assert.equal(bucket.objects.has('images/unfiled/alice-secret.jpg'), true, "Bob deleted Alice's file");
  assert.equal(await Media.countDocuments({ _id: aliceMedia._id }), 1, "Alice's record was removed");
});

test('moving to the trash keeps the bytes, so a restore has something to restore', async () => {
  const { softDeleteMedia, restoreMedia } = await import('../src/services/mediaService');

  const media = await seedMedia({ ownerId: ALICE, storageKey: 'images/unfiled/keepme.jpg' });

  const trashed = await softDeleteMedia(ALICE, media._id.toString());
  assert.equal(trashed.isDeleted, true);
  assert.equal(
    bucket.objects.has('images/unfiled/keepme.jpg'),
    true,
    'trashing must not touch storage — the trash is recoverable',
  );

  const restored = await restoreMedia(ALICE, media._id.toString());
  assert.equal(restored.isDeleted, false);
  assert.equal(bucket.objects.has('images/unfiled/keepme.jpg'), true);
});

test('a purge tolerates a record whose object is already gone', async () => {
  const { permanentlyDeleteMedia } = await import('../src/services/mediaService');
  const { Media } = await import('../src/models/Media');

  const media = await seedMedia({
    ownerId: ALICE,
    storageKey: 'images/unfiled/orphan.jpg',
    isDeleted: true,
  });

  // The bytes vanish behind the app's back — a half-finished earlier purge, or a hand
  // edit in the bucket. The record must still be removable, or it is stuck in the trash
  // permanently with no way for the user to clear it.
  bucket.objects.delete('images/unfiled/orphan.jpg');

  await permanentlyDeleteMedia(ALICE, media._id.toString());
  assert.equal(await Media.countDocuments({ _id: media._id }), 0);
});
