/**
 * Exercises the storage provider that Cloudflare R2 actually runs on.
 *
 * R2 is reached through the S3-compatible API, so `S3StorageProvider` is the production
 * code path for every uploaded file — and the one thing the rest of the suite cannot
 * cover, because it needs a bucket. This stands a minimal S3 object server up on
 * localhost and points a real `S3Client` at it, so upload, delete, stat, ranged reads,
 * presigned GETs and presigned PUTs are driven end to end through the genuine AWS SDK,
 * with no credentials and nothing leaving the machine.
 *
 * What it cannot prove is how R2 itself behaves; `r2Storage.test.ts` covers the
 * R2-specific client settings that this fake server would happily accept either way.
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { startFakeS3, type FakeS3, type StoredObject } from './helpers/fakeS3';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/media_tool_tests_unused';
process.env.JWT_SECRET ??= 'test-only-secret-not-used-outside-tests';
process.env.NODE_ENV = 'test';

const BUCKET = 'test-bucket';

let bucket: FakeS3;
let objects: Map<string, StoredObject>;
let endpoint: string;
let tempDir: string;

/** A provider wired to the fake bucket, configured the way the R2 factory configures one. */
async function makeProvider(publicBaseUrl: string | null = null) {
  const { S3StorageProvider } = await import('../src/services/storage/S3StorageProvider');
  return new S3StorageProvider({
    name: 'r2',
    bucket: BUCKET,
    publicBaseUrl,
    clientConfig: {
      region: 'auto',
      endpoint,
      // A localhost server has no per-bucket subdomain to resolve.
      forcePathStyle: true,
      credentials: { accessKeyId: 'AKIAEXAMPLEEXAMPLE', secretAccessKey: 'not-a-real-secret-key' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    },
  });
}

/** Writes a throwaway file for the provider to upload, as multer would have done. */
async function stageTempFile(name: string, contents: Buffer): Promise<string> {
  const filePath = path.join(tempDir, name);
  await fsp.writeFile(filePath, contents);
  return filePath;
}

before(async () => {
  bucket = await startFakeS3(BUCKET);
  objects = bucket.objects;
  endpoint = bucket.endpoint;
  tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-tool-s3-'));
});

after(async () => {
  await bucket.close();
  await fsp.rm(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  objects.clear();
});

test('upload stores the bytes and consumes the temp file', async () => {
  const provider = await makeProvider();
  const contents = Buffer.alloc(5000, 42);
  const source = await stageTempFile('photo.jpg', contents);

  const stored = await provider.upload({
    key: 'images/folder-1/photo.jpg',
    sourcePath: source,
    contentType: 'image/jpeg',
  });

  assert.equal(stored.key, 'images/folder-1/photo.jpg');
  assert.equal(stored.size, contents.length);

  const object = objects.get('images/folder-1/photo.jpg');
  assert.ok(object, 'the object never reached the bucket');
  assert.ok(object.body.equals(contents), 'stored bytes do not match the source');
  assert.equal(object.contentType, 'image/jpeg');

  // Left behind, every upload would leak a full copy of the file into the temp directory.
  assert.equal(fs.existsSync(source), false, 'the temp file was not cleaned up');
});

test('videos and documents upload through the same path as images', async () => {
  const provider = await makeProvider();

  const cases = [
    { key: 'videos/folder-1/clip.mp4', type: 'video/mp4', bytes: Buffer.alloc(9000, 1) },
    { key: 'documents/folder-1/report.pdf', type: 'application/pdf', bytes: Buffer.alloc(3000, 2) },
    { key: 'thumbnails/clip.webp', type: 'image/webp', bytes: Buffer.alloc(800, 3) },
  ];

  for (const { key, type, bytes } of cases) {
    const source = await stageTempFile(path.basename(key), bytes);
    await provider.upload({ key, sourcePath: source, contentType: type });

    const object = objects.get(key);
    assert.ok(object, `${key} never reached the bucket`);
    assert.equal(object.contentType, type, `${key} was stored as the wrong content type`);
    assert.ok(object.body.equals(bytes), `${key} bytes do not match`);
  }
});

test('exists and stat report what is really in the bucket', async () => {
  const provider = await makeProvider();
  const source = await stageTempFile('doc.pdf', Buffer.alloc(1234, 7));
  await provider.upload({ key: 'documents/unfiled/doc.pdf', sourcePath: source, contentType: 'application/pdf' });

  assert.equal(await provider.exists('documents/unfiled/doc.pdf'), true);
  assert.equal(await provider.exists('documents/unfiled/missing.pdf'), false);

  const stat = await provider.stat('documents/unfiled/doc.pdf');
  assert.deepEqual(stat, { key: 'documents/unfiled/doc.pdf', size: 1234, contentType: 'application/pdf' });

  /**
   * Null rather than a throw, because this is what the direct-upload commit step consults
   * to decide whether the browser's PUT actually landed. A missing object has to read as
   * "nothing there" so the upload is refused, not as a crash.
   */
  assert.equal(await provider.stat('documents/unfiled/missing.pdf'), null);
});

test('objects stream back whole, and by range for video seeking', async () => {
  const provider = await makeProvider();
  const contents = Buffer.alloc(20_000, 9);
  contents.write('START', 0);
  contents.write('MIDDLE', 10_000);
  const source = await stageTempFile('clip.mp4', contents);
  await provider.upload({ key: 'videos/unfiled/clip.mp4', sourcePath: source, contentType: 'video/mp4' });

  const whole = await provider.getObjectStream('videos/unfiled/clip.mp4');
  assert.equal(whole.totalSize, 20_000);
  const received = Buffer.concat(await collect(whole.stream));
  assert.ok(received.equals(contents), 'streamed bytes do not match');

  // What a browser issues when the viewer scrubs a video; the total size has to survive
  // so the player knows how long the file is.
  const ranged = await provider.getObjectStream('videos/unfiled/clip.mp4', { start: 10_000, end: 10_005 });
  assert.equal(ranged.totalSize, 20_000);
  assert.equal(Buffer.concat(await collect(ranged.stream)).toString(), 'MIDDLE');
});

test('a missing object is a 404, not an unhandled failure', async () => {
  const provider = await makeProvider();
  await assert.rejects(provider.getObjectStream('images/unfiled/gone.jpg'), (err: unknown) => {
    assert.equal((err as { statusCode?: number }).statusCode, 404);
    return true;
  });
});

test('delete removes the object, and deleting twice is not an error', async () => {
  const provider = await makeProvider();
  const source = await stageTempFile('doomed.jpg', Buffer.alloc(100, 5));
  await provider.upload({ key: 'images/unfiled/doomed.jpg', sourcePath: source, contentType: 'image/jpeg' });
  assert.equal(objects.has('images/unfiled/doomed.jpg'), true);

  await provider.delete('images/unfiled/doomed.jpg');
  assert.equal(objects.has('images/unfiled/doomed.jpg'), false);

  /**
   * A permanent delete removes the file and then its thumbnail, and a file may legitimately
   * have no thumbnail. If a second delete threw, purging such an item would report a
   * storage failure and leave the record in the trash forever.
   */
  await provider.delete('images/unfiled/doomed.jpg');
  await provider.delete('thumbnails/never-existed.webp');
});

test('a presigned GET serves the object, renamed and retyped as asked', async () => {
  const provider = await makeProvider();
  const contents = Buffer.from('the original bytes');
  const source = await stageTempFile('note.txt', contents);
  await provider.upload({ key: 'documents/unfiled/note.txt', sourcePath: source, contentType: 'text/plain' });

  const url = await provider.getSignedUrl('documents/unfiled/note.txt', {
    downloadFilename: 'My Report.txt',
    contentType: 'text/plain',
    expiresInSeconds: 120,
  });
  assert.ok(url, 'a private bucket must still be able to sign a read');

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('X-Amz-Expires'), '120');
  assert.ok(parsed.searchParams.get('X-Amz-Signature'), 'the URL is not signed');

  // Fetching it proves the URL is well formed and addresses the right object; the fake
  // server does not verify signatures, so this is not a claim about the signature itself.
  const response = await fetch(url);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'the original bytes');
  assert.match(response.headers.get('content-disposition') ?? '', /My%20Report\.txt/);
});

