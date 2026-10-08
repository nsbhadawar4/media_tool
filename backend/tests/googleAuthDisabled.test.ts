/**
 * Without GOOGLE_CLIENT_ID, Google sign-in says plainly that it isn't set up — the button can
 * show a setup message, and the sign-in endpoint refuses instead of pretending to work.
 */
import './setupTestEnv';
import './helpers/setupNoGoogleEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test('the config reports Google as disabled and issues no nonce', async () => {
  const res = await fetch(`${baseUrl}/api/auth/google/config`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(body.data, { enabled: false, clientId: null, nonce: null });
  assert.equal(res.headers.get('set-cookie'), null);
});

test('signing in with Google answers with a clear setup error', async () => {
  const res = await fetch(`${baseUrl}/api/auth/google`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: 'x'.repeat(40) }),
  });
  const body = await res.json();
  assert.equal(res.status, 503);
  assert.match(body.error.message, /not set up/);
});
