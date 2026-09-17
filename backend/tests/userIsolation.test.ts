/**
 * Proves that one account cannot reach another account's folders or files.
 *
 * These go through the real HTTP stack — router, auth middleware, controllers — rather
 * than calling services directly, because that is where an isolation bug would actually
 * be exploitable. Every case uses User B's valid session together with User A's id: the
 * attack is not a forged token, it is a logged-in person editing an id in a URL.
 *
 * A leak here would expose someone's private photos, so the assertions are deliberately
 * strict: the response must be 404 (never 200, and never a 403 that confirms the id is
 * real), and the underlying document must be unchanged afterwards.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

async function makeActor(email: string, role: 'user' | 'admin' = 'user'): Promise<Actor> {
  const user = await User.create({
    email,
    name: email.split('@')[0]!,
    passwordHash: 'not-used-by-these-tests',
    role,
  });
  const id = user._id.toString();
  const token = signSessionToken({ sub: id, role, email: user.email, name: user.name });
  return { id, cookie: `${env.COOKIE_NAME}=${token}` };
}

async function makeMedia(ownerId: string, folderId: mongoose.Types.ObjectId | null, name: string) {
  const storageKey = `images/${folderId?.toString() ?? 'unfiled'}/${name}`;
  const full = path.resolve(env.localStorageRoot, storageKey);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, Buffer.alloc(64, 7));

  return Media.create({
    ownerId,
    folderId,
    originalName: name,
    storedName: name,
    storageKey,
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: 64,
  });
}

function request(url: string, actor: Actor, init: RequestInit = {}) {
  return fetch(`${baseUrl}${url}`, {
    ...init,
    headers: { cookie: actor.cookie, 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  alice = await makeActor('alice@example.com');
  bob = await makeActor('bob@example.com');

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

/** A folder and a photo owned by Alice. */
async function alicesStuff() {
  const folder = await folderService.createFolder({
    ownerId: alice.id,
    name: 'Private',
    createdBy: alice.id,
  });
  const photo = await makeMedia(alice.id, folder._id, 'secret.jpg');
  return { folder, photo };
}

test("a folder listing only ever returns the caller's own folders", async () => {
  await alicesStuff();
  await folderService.createFolder({ ownerId: bob.id, name: 'Bobs', createdBy: bob.id });

  const res = await request('/api/folders', bob);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.folders.length, 1);
  assert.equal(body.data.folders[0].name, 'Bobs');
});

test("reading another user's folder by id is a 404", async () => {
  const { folder } = await alicesStuff();

  const res = await request(`/api/folders/${folder._id}`, bob);

  assert.equal(res.status, 404, 'must not confirm the folder exists');
});

test("renaming another user's folder changes nothing", async () => {
  const { folder } = await alicesStuff();

  const res = await request(`/api/folders/${folder._id}`, bob, {
    method: 'PATCH',
    body: JSON.stringify({ name: 'Taken over' }),
  });

  assert.equal(res.status, 404);
  const after = await Folder.findById(folder._id);
  assert.equal(after!.name, 'Private', 'the folder must be untouched');
});

test("deleting another user's folder leaves it live", async () => {
  const { folder } = await alicesStuff();

  const res = await request(`/api/folders/${folder._id}`, bob, { method: 'DELETE' });

  assert.equal(res.status, 404);
  const after = await Folder.findById(folder._id);
  assert.equal(after!.isDeleted, false, 'the folder must not be trashed');
});

test("a media listing only ever returns the caller's own files", async () => {
  await alicesStuff();
  await makeMedia(bob.id, null, 'bob.jpg');

  const res = await request('/api/media', bob);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].originalName, 'bob.jpg');
});

test("reading another user's media by id is a 404", async () => {
  const { photo } = await alicesStuff();

  const res = await request(`/api/media/${photo._id}`, bob);

  assert.equal(res.status, 404);
});

test("streaming another user's file with a valid session does not serve the bytes", async () => {
  const { photo } = await alicesStuff();

  const res = await request(`/api/media/${photo._id}/raw`, bob);

  assert.equal(res.status, 404, 'a logged-in stranger must not be able to view the file');
});

test("downloading another user's file is refused", async () => {
  const { photo } = await alicesStuff();

  const res = await request(`/api/media/${photo._id}/download`, bob);

  assert.equal(res.status, 404);
});

