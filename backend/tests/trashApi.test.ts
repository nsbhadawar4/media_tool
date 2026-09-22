/**
 * HTTP-level tests for the trash API.
 *
 * These drive the real Express app over a real socket against a real database, so they
 * verify the contract a client actually sees — in particular that permanent deletion is
 * unreachable without the exact confirmation phrase. That gate is the last thing standing
 * between a stray request and someone's photos, so it is tested at the boundary rather
 * than by calling the controller directly.
 *
 * Run with: npm run test:trash-api
 */
// Redirects storage to a temp dir before config/env is read — see the module for why.
import './setupTestEnv';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { env } from '../src/config/env';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { Folder } from '../src/models/Folder';
import { Media } from '../src/models/Media';
import { signSessionToken } from '../src/services/tokenService';
import * as folderService from '../src/services/folderService';
import * as mediaService from '../src/services/mediaService';
import { PERMANENT_DELETE_CONFIRMATION } from '../src/controllers/trashController';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let cookie: string;
let ownerId: string;

const storagePath = (key: string) => path.resolve(env.localStorageRoot, key);
const fileExists = (key: string) => fs.existsSync(storagePath(key));

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: { message: string };
}

async function callApi<T>(
  method: string,
  routePath: string,
  body?: unknown,
): Promise<{ status: number; payload: ApiEnvelope<T> }> {
  const response = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: (await response.json()) as ApiEnvelope<T> };
}

async function makeMedia(name: string, folderId: mongoose.Types.ObjectId | null, bytes = 512) {
  const storageKey = `photos/${folderId?.toString() ?? 'unfiled'}/${name}`;
  const full = storagePath(storageKey);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, Buffer.alloc(bytes, 1));

  return Media.create({
    ownerId,
    folderId,
    originalName: name,
    storedName: name,
    storageKey,
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: bytes,
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const admin = await User.create({
    email: 'trash-test@example.com',
    name: 'Trash Test',
    passwordHash: 'not-used-by-these-tests',
  });
  ownerId = admin._id.toString();
  cookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: ownerId,
    role: 'admin',
    email: admin.email,
    name: admin.name,
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
});