test('a presigned PUT lets the browser upload without the API touching the bytes', async () => {
  const provider = await makeProvider();

  const uploadUrl = await provider.getUploadUrl({
    key: 'images/folder-9/direct.jpg',
    contentType: 'image/jpeg',
    expiresInSeconds: 600,
  });
  assert.ok(uploadUrl, 'R2/S3 must be able to presign an upload');

  // Exactly what the browser does: PUT the file to the signed URL with the content type
  // the server nominated, and no session cookie anywhere near a third-party origin.
  const body = Buffer.alloc(4096, 11);
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: new Uint8Array(body),
  });
  assert.equal(response.status, 200);

  // The commit step then measures what really arrived, rather than trusting the client.
  const stat = await provider.stat('images/folder-9/direct.jpg');
  assert.equal(stat?.size, 4096);
  assert.equal(stat?.contentType, 'image/jpeg');
});

test('a private bucket exposes no direct URL; a published one does', async () => {
  const privateProvider = await makeProvider(null);
  assert.equal(
    privateProvider.getUrl('images/unfiled/photo.jpg'),
    null,
    'a private bucket must not advertise a direct URL',
  );

  const publishedProvider = await makeProvider('https://cdn.example.test');
  assert.equal(
    publishedProvider.getUrl('images/unfiled/photo.jpg'),
    'https://cdn.example.test/images/unfiled/photo.jpg',
  );
});

/** Drains a readable into its chunks. */
async function collect(stream: NodeJS.ReadableStream): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return chunks;
}
