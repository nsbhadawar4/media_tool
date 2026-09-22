/**
 * Exercises the adapter that runs the Express app inside a Next.js Route Handler —
 * the code path every request takes in the deployed application.
 *
 * Everything else in this suite talks to Express over a real socket, which is how it
 * runs locally and is exactly what production does *not* do. On Vercel there is no
 * socket: a Web `Request` arrives, and a Web `Response` has to come back. That
 * translation is the one piece of this deployment with no equivalent in local
 * development, so it is the piece most likely to break without anyone noticing until
 * something is live. These tests pin the parts that would fail silently or confusingly —
 * a lost Set-Cookie logs everybody out, a mishandled body breaks every write, a
 * swallowed status turns a rejection into an apparent success.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { Express } from 'express';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Folder } from '../src/models/Folder';
import { Media } from '../src/models/Media';
import { signSessionToken, signMediaToken } from '../src/services/tokenService';
import { handleWithExpress } from '../../frontend/lib/server/expressBridge';

let mongo: MongoMemoryServer;
let app: Express;
let sessionCookie: string;
let userId: string;

/** Requests go straight to the adapter — no server, no socket, exactly as on Vercel. */
function send(url: string, init: RequestInit = {}): Promise<Response> {
  return handleWithExpress(app, new Request(`https://media-tool.example${url}`, init));
}

function authed(url: string, init: RequestInit = {}): Promise<Response> {
  return send(url, {
    ...init,
    headers: { cookie: sessionCookie, ...(init.headers ?? {}) },
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp();

  const user = await User.create({
    email: 'bridge@example.com',
    name: 'Bridge',
    passwordHash: 'not-used-by-these-tests',
    role: 'user',
  });
  userId = user._id.toString();
  sessionCookie = `${env.COOKIE_NAME}=${signSessionToken({
    sub: userId,
    role: 'user',
    email: user.email,
    name: user.name,
  })}`;
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([Folder.deleteMany({}), Media.deleteMany({})]);
});

test('a GET reaches the router and comes back as JSON', async () => {
  const res = await authed('/api/folders');
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  assert.equal(body.success, true);
});

test('a JSON request body survives the crossing', async () => {
  const res = await authed('/api/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'From the bridge' }),
  });
  const body = await res.json();

  assert.equal(res.status, 201);
  assert.equal(body.data.name, 'From the bridge');

  // Written for real, not merely echoed back.
  assert.equal(await Folder.countDocuments({ ownerId: userId, name: 'From the bridge' }), 1);
});

test('the query string is preserved, not dropped at the boundary', async () => {
  await Folder.create({ ownerId: userId, name: 'Alpha', slug: 'alpha', createdBy: userId });
  await Folder.create({ ownerId: userId, name: 'Beta', slug: 'beta', createdBy: userId });

  const res = await authed('/api/folders?search=Bet');
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.folders.length, 1);
  assert.equal(body.data.folders[0].name, 'Beta');
});

test('logging in returns a Set-Cookie the browser can actually keep', async () => {
  const password = 'correct-horse-battery';
  const bcrypt = await import('bcryptjs');
  await User.create({
    email: 'login@example.com',
    name: 'Login',
    passwordHash: await bcrypt.default.hash(password, 4),
    role: 'user',
  });

  const res = await send('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'login@example.com', password }),
  });

  assert.equal(res.status, 200);

  // The whole session depends on this one header surviving the conversion from Node's
  // outgoing headers (where it is an array) to a Web `Headers`.
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'no Set-Cookie header came back');
  assert.match(setCookie, new RegExp(`^${env.COOKIE_NAME}=`));
  assert.match(setCookie, /HttpOnly/i);
});

test('an authenticated request is recognised from its cookie', async () => {
  const res = await authed('/api/auth/me');
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.data.id, userId);
});

test('an unauthenticated request is a 401, not a crash or a hang', async () => {
  const res = await send('/api/auth/me');
  const body = await res.json();

  assert.equal(res.status, 401);
  assert.equal(body.success, false);
});

test('an unknown API route is a JSON 404 from the error handler', async () => {
  const res = await authed('/api/does-not-exist');
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.success, false);
});

test('a validation failure keeps its 400 and its details', async () => {
  const res = await authed('/api/folders', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '' }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.success, false);
});