beforeEach(async () => {
  await Promise.all([Folder.deleteMany({}), Media.deleteMany({})]);
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

async function trashedFolderWithPhoto() {
  const folder = await folderService.createFolder({
    ownerId,
    name: 'Album',
    createdBy: ownerId,
  });
  const photo = await makeMedia('keepsake.jpg', folder._id);
  await folderService.softDeleteFolder(ownerId, folder._id.toString());
  return { folder, photo };
}

/* -------------------------------------------------------------------------- */
/* Deleting a selection                                                        */
/* -------------------------------------------------------------------------- */

test('DELETE /api/trash/permanent destroys every selected item and its bytes', async () => {
  const first = await makeMedia('one.jpg', null, 256);
  const second = await makeMedia('two.jpg', null, 512);
  await mediaService.softDeleteMedia(ownerId, first._id.toString());
  await mediaService.softDeleteMedia(ownerId, second._id.toString());

  const { status, payload } = await callApi<{
    succeeded: unknown[];
    failed: unknown[];
    deletedMedia: number;
    freedBytes: number;
  }>('DELETE', '/api/trash/permanent', {
    ids: [first._id.toString(), second._id.toString()],
    confirm: PERMANENT_DELETE_CONFIRMATION,
  });

  assert.equal(status, 200);
  assert.equal(payload.data!.succeeded.length, 2);
  assert.equal(payload.data!.failed.length, 0);
  assert.equal(payload.data!.deletedMedia, 2);
  assert.equal(payload.data!.freedBytes, 768);

  // The records and the bytes both, since this is the one operation that erases either.
  assert.equal(await Media.countDocuments({}), 0);
  assert.equal(fileExists(first.storageKey), false);
  assert.equal(fileExists(second.storageKey), false);
});

test('a selection is refused without the confirmation phrase', async () => {
  const photo = await makeMedia('kept.jpg', null);
  await mediaService.softDeleteMedia(ownerId, photo._id.toString());

  for (const confirm of [undefined, 'yes', 'delete permanently']) {
    const { status } = await callApi('DELETE', '/api/trash/permanent', {
      ids: [photo._id.toString()],
      confirm,
    });
    assert.equal(status, 400, `"${String(confirm)}" must not be accepted`);
  }

  assert.equal(await Media.countDocuments({}), 1, 'nothing may be destroyed by a refused request');
});

test('one stale id does not stop the rest of the selection', async () => {
  /**
   * A selection made from a list is routinely out of date by the time it is acted on —
   * something restored in another tab, a folder already swept up by deleting its parent.
   * Refusing the whole batch over one such entry would make the feature useless exactly
   * when it is most wanted, so each item is reported on its own.
   */
  const photo = await makeMedia('real.jpg', null, 128);
  await mediaService.softDeleteMedia(ownerId, photo._id.toString());
  const vanished = new mongoose.Types.ObjectId().toString();

  const { status, payload } = await callApi<{
    succeeded: Array<{ id: string }>;
    failed: Array<{ id: string; error: string }>;
    deletedMedia: number;
  }>('DELETE', '/api/trash/permanent', {
    ids: [vanished, photo._id.toString()],
    confirm: PERMANENT_DELETE_CONFIRMATION,
  });

  assert.equal(status, 200);
  assert.equal(payload.data!.succeeded.length, 1);
  assert.equal(payload.data!.succeeded[0]!.id, photo._id.toString());
  assert.equal(payload.data!.failed.length, 1);
  assert.equal(payload.data!.failed[0]!.id, vanished);
  assert.ok(payload.data!.failed[0]!.error.length > 0);
  assert.equal(await Media.countDocuments({}), 0);
});

test('a selection that is entirely stale is reported as a failed request', async () => {
  // Nothing went through, so a 200 would tell the client the deletion succeeded.
  const { status, payload } = await callApi<{ succeeded: unknown[]; failed: unknown[] }>(
    'DELETE',
    '/api/trash/permanent',
    { ids: [new mongoose.Types.ObjectId().toString()], confirm: PERMANENT_DELETE_CONFIRMATION },
  );

  assert.equal(status, 400);
  assert.equal(payload.data!.succeeded.length, 0);
  assert.equal(payload.data!.failed.length, 1);
});

test('a live item cannot be destroyed through the bulk route either', async () => {
  // The single route already refuses this; the bulk one shares its lookup, and this is
  // what pins that they cannot drift apart.
  const photo = await makeMedia('visible.jpg', null);

  const { payload } = await callApi<{ succeeded: unknown[]; failed: unknown[] }>(
    'DELETE',
    '/api/trash/permanent',
    { ids: [photo._id.toString()], confirm: PERMANENT_DELETE_CONFIRMATION },
  );

  assert.equal(payload.data!.succeeded.length, 0);
  assert.equal(await Media.countDocuments({}), 1);
  assert.equal(fileExists(photo.storageKey), true);
});

test("another account's trashed item is not deletable by id", async () => {
  const stranger = await User.create({
    email: 'stranger-bulk@example.com',
    name: 'Stranger',
    passwordHash: 'not-used-by-these-tests',
  });
  const theirs = await Media.create({
    ownerId: stranger._id,
    folderId: null,
    originalName: 'private.jpg',
    storedName: 'private.jpg',
    storageKey: 'photos/unfiled/private.jpg',
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: 64,
    isDeleted: true,
    deletedAt: new Date(),
  });

  const { payload } = await callApi<{ succeeded: unknown[]; failed: unknown[] }>(
    'DELETE',
    '/api/trash/permanent',
    { ids: [theirs._id.toString()], confirm: PERMANENT_DELETE_CONFIRMATION },
  );

  assert.equal(payload.data!.succeeded.length, 0);
  assert.equal(await Media.countDocuments({ _id: theirs._id }), 1, "another account's file must survive");
});

test('an empty or oversized selection is rejected before anything runs', async () => {
  const empty = await callApi('DELETE', '/api/trash/permanent', {
    ids: [],
    confirm: PERMANENT_DELETE_CONFIRMATION,
  });
  assert.equal(empty.status, 400);

  const tooMany = await callApi('DELETE', '/api/trash/permanent', {
    ids: Array.from({ length: 201 }, () => new mongoose.Types.ObjectId().toString()),
    confirm: PERMANENT_DELETE_CONFIRMATION,
  });
  assert.equal(tooMany.status, 400);
});

test('GET /api/trash lists deleted folders with what they contain', async () => {
  const { folder } = await trashedFolderWithPhoto();

  const { status, payload } = await callApi<{
    folders: Array<{ _id: string; name: string; contains: { media: number; bytes: number } }>;
    media: unknown[];
  }>('GET', '/api/trash');

  assert.equal(status, 200);
  assert.equal(payload.data!.folders.length, 1);
  assert.equal(payload.data!.folders[0]!._id, folder._id.toString());
  assert.equal(payload.data!.folders[0]!.contains.media, 1);
  assert.equal(payload.data!.folders[0]!.contains.bytes, 512);
  // The cascaded photo is summarised above, not listed as its own row.
  assert.equal(payload.data!.media.length, 0);
});

test('POST /api/trash/:id/restore recovers the folder and its files', async () => {
  const { folder, photo } = await trashedFolderWithPhoto();

  const { status, payload } = await callApi<{ type: string; restoredMedia: number }>(
    'POST',
    `/api/trash/${folder._id}/restore`,
  );

  assert.equal(status, 200);
  assert.equal(payload.data!.type, 'folder');
  assert.equal(payload.data!.restoredMedia, 1);
  assert.equal((await Media.findById(photo._id))!.isDeleted, false);
});

test('DELETE .../permanent is refused without the confirmation phrase', async () => {
  const { folder, photo } = await trashedFolderWithPhoto();

  const noBody = await callApi('DELETE', `/api/trash/${folder._id}/permanent`);
  assert.equal(noBody.status, 400, 'a bare permanent-delete request must be rejected');

  const wrongPhrase = await callApi('DELETE', `/api/trash/${folder._id}/permanent`, { confirm: 'yes' });
  assert.equal(wrongPhrase.status, 400);

  const truthy = await callApi('DELETE', `/api/trash/${folder._id}/permanent`, { confirm: true });
  assert.equal(truthy.status, 400, 'a truthy value must not stand in for the phrase');

  const wrongCase = await callApi('DELETE', `/api/trash/${folder._id}/permanent`, {
    confirm: 'delete permanently',
  });
  assert.equal(wrongCase.status, 400, 'confirmation is case-sensitive');

  // Nothing may have been touched by any of those attempts.
  assert.notEqual(await Folder.findById(folder._id), null);
  assert.notEqual(await Media.findById(photo._id), null);
  assert.ok(fileExists(photo.storageKey), 'the file must still be on disk');
});

test('DELETE .../permanent with the exact phrase destroys the folder and its bytes', async () => {
  const { folder, photo } = await trashedFolderWithPhoto();

  const { status, payload } = await callApi<{ deletedMedia: number; freedBytes: number }>(
    'DELETE',
    `/api/trash/${folder._id}/permanent`,
    { confirm: 'DELETE PERMANENTLY' },
  );

  assert.equal(status, 200);
  assert.equal(payload.data!.deletedMedia, 1);
  assert.equal(payload.data!.freedBytes, 512);
  assert.equal(await Folder.findById(folder._id), null);
  assert.equal(await Media.findById(photo._id), null);
  assert.equal(fileExists(photo.storageKey), false);
});

test('GET .../deletion-preview reports the blast radius without deleting anything', async () => {
  const { folder, photo } = await trashedFolderWithPhoto();

  const { status, payload } = await callApi<{ media: number; bytes: number; name: string }>(
    'GET',
    `/api/trash/${folder._id}/deletion-preview`,
  );

  assert.equal(status, 200);
  assert.equal(payload.data!.name, 'Album');
  assert.equal(payload.data!.media, 1);
  assert.equal(payload.data!.bytes, 512);
  assert.notEqual(await Media.findById(photo._id), null, 'previewing must not delete');
  assert.ok(fileExists(photo.storageKey));
});

test('a live item cannot be permanently deleted through the trash API', async () => {
  const folder = await folderService.createFolder({ ownerId, createdBy: ownerId, name: 'Live',
  });
  const photo = await makeMedia('live.jpg', folder._id);

  const { status } = await callApi('DELETE', `/api/trash/${photo._id}/permanent`, {
    confirm: 'DELETE PERMANENTLY',
  });

  assert.equal(status, 404, 'only items already in the trash are addressable here');
  assert.ok(fileExists(photo.storageKey));
});

test('invalid and unknown ids are rejected', async () => {
  const malformed = await callApi('POST', '/api/trash/not-an-id/restore');
  assert.equal(malformed.status, 400);

  const unknown = await callApi('POST', `/api/trash/${new mongoose.Types.ObjectId()}/restore`);
  assert.equal(unknown.status, 404);
});

test('the trash API requires authentication', async () => {
  const response = await fetch(`${baseUrl}/api/trash`);
  assert.equal(response.status, 401);

  const destructive = await fetch(`${baseUrl}/api/trash/${new mongoose.Types.ObjectId()}/permanent`, {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'DELETE PERMANENTLY' }),
  });
  assert.equal(destructive.status, 401);
});

test('every deletion and restoration is written to the activity log', async () => {
  const { ActivityLog } = await import('../src/models/ActivityLog');
  await ActivityLog.deleteMany({});

  const { folder } = await trashedFolderWithPhoto();
  await callApi('POST', `/api/trash/${folder._id}/restore`);
  await folderService.softDeleteFolder(ownerId, folder._id.toString());
  await callApi('DELETE', `/api/trash/${folder._id}/permanent`, { confirm: 'DELETE PERMANENTLY' });

  const actions = (await ActivityLog.find({}).sort({ createdAt: 1 })).map((entry) => entry.action);
  assert.ok(actions.includes('folder_restored'), 'restores must be logged');
  assert.ok(actions.includes('folder_permanently_deleted'), 'permanent deletions must be logged');

  const permanent = await ActivityLog.findOne({ action: 'folder_permanently_deleted' });
  assert.match(permanent!.message, /Permanently deleted folder "Album"/);
  assert.equal((permanent!.metadata as { deletedMedia: number }).deletedMedia, 1);
});
