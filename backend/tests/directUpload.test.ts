/**
 * Guards the direct-to-bucket upload flow.
 *
 * This flow exists because a serverless request body is too small to carry a photo, and
 * it works by handing the browser a presigned URL and then trusting a token to say what
 * was uploaded. That trust is the whole risk: if `commit` accepted a storage key, or a
 * token minted for somebody else, a caller could graft another account's file into their
 * own library — or register a key they never uploaded to.
 *
 * So these tests are mostly about what the endpoints REFUSE. They run against the local
 * storage provider, which cannot presign at all; that is deliberate, since every check
 * below happens before storage is ever consulted.
 */
import './setupTestEnv';

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
import { signSessionToken, signUploadToken } from '../src/services/tokenService';
import * as folderService from '../src/services/folderService';

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
    cookie: `${env.COOKIE_NAME}=${signSessionToken({
      sub: id,
      role: 'user',
      email: user.email,
      name: user.name,
    })}`,
  };
}

function post(path: string, actor: Actor, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { cookie: actor.cookie, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  alice = await makeActor('alice-upload@example.com');
  bob = await makeActor('bob-upload@example.com');

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([Folder.deleteMany({}), Media.deleteMany({})]);
});

test('a provider that cannot presign reports proxy mode rather than failing', async () => {
  const res = await post('/api/media/presign', alice, {
    fileName: 'holiday.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    folderId: null,
  });
  const body = await res.json();

  // This is what keeps one client code path working in both environments: local
  // development is told to upload through the API, not handed an error.
  assert.equal(res.status, 200);
  assert.equal(body.data.mode, 'proxy');
});

test('presign refuses a file type the app does not accept', async () => {
  const res = await post('/api/media/presign', alice, {
    fileName: 'payload.exe',
    mimeType: 'application/octet-stream',
    size: 1024,
    folderId: null,
  });

  assert.equal(res.status, 400);
});

test('presign refuses a filename containing a path', async () => {
  const res = await post('/api/media/presign', alice, {
    fileName: '../../etc/passwd.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    folderId: null,
  });

  assert.equal(res.status, 400);
});

test('presign refuses a file over the configured size limit', async () => {
  const res = await post('/api/media/presign', alice, {
    fileName: 'enormous.mp4',
    mimeType: 'video/mp4',
    size: env.maxFileSizeBytes + 1,
    folderId: null,
  });

  assert.equal(res.status, 413);
});

test("presign into another user's folder is a 404", async () => {
  const folder = await folderService.createFolder({
    ownerId: alice.id,
    name: 'Alices folder',
    createdBy: alice.id,
  });

  const res = await post('/api/media/presign', bob, {
    fileName: 'sneaky.jpg',
    mimeType: 'image/jpeg',
    size: 1024,
    folderId: folder._id.toString(),
  });

  // 404 rather than 403: a 403 would confirm that folder id names something real.
  assert.equal(res.status, 404);
});

test("committing someone else's upload token is refused", async () => {
  // Alice legitimately obtains a token; Bob presents it as his own.
  const alicesToken = signUploadToken({
    sub: alice.id,
    key: 'images/unfiled/whatever.jpg',
    storedName: 'whatever.jpg',
    originalName: 'whatever.jpg',
    mimeType: 'image/jpeg',
    fileType: 'image',
    folderId: null,
    maxSize: env.maxFileSizeBytes,
  });

  const res = await post('/api/media/commit', bob, { uploadToken: alicesToken });

  assert.equal(res.status, 403);
  assert.equal(await Media.countDocuments({}), 0);
});

test('a forged or corrupted upload token is refused', async () => {
  const res = await post('/api/media/commit', alice, {
    uploadToken: 'not.a.real.token',
  });

  assert.equal(res.status, 400);
  assert.equal(await Media.countDocuments({}), 0);
});

test('committing a key that was never uploaded records nothing', async () => {
  // A valid token for this caller, but the object is not in storage — the case where an
  // upload was presigned and then abandoned, or never actually performed.
  const token = signUploadToken({
    sub: alice.id,
    key: 'images/unfiled/never-arrived.jpg',
    storedName: 'never-arrived.jpg',
    originalName: 'never-arrived.jpg',
    mimeType: 'image/jpeg',
    fileType: 'image',
    folderId: null,
    maxSize: env.maxFileSizeBytes,
  });

  const res = await post('/api/media/commit', alice, { uploadToken: token });

  assert.equal(res.status, 400);
  assert.equal(await Media.countDocuments({}), 0);
});

test('commit requires a session of its own, token or not', async () => {
  const token = signUploadToken({
    sub: alice.id,
    key: 'images/unfiled/whatever.jpg',
    storedName: 'whatever.jpg',
    originalName: 'whatever.jpg',
    mimeType: 'image/jpeg',
    fileType: 'image',
    folderId: null,
    maxSize: env.maxFileSizeBytes,
  });

  const res = await fetch(`${baseUrl}/api/media/commit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uploadToken: token }),
  });

  assert.equal(res.status, 401);
});
