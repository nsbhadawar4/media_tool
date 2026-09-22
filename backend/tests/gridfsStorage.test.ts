/**
 * Exercises the GridFS provider against a real MongoDB, as a `StorageService` like any
 * other.
 *
 * It exists for a deployment with nowhere else to put files — a serverless host, no
 * bucket — so everything the rest of the app assumes of a provider has to hold here too,
 * and three of those assumptions are ones GridFS does not give for free:
 *
 *   - **Writing a key twice replaces it.** GridFS versions by filename rather than
 *     overwriting, so without care the old bytes stay, the space is never reclaimed, and
 *     a re-derived thumbnail can serve the picture it was supposed to replace.
 *   - **A byte range means what HTTP means by it.** GridFS's `end` is exclusive; an
 *     HTTP Range's is inclusive. Off by one and every video seek drops its last byte,
 *     which shows up as a decode failure, not as an error anyone can trace back here.
 *   - **Upload consumes its source file.** Callers rely on it; the temp file is not
 *     cleaned up anywhere else.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { GridFsStorageProvider } from '../src/services/storage/GridFsStorageProvider';

let mongo: MongoMemoryServer;
let provider: GridFsStorageProvider;
let tempDir: string;

/** Writes `contents` to a throwaway file and returns its path, as multer would. */
async function tempFile(contents: Buffer | string): Promise<string> {
  const file = path.join(tempDir, `src-${crypto.randomBytes(6).toString('hex')}`);
  await fsp.writeFile(file, contents);
  return file;
}

async function fileExists(filePath: string): Promise<boolean> {
  return fsp
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri('media_tool_gridfs_tests'));
  provider = new GridFsStorageProvider();
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-tool-gridfs-'));
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  await fsp.rm(tempDir, { recursive: true, force: true });
});

beforeEach(async () => {
  const db = mongoose.connection.db!;
  await Promise.all([
    db.collection('media.files').deleteMany({}),
    db.collection('media.chunks').deleteMany({}),
  ]);
});

test('a stored file comes back byte-for-byte, with its size and type', async () => {
  // Larger than GridFS's 255 KB chunk size, so reassembly is actually exercised rather
  // than a single chunk being handed back whole.
  const contents = crypto.randomBytes(700 * 1024);
  const source = await tempFile(contents);

  const stored = await provider.upload({
    key: 'photos/unfiled/holiday.jpg',
    sourcePath: source,
    contentType: 'image/jpeg',
  });

  assert.equal(stored.key, 'photos/unfiled/holiday.jpg');
  assert.equal(stored.size, contents.length);

  const stat = await provider.stat('photos/unfiled/holiday.jpg');
  assert.equal(stat?.size, contents.length);
  assert.equal(stat?.contentType, 'image/jpeg');

  const { stream, totalSize, contentLength } = await provider.getObjectStream(
    'photos/unfiled/holiday.jpg',
  );
  assert.equal(totalSize, contents.length);
  assert.equal(contentLength, contents.length);
  assert.deepEqual(await buffer(stream), contents);
});

test('upload consumes its source file, as every other provider does', async () => {
  const source = await tempFile('some bytes');
  await provider.upload({ key: 'documents/unfiled/a.txt', sourcePath: source, contentType: 'text/plain' });

  assert.equal(await fileExists(source), false, 'the temp file must not be left behind');
});

test('writing a key twice replaces it rather than keeping both', async () => {
  /**
   * The case that actually happens: a video's thumbnail is re-derived under the key it
   * already has when its poster frame is replaced. GridFS's own behaviour is to keep the
   * old revision, which would both leak the space forever and leave `stat`/`stream`
   * picking between two files with the same name.
   */
  const key = 'thumbnails/clip.webp';
  await provider.upload({ key, sourcePath: await tempFile('old thumbnail'), contentType: 'image/webp' });
  await provider.upload({ key, sourcePath: await tempFile('new thumbnail'), contentType: 'image/webp' });

  const { stream } = await provider.getObjectStream(key);
  assert.equal((await buffer(stream)).toString(), 'new thumbnail');

  const revisions = await mongoose.connection.db!.collection('media.files').countDocuments({ filename: key });
  assert.equal(revisions, 1, 'the replaced revision must not survive');
});

test('a byte range returns exactly the bytes HTTP asked for, inclusive of the last', async () => {
  const contents = Buffer.from('0123456789');
  await provider.upload({
    key: 'videos/unfiled/clip.mp4',
    sourcePath: await tempFile(contents),
    contentType: 'video/mp4',
  });

  const result = await provider.getObjectStream('videos/unfiled/clip.mp4', { start: 2, end: 5 });

  // bytes 2-5 of "0123456789" is "2345" — four bytes, the last one included.
  assert.deepEqual(await buffer(result.stream), Buffer.from('2345'));
  assert.equal(result.contentLength, 4);
  assert.deepEqual(result.range, { start: 2, end: 5 });
  assert.equal(result.totalSize, contents.length);
});

test('a range running past the end is clamped, not refused', async () => {
  // What a browser sends for "the rest of the file" when it does not know the length.
  const contents = Buffer.from('0123456789');
  await provider.upload({
    key: 'videos/unfiled/tail.mp4',
    sourcePath: await tempFile(contents),
    contentType: 'video/mp4',
  });

  const result = await provider.getObjectStream('videos/unfiled/tail.mp4', { start: 7, end: 999 });

  assert.deepEqual(await buffer(result.stream), Buffer.from('789'));
  assert.deepEqual(result.range, { start: 7, end: 9 });
});

test('delete removes the bytes as well as the record, and is safe to repeat', async () => {
  const key = 'photos/unfiled/gone.jpg';
  await provider.upload({
    key,
    sourcePath: await tempFile(crypto.randomBytes(400 * 1024)),
    contentType: 'image/jpeg',
  });

  await provider.delete(key);
  assert.equal(await provider.exists(key), false);
  assert.equal(await provider.stat(key), null);

  const chunks = await mongoose.connection.db!.collection('media.chunks').countDocuments({});
  assert.equal(chunks, 0, 'orphaned chunks would grow the database with nothing referencing them');

  // Deleting something already gone is not an error — the contract every provider keeps,
  // and one the trash-emptying path depends on.
  await provider.delete(key);
});

test('a missing key reads as absent, and streaming it is a 404 rather than a crash', async () => {
  assert.equal(await provider.exists('photos/unfiled/never.jpg'), false);
  assert.equal(await provider.stat('photos/unfiled/never.jpg'), null);

  await assert.rejects(
    () => provider.getObjectStream('photos/unfiled/never.jpg'),
    (err: { statusCode?: number }) => err.statusCode === 404,
  );
});

test('it offers no direct or presigned URL, so media stays behind the API', async () => {
  // The whole library is private; every byte is served through the ownership check. A URL
  // here would be a way around it, and `getUploadUrl` returning null is also what puts the
  // client on the through-the-API upload path.
  assert.equal(provider.getUrl(), null);
  assert.equal(await provider.getSignedUrl(), null);
  assert.equal(await provider.getUploadUrl(), null);
});
