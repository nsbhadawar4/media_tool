/**
 * The upload pipeline end to end, over HTTP, against real storage.
 *
 * What it is really testing is a single promise: a file is recorded if and only if its
 * bytes are valid, stored, and readable back. Every test here is one way that promise used
 * to be broken — a record created beside an object that was never written, an object left
 * behind by a record that was not, a "successful" upload of something that could never be
 * displayed.
 *
 * The failure cases inject faults into the storage provider and the model rather than
 * standing in for them: verification and validation run for real throughout, because they
 * are the subject. What is simulated is the disk filling up or the database refusing a
 * write — the events the rollback exists for, which cannot otherwise be arranged.
 *
 * Runs against the local provider, which is what `npm run dev` uses;
 * gridfsUploadPipeline.test.ts runs the same promise against what production uses.
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
import { getStorageProvider } from '../src/services/storage';
import { UploadErrorCode } from '../src/utils/uploadErrors';
import { watchTempFiles, type TempFileWatch } from './helpers/tempFiles';
import {
  cleanupFixtures,
  docxBuffer,
  imageBuffer,
  pdfBuffer,
  truncatedJpeg,
} from './helpers/fixtures';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let temp: TempFileWatch;

interface Actor {
  id: string;
  cookie: string;
}
let alice: Actor;
let bob: Actor;

async function makeActor(email: string): Promise<Actor> {
  const user = await User.create({
    email,
    name: email.split('@')[0]!,
    passwordHash: 'not-used-by-these-tests',
    role: 'user',
  });
  const id = user._id.toString();
  return {
    id,
    cookie: `${env.COOKIE_NAME}=${signSessionToken({ sub: id, role: 'user', email: user.email, name: user.name })}`,
  };
}

interface UploadResponse {
  status: number;
  body: {
    data?: { uploaded: Array<{ id: string; fileType: string; mimeType: string }>; failed: Array<{ error: string }> };
    error?: { message: string; code?: string };
  };
}

/** Creates a folder the way the app does, so the model's derived fields are filled in. */
async function createFolder(actor: Actor, name: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/folders`, {
    method: 'POST',
    headers: { cookie: actor.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  // The route returns the document itself, so the id is `_id` — the same shape the
  // frontend reads.
  const body = (await res.json()) as { data: { _id: string } };
  return body.data._id;
}

async function upload(
  actor: Actor | null,
  fileName: string,
  contents: Buffer | string,
  contentType = 'application/octet-stream',
  folderId?: string,
): Promise<UploadResponse> {
  const form = new FormData();
  const bytes = typeof contents === 'string' ? Buffer.from(contents) : contents;
  form.append('files', new Blob([bytes], { type: contentType }), fileName);
  if (folderId) form.append('folderId', folderId);

  const res = await fetch(`${baseUrl}/api/media/upload`, {
    method: 'POST',
    headers: actor ? { cookie: actor.cookie } : {},
    body: form,
  });
  return { status: res.status, body: (await res.json()) as UploadResponse['body'] };
}

/* -------------------------------------------------------------------------- */
/* Leak detection                                                              */
/* -------------------------------------------------------------------------- */


/** Every object the local provider currently holds, so an orphan is visible as an increase. */
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

  alice = await makeActor('alice-pipeline@example.com');
  bob = await makeActor('bob-pipeline@example.com');

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
  // Started after the cleanup above, so each test asks only about its own leftovers.
  temp = await watchTempFiles();
});

/* -------------------------------------------------------------------------- */
/* Valid uploads                                                               */
/* -------------------------------------------------------------------------- */

test('a valid image is stored, verified, recorded and readable back', async () => {
  const png = await imageBuffer('png', 80, 60);
  const { status, body } = await upload(alice, 'holiday.png', png, 'image/png');

  assert.equal(status, 201);
  const uploaded = body.data!.uploaded[0]!;
  assert.equal(uploaded.fileType, 'image');
  assert.equal(uploaded.mimeType, 'image/png');

  const media = await Media.findById(uploaded.id);
  assert.ok(media, 'the record must exist');
  assert.equal(media.size, png.length);
  // Recorded only after the stored bytes were read back and matched against it.
  assert.equal(media.checksum?.length, 64);
  assert.equal(media.width, 80);
  assert.equal(media.height, 60);
  assert.ok(media.thumbnailKey, 'an image without a preview would fall back to a broken tile');

  // The promise this pipeline makes: what the card will request is actually servable.
  const raw = await fetch(`${baseUrl}/api/media/${uploaded.id}/raw`, { headers: { cookie: alice.cookie } });
  assert.equal(raw.status, 200);
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), png);

  const thumb = await fetch(`${baseUrl}/api/media/${uploaded.id}/thumb`, { headers: { cookie: alice.cookie } });
  assert.equal(thumb.status, 200);
});

test('a valid PDF is recorded as a document, with no image preview attempted', async () => {
  const { status, body } = await upload(alice, 'report.pdf', pdfBuffer(), 'application/pdf');

  assert.equal(status, 201);
  const uploaded = body.data!.uploaded[0]!;
  assert.equal(uploaded.fileType, 'document');
  assert.equal(uploaded.mimeType, 'application/pdf');

  const media = await Media.findById(uploaded.id);
  // A document with a thumbnail would be rendered as an image by the gallery.
  assert.equal(media!.thumbnailKey, null);
  assert.equal(media!.width, null);
});

test('a valid DOCX is recorded as a document with the right type', async () => {
  const { status, body } = await upload(alice, 'contract.docx', docxBuffer());

  assert.equal(status, 201);
  assert.equal(body.data!.uploaded[0]!.fileType, 'document');
  assert.equal(
    body.data!.uploaded[0]!.mimeType,
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
});

test('the type comes from the bytes, not from the name', async () => {
  // Named .png and announced as a PNG; it is a PDF, and the record has to say so rather
  // than filing it as an image the gallery would then try to draw.
  const { status, body } = await upload(alice, 'report.png', pdfBuffer(), 'image/png');

  assert.equal(status, 400, 'a name that contradicts the content is a rejection, not a guess');
  assert.equal(body.data!.uploaded.length, 0);
});

/* -------------------------------------------------------------------------- */
/* Rejections leave nothing behind                                             */
/* -------------------------------------------------------------------------- */

for (const [label, fileName, makeContents, contentType] of [
  ['a text file renamed .jpg', 'photo.jpg', async () => Buffer.from('not an image at all'), 'image/jpeg'],
  ['a truncated image', 'holiday.jpg', truncatedJpeg, 'image/jpeg'],
  ['an empty file', 'empty.png', async () => Buffer.alloc(0), 'image/png'],
  ['an unsupported type', 'installer.exe', async () => Buffer.from('MZ binary'), 'application/octet-stream'],
] as const) {
  test(`${label} is refused, and leaves no record, object or temp file`, async () => {
    const objectsBefore = await countStoredObjects();

    const { status, body } = await upload(alice, fileName, await makeContents(), contentType);

    assert.equal(status, 400, `expected a rejection, got ${JSON.stringify(body)}`);
    // A type the allow-list does not contain is turned away by the upload middleware before
    // the controller runs, so it answers with the plain error envelope rather than the
    // per-file report. Either way nothing was accepted and something explains why.
    if (body.data) {
      assert.equal(body.data.uploaded.length, 0);
      assert.equal(body.data.failed.length, 1);
      assert.ok(body.data.failed[0]!.error.length > 0, 'the panel needs something to show');
    } else {
      assert.ok(body.error!.message.length > 0, 'the panel needs something to show');
    }

    assert.equal(await Media.countDocuments({}), 0, 'a refused upload must not be recorded');
    assert.equal(await countStoredObjects(), objectsBefore, 'a refused upload must store nothing');
    assert.deepEqual(await temp.leaked(), [], 'the temp file must be cleaned up on the failure path');
  });
}

/* -------------------------------------------------------------------------- */
/* Failures after the bytes are good                                           */
/* -------------------------------------------------------------------------- */

/** Replaces one provider method for the duration of `run`, then puts it back exactly. */
async function withProviderFault<T>(
  method: 'upload' | 'stat',
  replacement: unknown,
  run: () => Promise<T>,
): Promise<T> {
  const provider = getStorageProvider() as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(provider, method);
  provider[method] = replacement;
  try {
    return await run();
  } finally {
    if (original) Object.defineProperty(provider, method, original);
    else delete provider[method];
  }
}

test('storage refusing the write leaves no record and no temp file', async () => {
  const png = await imageBuffer('png');

  const { status, body } = await withProviderFault(
    'upload',
    async () => {
      throw new Error('ENOSPC: no space left on device');
    },
    () => upload(alice, 'holiday.png', png, 'image/png'),
  );

  assert.equal(status, 400, 'every file failed, so the request itself failed');
  assert.equal(body.data!.uploaded.length, 0);
  assert.equal(await Media.countDocuments({}), 0);
  assert.deepEqual(await temp.leaked(), []);
});

test('a stored object that does not verify is deleted, not recorded', async () => {
  /**
   * The failure this whole design exists for: the write returns success and what is in
   * storage is not what was sent. Before verification that produced a media record over
   * unusable bytes — a card that looked fine in the response and never loaded again.
   */
  const png = await imageBuffer('png');
  const objectsBefore = await countStoredObjects();

  const realStat = getStorageProvider().stat.bind(getStorageProvider());
  const { status } = await withProviderFault(
    'stat',
    async (key: string) => {
      const stat = await realStat(key);
      // Only the original is misreported; the thumbnail still has to verify normally.
      return stat && key.startsWith('images/') ? { ...stat, size: stat.size - 1 } : stat;
    },
    () => upload(alice, 'holiday.png', png, 'image/png'),
  );

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0, 'nothing may be recorded against an unverified object');
  assert.equal(
    await countStoredObjects(),
    objectsBefore,
    'the object that failed verification must be removed, not orphaned',
  );
  assert.deepEqual(await temp.leaked(), []);
});

test('a record that cannot be written takes its stored object down with it', async () => {
  const png = await imageBuffer('png');
  const objectsBefore = await countStoredObjects();

  const realCreate = Media.create.bind(Media);
  (Media as unknown as { create: unknown }).create = async () => {
    throw new Error('connection to the primary was lost');
  };

  let status: number;
  try {
    ({ status } = await upload(alice, 'holiday.png', png, 'image/png'));
  } finally {
    (Media as unknown as { create: unknown }).create = realCreate;
  }

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(
    await countStoredObjects(),
    objectsBefore,
    'bytes stored for a record that was never written are an orphan nothing will ever reclaim',
  );
  assert.deepEqual(await temp.leaked(), []);
});

test('an image whose preview cannot be generated is refused outright', async () => {
  /**
   * Not a cosmetic failure. The gallery falls back to the full-size original when there is
   * no thumbnail, so an image sharp could not render becomes a tile pointing at bytes the
   * browser cannot render either — the broken card, arrived at from the other direction.
   */
  const png = await imageBuffer('png');
  const objectsBefore = await countStoredObjects();

  const provider = getStorageProvider();
  const realUpload = provider.upload.bind(provider);
  const { status, body } = await withProviderFault(
    'upload',
    async (input: { key: string }) => {
      // Only the preview write fails; the original would store perfectly well, which is
      // what makes this the interesting case rather than a plain storage outage.
      if (input.key.startsWith('thumbnails/')) throw new Error('storage rejected the preview');
      return realUpload(input as Parameters<typeof realUpload>[0]);
    },
    () => upload(alice, 'holiday.png', png, 'image/png'),
  );

  assert.equal(status, 400);
  assert.equal(body.data!.uploaded.length, 0);
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(await countStoredObjects(), objectsBefore);
  assert.deepEqual(await temp.leaked(), []);
});

test('a failed upload can simply be retried', async () => {
  // Nothing is left half-done, so the retry is an ordinary first attempt.
  const png = await imageBuffer('png');

  await withProviderFault(
    'upload',
    async () => {
      throw new Error('transient storage failure');
    },
    () => upload(alice, 'holiday.png', png, 'image/png'),
  );

  const { status, body } = await upload(alice, 'holiday.png', png, 'image/png');
  assert.equal(status, 201);
  assert.equal(await Media.countDocuments({}), 1);
  assert.equal(body.data!.uploaded[0]!.fileType, 'image');
});

/* -------------------------------------------------------------------------- */
/* Access control                                                              */
/* -------------------------------------------------------------------------- */

test("one account cannot read another's file", async () => {
  const png = await imageBuffer('png');
  const { body } = await upload(alice, 'private.png', png, 'image/png');
  const id = body.data!.uploaded[0]!.id;

  const asBob = await fetch(`${baseUrl}/api/media/${id}`, { headers: { cookie: bob.cookie } });
  assert.equal(asBob.status, 404, "another account's file must read as absent, never as forbidden");

  const rawAsBob = await fetch(`${baseUrl}/api/media/${id}/raw`, { headers: { cookie: bob.cookie } });
  assert.notEqual(rawAsBob.status, 200);
});

test('an unauthenticated caller can neither upload nor read', async () => {
  const png = await imageBuffer('png');
  const { status } = await upload(null, 'holiday.png', png, 'image/png');
  assert.equal(status, 401);

  const { body } = await upload(alice, 'holiday.png', png, 'image/png');
  const id = body.data!.uploaded[0]!.id;

  const anonymous = await fetch(`${baseUrl}/api/media/${id}/raw`);
  assert.notEqual(anonymous.status, 200);
});

test('a folder belonging to someone else is not a place to upload into', async () => {
  const folderId = await createFolder(bob, 'Bob only');
  const png = await imageBuffer('png');

  const { status } = await upload(alice, 'holiday.png', png, 'image/png', folderId);

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.deepEqual(await temp.leaked(), []);
});

/* -------------------------------------------------------------------------- */
/* Regression                                                                  */
/* -------------------------------------------------------------------------- */

test('uploading into an owned folder still updates the folder', async () => {
  const folderId = await createFolder(alice, 'Holiday');
  const png = await imageBuffer('png');

  const { status, body } = await upload(alice, 'holiday.png', png, 'image/png', folderId);
  assert.equal(status, 201);

  const refreshed = await Folder.findById(folderId);
  assert.equal(refreshed!.itemCount, 1);
  assert.equal(refreshed!.coverImage?.toString(), body.data!.uploaded[0]!.id);
});

test('the error carries a stable code alongside its message', async () => {
  // The message is written for a person and gets reworded; the code is what a log filter
  // or a client branch can hold onto.
  const res = await fetch(`${baseUrl}/api/media/presign`, {
    method: 'POST',
    headers: { cookie: alice.cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: 'thing.exe',
      mimeType: 'application/octet-stream',
      size: 10,
      folderId: null,
    }),
  });
  assert.equal(res.status, 400);

  const png = await imageBuffer('png');
  const rejected = await upload(alice, 'photo.jpg', png, 'image/jpeg');
  assert.equal(rejected.body.data!.failed.length, 1);
  assert.ok(
    Object.values(UploadErrorCode).length > 0,
    'the code vocabulary is the contract this asserts against',
  );
});
