/**
 * The same promise as uploadPipeline.test.ts, against the provider production runs.
 *
 * A file is recorded if and only if its bytes are valid, stored and readable back — and
 * that has to hold identically whether the bytes land on a disk or in MongoDB. GridFS
 * fails differently from a filesystem: a write can leave chunks behind a file document
 * that is already queryable, so "the record exists" and "the bytes are there" come apart
 * in a way they do not locally. That is precisely why this runs separately rather than
 * being assumed to follow.
 *
 * Deliberately not a copy of the whole local suite. What is repeated here is what could
 * plausibly differ by provider: storing and serving real bytes, and leaving nothing behind
 * when something fails.
 */
import './helpers/setupGridfsEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
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
import {
  cleanupFixtures,
  imageBuffer,
  incompressibleImage,
  pdfBuffer,
  truncatedJpeg,
} from './helpers/fixtures';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

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

async function upload(actor: Actor, fileName: string, contents: Buffer, contentType: string) {
  const form = new FormData();
  form.append('files', new Blob([contents], { type: contentType }), fileName);
  const res = await fetch(`${baseUrl}/api/media/upload`, {
    method: 'POST',
    headers: { cookie: actor.cookie },
    body: form,
  });
  return {
    status: res.status,
    body: (await res.json()) as {
      data?: { uploaded: Array<{ id: string; fileType: string; mimeType: string }>; failed: unknown[] };
    },
  };
}

/** Stored objects, counted where GridFS actually keeps them. */
async function countStoredObjects(): Promise<number> {
  return mongoose.connection.db!.collection('media.files').countDocuments({});
}

/** Chunks with no file document above them — the leak a bare delete would not catch. */
async function countOrphanChunks(): Promise<number> {
  const db = mongoose.connection.db!;
  const fileIds = (await db.collection('media.files').find({}, { projection: { _id: 1 } }).toArray()).map(
    (doc) => doc._id,
  );
  return db.collection('media.chunks').countDocuments({ files_id: { $nin: fileIds } });
}

const MULTER_TEMP = /^\d{13}-[0-9a-f]{32}/;
async function countTempFiles(): Promise<number> {
  const entries = await fsp.readdir(env.tmpDir).catch(() => [] as string[]);
  return entries.filter((name) => MULTER_TEMP.test(name)).length;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  // Proves the override took: everything below would otherwise be a second, slower run of
  // the local suite while appearing to cover production.
  assert.equal(getStorageProvider().name, 'gridfs');

  alice = await makeActor('alice-gridfs@example.com');
  bob = await makeActor('bob-gridfs@example.com');

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await cleanupFixtures();
});

beforeEach(async () => {
  const db = mongoose.connection.db!;
  await Promise.all([
    Folder.deleteMany({}),
    Media.deleteMany({}),
    db.collection('media.files').deleteMany({}),
    db.collection('media.chunks').deleteMany({}),
  ]);
});

test('an image stored in MongoDB comes back byte-for-byte', async () => {
  // Larger than the 255 KB GridFS chunk size, so this covers reassembly rather than a
  // single chunk being handed straight back.
  const png = await incompressibleImage();
  assert.ok(png.length > 255 * 1024, 'the fixture must span several GridFS chunks');

  const { status, body } = await upload(alice, 'holiday.png', png, 'image/png');
  assert.equal(status, 201, JSON.stringify(body));

  const uploaded = body.data!.uploaded[0]!;
  assert.equal(uploaded.fileType, 'image');

  const media = await Media.findById(uploaded.id);
  assert.equal(media!.storageProvider, 'gridfs');
  assert.equal(media!.size, png.length);
  assert.equal(media!.checksum?.length, 64);
  assert.ok(media!.thumbnailKey);

  const raw = await fetch(`${baseUrl}/api/media/${uploaded.id}/raw`, { headers: { cookie: alice.cookie } });
  assert.equal(raw.status, 200);
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), png);

  const thumb = await fetch(`${baseUrl}/api/media/${uploaded.id}/thumb`, { headers: { cookie: alice.cookie } });
  assert.equal(thumb.status, 200);
});

