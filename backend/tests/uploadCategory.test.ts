/**
 * Which uploads accept which kinds of file, enforced by the server.
 *
 * The Documents page and the Media page post to the same endpoint, so "documents and
 * images are separated" cannot be a property of the page — the page stating its own
 * constraint is not a constraint, and anything that can post to one can post to the other.
 * It has to be a property of the request, checked against the bytes, which is what these
 * tests pin down.
 *
 * Note what is *not* tested by asserting a rejection message: every case below also
 * asserts that nothing was recorded and nothing was stored, because a rejection that still
 * leaves a file behind is not a rejection.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Folder } from '../src/models/Folder';
import { Media } from '../src/models/Media';
import { signSessionToken } from '../src/services/tokenService';
import { UploadErrorCode } from '../src/utils/uploadErrors';
import {
  cleanupFixtures,
  compoundFileBuffer,
  docxBuffer,
  imageBuffer,
  pdfBuffer,
  xlsxBuffer,
} from './helpers/fixtures';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let cookie: string;

interface UploadBody {
  data?: {
    uploaded: Array<{ id: string; fileType: string; mimeType: string; thumbnailUrl: string | null }>;
    failed: Array<{ error: string }>;
  };
  error?: { message: string; code?: string };
}

async function upload(
  fileName: string,
  contents: Buffer,
  contentType: string,
  uploadType?: string,
): Promise<{ status: number; body: UploadBody }> {
  const form = new FormData();
  form.append('files', new Blob([contents], { type: contentType }), fileName);
  if (uploadType !== undefined) form.append('uploadType', uploadType);

  const res = await fetch(`${baseUrl}/api/media/upload`, { method: 'POST', headers: { cookie }, body: form });
  return { status: res.status, body: (await res.json()) as UploadBody };
}

async function countStoredObjects(): Promise<number> {
  async function walk(dir: string): Promise<number> {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    let total = 0;
    for (const entry of entries) {
      total += entry.isDirectory() ? await walk(path.join(dir, entry.name)) : 1;
    }
    return total;
  }
  return walk(env.localStorageRoot);
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const user = await User.create({
    email: 'category@example.com',
    name: 'Category',
    passwordHash: 'not-used-by-these-tests',
    role: 'user',
  });
  cookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: user._id.toString(),
    role: 'user',
    email: user.email,
    name: user.name,
  })}`;

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
  await cleanupFixtures();
});

beforeEach(async () => {
  await Promise.all([Folder.deleteMany({}), Media.deleteMany({})]);
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

/* -------------------------------------------------------------------------- */
/* The document upload takes documents                                         */
/* -------------------------------------------------------------------------- */

for (const [label, fileName, makeContents, contentType] of [
  ['PDF', 'report.pdf', pdfBuffer, 'application/pdf'],
  ['DOCX', 'contract.docx', docxBuffer, 'application/octet-stream'],
  ['XLSX', 'budget.xlsx', xlsxBuffer, 'application/octet-stream'],
  ['DOC', 'letter.doc', () => compoundFileBuffer('WordDocument'), 'application/msword'],
  ['TXT', 'notes.txt', () => Buffer.from('plain notes\n'), 'text/plain'],
] as const) {
  test(`a valid ${label} is accepted by the document upload`, async () => {
    const { status, body } = await upload(fileName, makeContents(), contentType, 'document');

    assert.equal(status, 201, JSON.stringify(body));
    const uploaded = body.data!.uploaded[0]!;
    assert.equal(uploaded.fileType, 'document');
    // The card renders an icon rather than an <img>, and this is what tells it to: a
    // document that arrived with a thumbnail URL would be drawn as a picture.
    assert.equal(uploaded.thumbnailUrl, null);
  });
}

test('an image is refused by the document upload, in so many words', async () => {
  const png = await imageBuffer('png');
  const objectsBefore = await countStoredObjects();

  const { status, body } = await upload('holiday.png', png, 'image/png', 'document');

  assert.equal(status, 400);
  assert.equal(body.data!.uploaded.length, 0);
  assert.equal(
    body.data!.failed[0]!.error,
    'Images are not allowed here. Please upload documents only.',
  );
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(await countStoredObjects(), objectsBefore, 'a refused upload must store nothing');
});

test('a JPEG is refused by the document upload too', async () => {
  const jpeg = await imageBuffer('jpeg');
  const { status, body } = await upload('holiday.jpg', jpeg, 'image/jpeg', 'document');

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.match(body.data!.failed[0]!.error, /documents only/i);
});

/* -------------------------------------------------------------------------- */
/* The image and media uploads take pictures                                   */
/* -------------------------------------------------------------------------- */