test('a multipart upload is not mistaken for a client that hung up', async () => {
  /**
   * The regression this exists for was invisible from every other angle.
   *
   * `IncomingMessage._destroy` reads `req.complete` to decide whether the request ended
   * or was cut short, and nothing sets that flag on a request assembled by hand — so at
   * teardown Node marked every request aborted and emitted `'aborted'`. Almost nothing
   * listens for it. Multer does, and treats it as the browser hanging up mid-upload: it
   * threw away the file it had just finished writing and failed the request with a 500,
   * over a body that had arrived whole.
   *
   * JSON bodies were unaffected, which is why the rest of this file passed throughout. On
   * a deployment whose storage cannot presign it broke every upload there is; on one that
   * can, it broke the poster frame a video needs for its thumbnail — quietly, because the
   * client is built to keep a video whose thumbnail failed.
   */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );

  const form = new FormData();
  form.append('files', new Blob([png], { type: 'image/png' }), 'bridge.png');

  const res = await authed('/api/media/upload', { method: 'POST', body: form });
  const body = await res.json();

  assert.equal(res.status, 201, `expected the upload to succeed, got ${JSON.stringify(body)}`);
  assert.equal(body.data.uploaded.length, 1);
  assert.equal(body.data.uploaded[0].originalName, 'bridge.png');
  assert.equal(body.data.uploaded[0].size, png.length, 'every byte of the body must survive the crossing');
});

test('a streamed file arrives whole and byte-for-byte', async () => {
  // The local storage provider cannot issue signed URLs, so this takes the streaming
  // path — the one that writes to the response in chunks rather than in one go.
  const bytes = Buffer.alloc(200_000, 9);
  const storageKey = 'images/unfiled/bridge-stream.jpg';
  const full = path.resolve(env.localStorageRoot, storageKey);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, bytes);

  const media = await Media.create({
    ownerId: userId,
    folderId: null,
    originalName: 'bridge-stream.jpg',
    storedName: 'bridge-stream.jpg',
    storageKey,
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: bytes.length,
  });

  const token = signMediaToken({ sub: userId, mediaId: media._id.toString() });
  const res = await send(`/api/media/${media._id.toString()}/raw?token=${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');

  const received = Buffer.from(await res.arrayBuffer());
  assert.equal(received.length, bytes.length, 'streamed body was truncated');
  assert.ok(received.equals(bytes), 'streamed body did not match the stored file');

  /**
   * `proxy=1` is what a caller reading the bytes itself (the text-document preview) uses
   * to be served through the API rather than redirected to the bucket, whose presigned
   * URLs carry no CORS headers. On a provider that cannot redirect anyway this must be a
   * no-op — the param travels through route validation and reaches the same stream.
   */
  const proxied = await send(`/api/media/${media._id.toString()}/raw?token=${token}&proxy=1`);

  assert.equal(proxied.status, 200);
  assert.equal(proxied.headers.get('content-type'), 'image/jpeg');
  assert.ok(Buffer.from(await proxied.arrayBuffer()).equals(bytes), 'proxied body did not match');
});

test('a Range request comes back as a 206 with only the requested bytes', async () => {
  const bytes = Buffer.alloc(1_000, 3);
  const storageKey = 'images/unfiled/bridge-range.jpg';
  const full = path.resolve(env.localStorageRoot, storageKey);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, bytes);

  const media = await Media.create({
    ownerId: userId,
    folderId: null,
    originalName: 'bridge-range.jpg',
    storedName: 'bridge-range.jpg',
    storageKey,
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: bytes.length,
  });

  const token = signMediaToken({ sub: userId, mediaId: media._id.toString() });
  const res = await send(`/api/media/${media._id.toString()}/raw?token=${token}`, {
    headers: { range: 'bytes=0-99' },
  });

  // Video seeking depends on this: the player asks for a window, not the whole file.
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), `bytes 0-99/${bytes.length}`);

  const received = Buffer.from(await res.arrayBuffer());
  assert.equal(received.length, 100);
});

test('owner isolation still holds when the request arrives through the adapter', async () => {
  const stranger = await User.create({
    email: 'stranger@example.com',
    name: 'Stranger',
    passwordHash: 'not-used-by-these-tests',
    role: 'user',
  });
  const theirFolder = await Folder.create({
    ownerId: stranger._id,
    name: 'Not yours',
    slug: 'not-yours',
    createdBy: stranger._id,
  });

  const res = await authed(`/api/folders/${theirFolder._id.toString()}`);

  // 404 rather than 403: a 403 would confirm the id names something real.
  assert.equal(res.status, 404);
});
