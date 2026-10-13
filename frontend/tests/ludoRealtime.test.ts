/**
 * How online Ludo finds its realtime server and explains a failure: a missing address (the build
 * had no NEXT_PUBLIC_REALTIME_URL), a server that doesn't answer, one that refuses this site, and
 * one that is reachable — never a hard-coded production host.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { blocksOnlinePlay, connectionProblem, diagnose, probeHealth, resolveRealtimeUrl } from '../components/games/ludo/online/realtimeStatus';

const prodPage = { protocol: 'https:', hostname: 'media-tool.vercel.app' };

test('the address: the build’s variable, else port 4001 only on localhost / a LAN IP — never guessed in production', () => {
  assert.equal(resolveRealtimeUrl('https://ludo.example.com/', prodPage), 'https://ludo.example.com');
  assert.equal(resolveRealtimeUrl('  https://ludo.example.com  ', prodPage), 'https://ludo.example.com');
  assert.equal(resolveRealtimeUrl(undefined, prodPage), null, 'production without the variable: missing, not localhost');
  assert.equal(resolveRealtimeUrl('', prodPage), null);
  assert.equal(resolveRealtimeUrl(undefined, { protocol: 'http:', hostname: 'localhost' }), 'http://localhost:4001');
  assert.equal(resolveRealtimeUrl(undefined, { protocol: 'http:', hostname: '192.168.1.20' }), 'http://192.168.1.20:4001');
  assert.equal(resolveRealtimeUrl(undefined, null), null);
});

const answer = (status: number, body: unknown): typeof fetch => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;

test('the health probe: up and accepting, up but refusing this site, or nothing there', async () => {
  assert.deepEqual(await probeHealth('https://x', answer(200, { ok: true, rooms: 2, originAllowed: true })), { ok: true, originAllowed: true });
  assert.deepEqual(await probeHealth('https://x', answer(200, { ok: true, originAllowed: false })), { ok: true, originAllowed: false });
  assert.deepEqual(await probeHealth('https://x', answer(200, { ok: true })), { ok: true }, 'an older server without the field');
  assert.equal(await probeHealth('https://x', answer(502, { ok: true })), null);
  assert.equal(await probeHealth('https://x', answer(200, '<html>not the server</html>')), null);
  assert.equal(await probeHealth('https://x', (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch), null);
});

test('diagnosis and messages: each failure says what is actually wrong', () => {
  assert.equal(diagnose(null), 'unreachable');
  assert.equal(diagnose({ ok: true, originAllowed: false }), 'refused');
  assert.equal(diagnose({ ok: true, originAllowed: true }), 'disconnected');
  assert.match(connectionProblem('unavailable')!, /NEXT_PUBLIC_REALTIME_URL/);
  assert.match(connectionProblem('unreachable')!, /Can’t reach/);
  assert.match(connectionProblem('refused')!, /ALLOWED_ORIGINS/);
  assert.equal(connectionProblem('connected'), null);
  assert.equal(connectionProblem('connecting'), null);
  assert.ok(blocksOnlinePlay('unavailable') && blocksOnlinePlay('refused'));
  assert.ok(!blocksOnlinePlay('unreachable'), 'a sleeping server may wake: Create / Join stay available');
});
