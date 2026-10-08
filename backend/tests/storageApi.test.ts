/**
 * GET /api/dashboard/storage — the signed-in user's own storage for /manage-storage. Figures come
 * from that user's files only (whatever the request says), Trash is counted separately, and there
 * is no invented storage limit.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Folder } from '../src/models/Folder';
import { Media } from '../src/models/Media';

const PASSWORD = 'Strong-Passw0rd';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let alice: { id: string; cookie: string };
let bob: { id: string; cookie: string };

async function signIn(email: string) {
  const user = await User.create({ name: email, email, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return { id: user._id.toString(), cookie: (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0] };
}

const file = (ownerId: string, fileType: 'image' | 'video' | 'document', size: number, isDeleted = false) => ({
  ownerId,
  folderId: null,
  originalName: `${fileType}-${size}`,
  storedName: `${fileType}-${size}`,
  storageKey: `x/${fileType}-${size}-${Math.random()}`,
  storageProvider: 'local',
  mimeType: fileType === 'image' ? 'image/jpeg' : fileType === 'video' ? 'video/mp4' : 'application/pdf',
  fileType,
  size,
  isDeleted,
  deletedAt: isDeleted ? new Date() : null,
});

const storage = async (cookie?: string, query = '') => {
  const res = await fetch(`${baseUrl}/api/dashboard/storage${query}`, { headers: cookie ? { cookie } : {} });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  alice = await signIn('alice@example.com');
  bob = await signIn('bob@example.com');

  await Media.insertMany([
    file(alice.id, 'image', 1000),
    file(alice.id, 'image', 2000),
    file(alice.id, 'video', 50_000),
    file(alice.id, 'document', 300),
    file(alice.id, 'image', 7000, true), // in Trash
    file(bob.id, 'video', 9_999_999),
    file(bob.id, 'document', 123),
  ]);
  await Folder.insertMany([
    { ownerId: alice.id, name: 'A1', slug: 'a1' },
    { ownerId: alice.id, name: 'A2', slug: 'a2' },
    { ownerId: alice.id, name: 'Gone', slug: 'gone', isDeleted: true },
    { ownerId: bob.id, name: 'B1', slug: 'b1' },
  ]);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('needs a session', async () => {
  assert.equal((await storage()).status, 401);
});

test("reports the user's own library, by kind of file, with Trash counted separately", async () => {
  const { status, body } = await storage(alice.cookie);
  assert.equal(status, 200);
  assert.deepEqual(body.data, {
    limitBytes: null,
    usedBytes: 1000 + 2000 + 50_000 + 300 + 7000,
    libraryBytes: 1000 + 2000 + 50_000 + 300,
    totalFiles: 4,
    totalFolders: 2,
    byType: {
      image: { count: 2, bytes: 3000 },
      video: { count: 1, bytes: 50_000 },
      document: { count: 1, bytes: 300 },
      other: { count: 0, bytes: 0 },
    },
    trash: { count: 1, bytes: 7000 },
    maxUploadBytes: env.maxFileSizeBytes,
  });
});

test("another user's files never leak in — and the request can't point elsewhere", async () => {
  const forged = await storage(alice.cookie, `?ownerId=${bob.id}&userId=${bob.id}`);
  assert.equal(forged.body.data.libraryBytes, 53_300, 'still Alice’s figures');
  const mine = await storage(bob.cookie);
  assert.deepEqual([mine.body.data.totalFiles, mine.body.data.libraryBytes, mine.body.data.totalFolders], [2, 10_000_122, 1]);
});

test('an account with nothing stored reports zeros, not missing fields', async () => {
  const empty = await signIn('empty@example.com');
  const { body } = await storage(empty.cookie);
  assert.equal(body.data.usedBytes, 0);
  assert.equal(body.data.totalFiles, 0);
  assert.deepEqual(body.data.trash, { count: 0, bytes: 0 });
});

test('the files list behind the page stays owner-scoped and sorts by size', async () => {
  const res = await fetch(`${baseUrl}/api/media?sort=size_desc&limit=10&ownerId=${bob.id}`, { headers: { cookie: alice.cookie } });
  const { data } = await res.json();
  assert.deepEqual(data.map((m: { size: number }) => m.size), [50_000, 2000, 1000, 300]);
});
