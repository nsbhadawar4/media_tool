/**
 * Guards the handful of details that decide whether Cloudflare R2 works at all.
 *
 * None of this is visible in ordinary behaviour: get it wrong and uploads still return
 * 201, the gallery still lists files, and only the thumbnails quietly stop appearing.
 * That is precisely why it is worth pinning down here — the failure mode is silent, and
 * the cause (an SDK default, three layers down) is not something anyone would think to
 * look at weeks later.
 *
 * No credentials and no network: every request is intercepted before it leaves, and the
 * signing keys below are fake. Presigning is pure computation, so it can be checked for
 * real without an account.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const FAKE_ACCOUNT_ID = 'test-account';

/**
 * Set before any application module loads. `src/config/env` reads process.env once, at
 * import time, so these have to be in place first — which is why every application
 * import in this file is dynamic. R2_PUBLIC_URL rather than R2_PUBLIC_BASE_URL is the
 * point of the alias test below.
 */
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/media_tool_tests_unused';
process.env.JWT_SECRET ??= 'test-only-secret-not-used-outside-tests';
process.env.NODE_ENV = 'test';
process.env.R2_PUBLIC_URL = 'https://cdn.example.test';

// Production's storage configuration, so the negotiation test below exercises the real
// factory rather than a hand-built provider. The credentials are fake and never used
// against anything: presigning is local computation.
process.env.STORAGE_PROVIDER = 'r2';
process.env.R2_ACCOUNT_ID = FAKE_ACCOUNT_ID;
process.env.R2_ACCESS_KEY_ID = 'AKIAEXAMPLEEXAMPLE';
process.env.R2_SECRET_ACCESS_KEY = 'not-a-real-secret-key';
process.env.R2_BUCKET_NAME = 'test-bucket';

const FAKE_CREDENTIALS = {
  accountId: FAKE_ACCOUNT_ID,
  accessKeyId: 'AKIAEXAMPLEEXAMPLE',
  secretAccessKey: 'not-a-real-secret-key',
};

/** Fails the request after recording the headers the SDK decided to send. */
function capturingHandler(sink: { headers?: Record<string, string> }) {
  return {
    handle: async (request: { headers: Record<string, string> }) => {
      sink.headers = { ...request.headers };
      const err = new Error('intercepted-by-test') as Error & { captured: boolean };
      err.captured = true;
      throw err;
    },
  };
}

test('the R2 client config disables the checksum framing R2 rejects', async () => {
  const { buildR2ClientConfig } = await import('../src/services/storage');
  const config = buildR2ClientConfig(FAKE_CREDENTIALS);

  assert.equal(config.endpoint, 'https://test-account.r2.cloudflarestorage.com');
  assert.equal(config.region, 'auto');
  assert.equal(config.requestChecksumCalculation, 'WHEN_REQUIRED');
  assert.equal(config.responseChecksumValidation, 'WHEN_REQUIRED');
});

test('a server-side put goes out length-delimited, not aws-chunked', async () => {
  const { buildR2ClientConfig } = await import('../src/services/storage');

  const source = path.join(os.tmpdir(), `media-tool-r2-test-${process.pid}.webp`);
  fs.writeFileSync(source, Buffer.alloc(2048, 3));

  const sink: { headers?: Record<string, string> } = {};
  const client = new S3Client({
    ...buildR2ClientConfig(FAKE_CREDENTIALS),
    requestHandler: capturingHandler(sink),
  });

  await assert.rejects(
    client.send(
      new PutObjectCommand({
        Bucket: 'test-bucket',
        Key: 'thumbnails/example.webp',
        Body: fs.createReadStream(source),
        ContentType: 'image/webp',
        ContentLength: 2048,
      }),
    ),
  );

  fs.unlinkSync(source);

  const headers = sink.headers ?? {};
  const names = Object.keys(headers).map((h) => h.toLowerCase());

  // The three that make R2 reject the request, and the one whose absence it rejects.
  assert.ok(!names.includes('x-amz-trailer'), `unexpected x-amz-trailer: ${names.join(', ')}`);
  assert.ok(!names.includes('x-amz-sdk-checksum-algorithm'), 'checksum algorithm header was sent');
  assert.notEqual(headers['content-encoding'], 'aws-chunked');
  assert.equal(headers['content-length'], '2048');
});