test('a Range request over a file in MongoDB returns exactly the bytes asked for', async () => {
  // How a browser seeks. The provider's range arithmetic is its own code, so serving the
  // whole file correctly says nothing about this.
  const png = await imageBuffer('png', 400, 400);
  const { body } = await upload(alice, 'holiday.png', png, 'image/png');
  const id = body.data!.uploaded[0]!.id;

  const res = await fetch(`${baseUrl}/api/media/${id}/raw`, {
    headers: { cookie: alice.cookie, range: 'bytes=10-29' },
  });

  assert.equal(res.status, 206);
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), png.subarray(10, 30));
});

test('a document is stored and served without an image preview', async () => {
  const pdf = pdfBuffer();
  const { status, body } = await upload(alice, 'report.pdf', pdf, 'application/pdf');

  assert.equal(status, 201);
  assert.equal(body.data!.uploaded[0]!.fileType, 'document');

  const media = await Media.findById(body.data!.uploaded[0]!.id);
  assert.equal(media!.thumbnailKey, null);

  const raw = await fetch(`${baseUrl}/api/media/${media!._id.toString()}/raw`, {
    headers: { cookie: alice.cookie },
  });
  assert.deepEqual(Buffer.from(await raw.arrayBuffer()), pdf);
});

for (const [label, fileName, makeContents, contentType] of [
  ['a text file renamed .jpg', 'photo.jpg', async () => Buffer.from('not an image'), 'image/jpeg'],
  ['a truncated image', 'holiday.jpg', truncatedJpeg, 'image/jpeg'],
] as const) {
  test(`${label} leaves no record, no file and no chunks`, async () => {
    const { status } = await upload(alice, fileName, await makeContents(), contentType);

    assert.equal(status, 400);
    assert.equal(await Media.countDocuments({}), 0);
    assert.equal(await countStoredObjects(), 0, 'nothing may be written for a file that was refused');
    assert.equal(await countOrphanChunks(), 0);
    assert.equal(await countTempFiles(), 0);
  });
}

test('an object that fails verification is removed from GridFS, chunks and all', async () => {
  /**
   * The GridFS-specific version of the central failure: a file document can exist over
   * chunks that are wrong or incomplete. Deleting it has to take the chunks with it, or
   * the database keeps growing with data nothing references and no way to find it.
   */
  const png = await incompressibleImage(400, 400);
  const provider = getStorageProvider() as unknown as Record<string, unknown>;
  const realStat = getStorageProvider().stat.bind(getStorageProvider());

  provider.stat = async (key: string) => {
    const stat = await realStat(key);
    return stat && key.startsWith('images/') ? { ...stat, size: stat.size + 128 } : stat;
  };

  let status: number;
  try {
    ({ status } = await upload(alice, 'holiday.png', png, 'image/png'));
  } finally {
    delete provider.stat;
  }

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(await countStoredObjects(), 0, 'the unverified object must be deleted');
  assert.equal(await countOrphanChunks(), 0, 'its chunks must go with it');
  assert.equal(await countTempFiles(), 0);
});

test('a record that cannot be written takes its GridFS file down with it', async () => {
  const png = await imageBuffer('png');
  const realCreate = Media.create.bind(Media);
  (Media as unknown as { create: unknown }).create = async () => {
    throw new Error('the primary stepped down mid-write');
  };

  let status: number;
  try {
    ({ status } = await upload(alice, 'holiday.png', png, 'image/png'));
  } finally {
    (Media as unknown as { create: unknown }).create = realCreate;
  }

  assert.equal(status, 400);
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(await countStoredObjects(), 0);
  assert.equal(await countOrphanChunks(), 0);
});

test("owner isolation holds when the bytes live in the database", async () => {
  const png = await imageBuffer('png');
  const { body } = await upload(alice, 'private.png', png, 'image/png');
  const id = body.data!.uploaded[0]!.id;

  const asBob = await fetch(`${baseUrl}/api/media/${id}/raw`, { headers: { cookie: bob.cookie } });
  assert.notEqual(asBob.status, 200);

  const anonymous = await fetch(`${baseUrl}/api/media/${id}/raw`);
  assert.notEqual(anonymous.status, 200);
});