for (const format of ['jpeg', 'png', 'webp'] as const) {
  test(`a valid ${format.toUpperCase()} is accepted by the image upload`, async () => {
    const contents = await imageBuffer(format, 60, 40);
    const { status, body } = await upload(`photo.${format === 'jpeg' ? 'jpg' : format}`, contents, `image/${format}`, 'image');

    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data!.uploaded[0]!.fileType, 'image');
  });
}

for (const category of ['image', 'media'] as const) {
  test(`a PDF is refused by the ${category} upload`, async () => {
    const objectsBefore = await countStoredObjects();
    const { status, body } = await upload('report.pdf', pdfBuffer(), 'application/pdf', category);

    assert.equal(status, 400);
    assert.equal(
      body.data!.failed[0]!.error,
      'Documents are not allowed here. Please upload an image.',
    );
    assert.equal(await Media.countDocuments({}), 0);
    assert.equal(await countStoredObjects(), objectsBefore);
  });

  test(`a DOCX is refused by the ${category} upload`, async () => {
    const { status } = await upload('contract.docx', docxBuffer(), 'application/octet-stream', category);

    assert.equal(status, 400);
    assert.equal(await Media.countDocuments({}), 0);
  });
}

test('the media upload still takes photos, so pinning it did not remove anything', async () => {
  // `media` exists precisely so the Media page can keep holding photos *and* videos; a
  // category that only allowed one would have quietly dropped the other.
  const png = await imageBuffer('png');
  const { status, body } = await upload('holiday.png', png, 'image/png', 'media');

  assert.equal(status, 201);
  assert.equal(body.data!.uploaded[0]!.fileType, 'image');
});

/* -------------------------------------------------------------------------- */
/* Renaming does not move a file between categories                            */
/* -------------------------------------------------------------------------- */

test('an image renamed .pdf is refused by the document upload as well', async () => {
  /**
   * The category is checked against the *validated* type, so this is caught either way —
   * but it matters which way. Extension and content disagree, so it is refused as a
   * mismatch before the category is ever consulted, and the message says so.
   */
  const png = await imageBuffer('png');
  const { status, body } = await upload('report.pdf', png, 'application/pdf', 'document');

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.match(body.data!.failed[0]!.error, /not a valid PDF/i);
});

test('a file that only begins like a PDF is refused', async () => {
  // Five bytes of header is not a document. This passes a signature check and opens in
  // nothing, which is precisely the file that used to become an unreadable card.
  const objectsBefore = await countStoredObjects();
  const { status, body } = await upload(
    'report.pdf',
    Buffer.from('%PDF-1.4 and then nothing that follows the format'),
    'application/pdf',
    'document',
  );

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(body.data!.failed[0]!.error, /PDF/i);
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(await countStoredObjects(), objectsBefore);
});

test('a PDF truncated partway through is refused', async () => {
  // What a download cut off halfway leaves behind: a perfect header, a real body, and no
  // trailer. Every viewer refuses it; so does this.
  const whole = pdfBuffer();
  const truncated = whole.subarray(0, Math.floor(whole.length * 0.6));

  const { status, body } = await upload('report.pdf', truncated, 'application/pdf', 'document');

  assert.equal(status, 400, JSON.stringify(body));
  assert.match(body.data!.failed[0]!.error, /incomplete|truncated/i);
  assert.equal(await Media.countDocuments({}), 0);
});

/* -------------------------------------------------------------------------- */
/* The category itself                                                         */
/* -------------------------------------------------------------------------- */

test('an upload with no category still takes anything, as the dashboard always has', async () => {
  const png = await imageBuffer('png');
  const image = await upload('holiday.png', png, 'image/png');
  assert.equal(image.status, 201);

  const document = await upload('report.pdf', pdfBuffer(), 'application/pdf');
  assert.equal(document.status, 201);
});

test('an unrecognised category is refused rather than ignored', async () => {
  /**
   * Ignoring it would turn a typo into a silently unconstrained upload — the strictest
   * caller in the app quietly becoming the loosest, which is the worst possible direction
   * for a mistake like this to fail in.
   */
  const png = await imageBuffer('png');
  const { status } = await upload('holiday.png', png, 'image/png', 'documnets');

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
});

test('presign refuses the wrong category before any bytes are sent', async () => {
  // The direct-to-bucket path asks first. Refusing here means a file that does not belong
  // never gets an address to be uploaded to.
  const res = await fetch(`${baseUrl}/api/media/presign`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: 'holiday.png',
      mimeType: 'image/png',
      size: 1024,
      folderId: null,
      uploadType: 'document',
    }),
  });

  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { message: string; code?: string } };
  assert.equal(body.error.message, 'Images are not allowed here. Please upload documents only.');
  assert.equal(body.error.code, UploadErrorCode.WrongUploadCategory);
});