test("deleting another user's file leaves both the record and the bytes", async () => {
  const { photo } = await alicesStuff();

  const res = await request(`/api/media/${photo._id}`, bob, { method: 'DELETE' });

  assert.equal(res.status, 404);
  const after = await Media.findById(photo._id);
  assert.equal(after!.isDeleted, false);
  assert.ok(fs.existsSync(path.resolve(env.localStorageRoot, photo.storageKey)), 'bytes must survive');
});

test("uploading into another user's folder is refused", async () => {
  const { folder } = await alicesStuff();

  const form = new FormData();
  form.append('files', new Blob([Buffer.alloc(32, 3)], { type: 'image/jpeg' }), 'intruder.jpg');
  form.append('folderId', folder._id.toString());

  const res = await fetch(`${baseUrl}/api/media/upload`, {
    method: 'POST',
    headers: { cookie: bob.cookie },
    body: form,
  });

  assert.notEqual(res.status, 201, 'the upload must not succeed');
  assert.equal(await Media.countDocuments({ folderId: folder._id, ownerId: bob.id }), 0);
});

test("moving your own file into another user's folder is refused", async () => {
  const { folder } = await alicesStuff();
  const bobsPhoto = await makeMedia(bob.id, null, 'bob.jpg');

  const res = await request(`/api/media/${bobsPhoto._id}/move`, bob, {
    method: 'POST',
    body: JSON.stringify({ folderId: folder._id.toString() }),
  });

  assert.equal(res.status, 404);
  const after = await Media.findById(bobsPhoto._id);
  assert.equal(after!.folderId, null, 'the file must stay where it was');
});

test("another user's trashed items never appear in your trash", async () => {
  const { folder } = await alicesStuff();
  await folderService.softDeleteFolder(alice.id, folder._id.toString());

  const res = await request('/api/trash', bob);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.folders.length, 0);
  assert.equal(body.data.media.length, 0);
});

test("restoring another user's trashed folder is refused", async () => {
  const { folder } = await alicesStuff();
  await folderService.softDeleteFolder(alice.id, folder._id.toString());

  const res = await request(`/api/trash/${folder._id}/restore`, bob, { method: 'POST' });

  assert.equal(res.status, 404);
  const after = await Folder.findById(folder._id);
  assert.equal(after!.isDeleted, true, 'it must stay in its owner\'s trash');
});

test("permanently deleting another user's trashed folder destroys nothing", async () => {
  const { folder, photo } = await alicesStuff();
  await folderService.softDeleteFolder(alice.id, folder._id.toString());

  const res = await request(`/api/trash/${folder._id}/permanent`, bob, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: 'DELETE PERMANENTLY' }),
  });

  assert.equal(res.status, 404);
  assert.ok(await Folder.findById(folder._id), 'the folder record must survive');
  assert.ok(fs.existsSync(path.resolve(env.localStorageRoot, photo.storageKey)), 'bytes must survive');
});

test('dashboard statistics count only your own content', async () => {
  await alicesStuff(); // 1 folder + 1 image for Alice
  await makeMedia(bob.id, null, 'bob.jpg');

  const res = await request('/api/dashboard/stats', bob);
  const body = await res.json();

  assert.equal(body.data.totalFolders, 0);
  assert.equal(body.data.totalImages, 1);
});

test('search never reaches across accounts', async () => {
  await alicesStuff();

  const res = await request('/api/search?q=secret', bob);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.folders.length, 0);
  assert.equal(body.data.media.length, 0);
});

test('a normal user cannot reach the admin endpoints', async () => {
  const listing = await request('/api/admin/users', bob);
  assert.equal(listing.status, 403, 'role must be checked, not just authentication');

  const stats = await request('/api/admin/stats', bob);
  assert.equal(stats.status, 403);
});

test('an administrator can list users but the response carries no password hash', async () => {
  const admin = await makeActor('root@example.com', 'admin');

  const res = await request('/api/admin/users', admin);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.data.length >= 3);
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes('passwordHash'), 'passwordHash must never be serialized');
  assert.ok(!serialized.includes('not-used-by-these-tests'), 'no hash value may leak');
});

test('signup always creates a plain user, even when the body asks for admin', async () => {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Escalation Attempt',
      email: 'escalate@example.com',
      password: 'longenoughpassword',
      confirmPassword: 'longenoughpassword',
      role: 'admin',
      isActive: true,
    }),
  });

  assert.equal(res.status, 201);
  const created = await User.findOne({ email: 'escalate@example.com' });
  assert.equal(created!.role, 'user', 'a public request must never mint an administrator');

  const body = await res.json();
  assert.ok(!JSON.stringify(body).includes('passwordHash'));
});
