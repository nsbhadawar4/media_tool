/**
 * The admin dashboard's activity feed: installation-wide, filterable by action, and able to
 * tell a document upload from a photo or video upload even though the log entry itself does
 * not record the file type.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Media } from '../src/models/Media';
import { ActivityLog } from '../src/models/ActivityLog';
import { signSessionToken } from '../src/services/tokenService';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

async function cookieFor(email: string, role: 'user' | 'admin') {
  const user = await User.create({ email, name: email.split('@')[0]!, passwordHash: 'unused', role });
  const token = signSessionToken({ sub: user._id.toString(), role, email, name: user.name, tokenVersion: 0 });
  return { user, cookie: `${env.COOKIE_NAME}=${token}` };
}

function get(url: string) {
  return fetch(`${baseUrl}${url}`, { headers: { cookie: adminCookie } });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  adminCookie = (await cookieFor('root@example.com', 'admin')).cookie;
  const { user: alice } = await cookieFor('alice@example.com', 'user');

  const media = (name: string, fileType: 'image' | 'document') =>
    Media.create({
      ownerId: alice._id,
      originalName: name,
      storedName: name,
      storageKey: `x/${name}`,
      storageProvider: 'local',
      mimeType: fileType === 'image' ? 'image/jpeg' : 'application/pdf',
      fileType,
      size: 10,
    });
  const photo = await media('photo.jpg', 'image');
  const pdf = await media('report.pdf', 'document');

  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
  await ActivityLog.create([
    { action: 'signup', targetType: 'auth', targetId: alice._id, targetName: alice.email, message: 'signed up', createdAt: at(50) },
    { action: 'login', targetType: 'auth', message: 'logged in', performedBy: alice._id, performedByEmail: alice.email, createdAt: at(40) },
    { action: 'media_uploaded', targetType: 'media', targetId: photo._id, targetName: 'photo.jpg', message: 'up', performedBy: alice._id, performedByEmail: alice.email, createdAt: at(30) },
    { action: 'media_uploaded', targetType: 'media', targetId: pdf._id, targetName: 'report.pdf', message: 'up', performedBy: alice._id, performedByEmail: alice.email, createdAt: at(20) },
    // Points at a file that no longer exists at all.
    { action: 'media_uploaded', targetType: 'media', targetId: new mongoose.Types.ObjectId(), targetName: 'gone.png', message: 'up', createdAt: at(10) },
  ]);

  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

test('activity across every account is returned newest first', async () => {
  const res = await get('/api/admin/activity');
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.meta.total, 5);
  assert.deepEqual(
    body.data.map((e: { targetName: string | null; action: string }) => e.targetName ?? e.action),
    ['gone.png', 'report.pdf', 'photo.jpg', 'login', 'alice@example.com'],
  );
  assert.ok(!JSON.stringify(body).includes('userAgent'), 'request metadata is not exposed');
});

test('the feed can be narrowed to specific actions', async () => {
  const body = await (await get('/api/admin/activity?actions=signup,media_uploaded')).json();
  assert.equal(body.meta.total, 4);
  assert.ok(body.data.every((e: { action: string }) => e.action !== 'login'));
});

test('upload entries carry the file type of the media they point at', async () => {
  const body = await (await get('/api/admin/activity?actions=media_uploaded')).json();
  const byName = Object.fromEntries(body.data.map((e: { targetName: string; fileType: string | null }) => [e.targetName, e.fileType]));
  assert.deepEqual(byName, { 'photo.jpg': 'image', 'report.pdf': 'document', 'gone.png': null });
});

test('an unknown action is a validation error, not an empty list', async () => {
  const res = await get('/api/admin/activity?actions=signup,drop_tables');
  assert.equal(res.status, 400);
});

test('the feed is paginated', async () => {
  const body = await (await get('/api/admin/activity?limit=2&page=2')).json();
  assert.equal(body.data.length, 2);
  assert.equal(body.meta.totalPages, 3);
});