test('a presigned upload URL asks the browser for no header it cannot send', async () => {
  const { S3StorageProvider } = await import('../src/services/storage/S3StorageProvider');
  const { buildR2ClientConfig } = await import('../src/services/storage');

  const provider = new S3StorageProvider({
    name: 'r2',
    bucket: 'test-bucket',
    clientConfig: buildR2ClientConfig(FAKE_CREDENTIALS),
  });

  const url = await provider.getUploadUrl({ key: 'images/x/photo.jpg', contentType: 'image/jpeg' });
  assert.ok(url, 'R2 must be able to presign an upload');

  const parsed = new URL(url);
  assert.equal(parsed.host, 'test-bucket.test-account.r2.cloudflarestorage.com');

  /**
   * A signed header the browser does not reproduce exactly turns every upload into a
   * signature mismatch. The SDK's checksum headers are the realistic way that happens,
   * and nothing in the browser can produce them.
   */
  const signed = (parsed.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
  for (const header of signed) {
    assert.ok(!header.startsWith('x-amz-checksum'), `browser cannot send ${header}`);
    assert.notEqual(header, 'x-amz-sdk-checksum-algorithm');
  }
});

test('R2_PUBLIC_URL is honoured as an alias for R2_PUBLIC_BASE_URL', async () => {
  const { env } = await import('../src/config/env');

  // Set at the top of this file under the alias only; the app must still see it.
  assert.equal(env.R2_PUBLIC_BASE_URL, 'https://cdn.example.test');

  const { S3StorageProvider } = await import('../src/services/storage/S3StorageProvider');
  const { buildR2ClientConfig } = await import('../src/services/storage');

  const provider = new S3StorageProvider({
    name: 'r2',
    bucket: 'test-bucket',
    publicBaseUrl: env.R2_PUBLIC_BASE_URL ?? null,
    clientConfig: buildR2ClientConfig(FAKE_CREDENTIALS),
  });

  assert.equal(provider.getUrl('images/x/photo.jpg'), 'https://cdn.example.test/images/x/photo.jpg');
});

test('with R2 configured, an upload is negotiated direct-to-bucket', async () => {
  const { getStorageProvider } = await import('../src/services/storage');
  assert.equal(getStorageProvider().name, 'r2');

  const { prepareDirectUpload } = await import('../src/services/mediaService');

  /**
   * The whole reason this path exists: a Vercel Function's request body is capped well
   * below the size of an ordinary photo, so the bytes have to bypass the API entirely.
   * A null folder keeps this free of the database — ownership of "unfiled" needs no
   * lookup — so the negotiation itself is what is under test.
   */
  const target = await prepareDirectUpload({
    ownerId: '6aab87a711540c1852a355f3',
    fileName: 'holiday.JPG',
    mimeType: 'application/octet-stream', // what several browsers actually report
    size: 4 * 1024 * 1024,
    folderId: null,
  });

  assert.ok(target, 'R2 must negotiate a direct upload, not fall back to the API');
  assert.equal(new URL(target.uploadUrl).host, 'test-bucket.test-account.r2.cloudflarestorage.com');

  // The extension decides the type, not the browser's guess — otherwise a .jpg reported
  // as octet-stream would be stored, and later served, as an undisplayable blob.
  assert.equal(target.mimeType, 'image/jpeg');
  assert.equal(target.fileType, 'image');

  // The client never names its own destination; the key is derived here and carried in a
  // signed token, so it cannot be pointed at another account's file.
  assert.match(target.key, /^images\/unfiled\/\d+-[0-9a-f]{16}\.jpg$/);
});

test('a private bucket advertises no public URL, so media stays behind the API', async () => {
  const { S3StorageProvider } = await import('../src/services/storage/S3StorageProvider');
  const { buildR2ClientConfig } = await import('../src/services/storage');

  const provider = new S3StorageProvider({
    name: 'r2',
    bucket: 'test-bucket',
    clientConfig: buildR2ClientConfig(FAKE_CREDENTIALS),
  });

  assert.equal(provider.getUrl('images/x/photo.jpg'), null);
});
