/**
 * Reviews through the real HTTP stack: submission, the moderation state machine, who can see
 * what, and exactly what the public endpoint lets out.
 *
 * The rule that matters most: PUBLIC = approved AND isPublic, decided by the database query.
 * Every other state (pending, rejected, approved-but-unpublished, deleted) must be invisible to
 * /api/reviews/public and absent from its statistics.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { User } from '../src/models/User';
import { Review } from '../src/models/Review';
import { signSessionToken } from '../src/services/tokenService';
import { displayNameFor } from '../src/services/reviewService';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

interface Actor {
  id: string;
  email: string;
  cookie: string;
}
let alice: Actor;
let bob: Actor;
let carol: Actor;
let admin: Actor;

async function makeActor(email: string, name: string, role: 'user' | 'admin' = 'user'): Promise<Actor> {
  const user = await User.create({ email, name, passwordHash: 'not-used-by-these-tests', role });
  const id = user._id.toString();
  const token = signSessionToken({ sub: id, role, email: user.email, name: user.name });
  return { id, email, cookie: `${env.COOKIE_NAME}=${token}` };
}

async function call(method: string, url: string, actor: Actor | null, body?: unknown) {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: { ...(actor ? { cookie: actor.cookie } : {}), 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
}

let freshCount = 0;
/** A new account, so a test's writes do not share another test's rate-limit budget. */
async function fresh(name = 'Fresh User'): Promise<Actor> {
  freshCount += 1;
  return makeActor(`fresh${freshCount}@example.com`, name);
}

const good = { rating: 5, reviewText: 'Media Tool makes managing my files really simple and fast.', category: 'overall' };

async function submit(actor: Actor, body: unknown = good) {
  return call('POST', '/api/reviews', actor, body);
}

async function publicList() {
  return (await call('GET', '/api/reviews/public', null)).body.data as {
    reviews: { id: string; displayName: string; rating: number; reviewText: string }[];
    stats: { total: number; averageRating: number; distribution: Record<string, number> };
  };
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Review.init(); // build the unique index before the race test relies on it
  alice = await makeActor('alice@example.com', 'Alice Sharma');
  bob = await makeActor('bob@example.com', 'Bob');
  carol = await makeActor('carol@example.com', 'Carol Dsouza');
  admin = await makeActor('admin@example.com', 'Admin Person', 'admin');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Review.deleteMany({});
});

test('1–2. a user submits a review and it is stored pending and private', async () => {
  const res = await submit(alice);
  assert.equal(res.status, 201);
  assert.equal(res.body.data.status, 'pending');
  assert.equal(res.body.data.isPublic, false);
  const stored = await Review.findOne({ userId: alice.id });
  assert.equal(stored?.status, 'pending');
  assert.equal(stored?.isPublic, false);
  assert.equal(stored?.reviewText, good.reviewText);
});

test('the reviewer is the session, never a userId in the body', async () => {
  const res = await submit(bob, { ...good, userId: alice.id, status: 'approved', isPublic: true });
  assert.equal(res.status, 201);
  const stored = await Review.findOne({ _id: res.body.data.id });
  assert.equal(stored?.userId.toString(), bob.id, 'recorded against the caller');
  assert.equal(stored?.status, 'pending', 'status cannot be chosen by the client');
  assert.equal(stored?.isPublic, false);
  assert.equal(await Review.countDocuments({ userId: alice.id }), 0);
});

test('3. a second review is refused, including two at once', async () => {
  await submit(alice);
  const again = await submit(alice);
  assert.equal(again.status, 409);
  assert.match(again.body.message, /already submitted/);

  const race = await Promise.all([submit(carol), submit(carol), submit(carol)]);
  assert.equal(race.filter((r) => r.status === 201).length, 1, 'exactly one wins');
  assert.equal(await Review.countDocuments({ userId: carol.id }), 1);
});

test('4–5. a user sees only their own review', async () => {
  await submit(alice);
  const own = await call('GET', '/api/reviews/me', alice);
  assert.equal(own.body.data.reviewText, good.reviewText);
  const others = await call('GET', '/api/reviews/me', bob);
  assert.equal(others.body.data, null, "Bob has no review and cannot reach Alice's");
  assert.ok(!own.raw.includes('approvedBy') && !own.raw.includes('rejectionReason'), 'no internal moderation fields');
});

test('6–7. editing goes back to pending + private, even after approval', async () => {
  const { body } = await submit(alice);
  await call('PATCH', `/api/admin/reviews/${body.data.id}/approve`, admin);
  assert.equal((await publicList()).reviews.length, 1);

  const edit = await call('PUT', '/api/reviews/me', alice, { rating: 4, reviewText: 'Still great, a few small things to improve.' });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.status, 'pending');
  assert.equal(edit.body.data.isPublic, false);
  const stored = await Review.findById(body.data.id);
  assert.equal(stored?.approvedAt, null);
  assert.equal(stored?.rating, 4);
  assert.equal((await publicList()).reviews.length, 0, 'the edited text is not public until approved again');

  // A rejected review edited is also re-moderated.
  await call('PATCH', `/api/admin/reviews/${body.data.id}/reject`, admin, { reason: 'spam' });
  const again = await call('PUT', '/api/reviews/me', alice, good);
  assert.equal(again.body.data.status, 'pending');
});

test('editing with no review yet is a 404, not a silent create', async () => {
  const res = await call('PUT', '/api/reviews/me', bob, good);
  assert.equal(res.status, 404);
});

test('8–9. only administrators reach the admin endpoints', async () => {
  const { body } = await submit(alice);
  const id = body.data.id;
  assert.equal((await call('GET', '/api/admin/reviews', admin)).status, 200);
  for (const [method, url] of [
    ['GET', '/api/admin/reviews'],
    ['GET', '/api/admin/reviews/stats'],
    ['GET', `/api/admin/reviews/${id}`],
    ['PATCH', `/api/admin/reviews/${id}/approve`],
    ['PATCH', `/api/admin/reviews/${id}/reject`],
    ['PATCH', `/api/admin/reviews/${id}/publish`],
    ['PATCH', `/api/admin/reviews/${id}/unpublish`],
    ['DELETE', `/api/admin/reviews/${id}`],
  ] as const) {
    assert.equal((await call(method, url, bob, method === 'PATCH' ? {} : undefined)).status, 403, `${method} ${url} as a user`);
    assert.equal((await call(method, url, null, method === 'PATCH' ? {} : undefined)).status, 401, `${method} ${url} signed out`);
  }
  assert.equal((await Review.findById(id))?.status, 'pending', 'nothing changed');
});

test('10–11. approve publishes in one step, and the review appears publicly', async () => {
  const { body } = await submit(alice);
  const res = await call('PATCH', `/api/admin/reviews/${body.data.id}/approve`, admin);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'approved');
  assert.equal(res.body.data.isPublic, true);
  const stored = await Review.findById(body.data.id);
  assert.ok(stored?.approvedAt instanceof Date);
  assert.equal(stored?.approvedBy?.toString(), admin.id, 'the acting admin comes from the session');
  const list = await publicList();
  assert.equal(list.reviews.length, 1);
  assert.equal(list.reviews[0].displayName, 'Alice S.');
});

test('12–16. pending, rejected, unpublished and deleted reviews never reach the public list', async () => {
  const a = (await submit(alice)).body.data.id; // will be approved, unpublished, republished, deleted
  const b = (await submit(bob)).body.data.id; // stays pending
  const c = (await submit(carol, { ...good, rating: 1 })).body.data.id; // rejected
  await call('PATCH', `/api/admin/reviews/${c}/reject`, admin, { reason: 'internal note' });

  assert.equal((await publicList()).reviews.length, 0, 'pending and rejected are hidden');

  await call('PATCH', `/api/admin/reviews/${a}/approve`, admin);
  assert.deepEqual((await publicList()).reviews.map((r) => r.id), [a]);

  const un = await call('PATCH', `/api/admin/reviews/${a}/unpublish`, admin);
  assert.equal(un.body.data.status, 'approved');
  assert.equal(un.body.data.isPublic, false);
  assert.equal((await publicList()).reviews.length, 0, 'unpublished is hidden');

  await call('PATCH', `/api/admin/reviews/${a}/publish`, admin);
  assert.deepEqual((await publicList()).reviews.map((r) => r.id), [a], 'republished is back');

  // Publishing something not approved is refused, not quietly allowed.
  assert.equal((await call('PATCH', `/api/admin/reviews/${b}/publish`, admin)).status, 409);
  assert.equal((await call('PATCH', `/api/admin/reviews/${c}/publish`, admin)).status, 409);

  assert.equal((await call('DELETE', `/api/admin/reviews/${a}`, admin)).status, 200);
  assert.equal(await Review.countDocuments({ _id: a }), 0);
  assert.equal((await publicList()).reviews.length, 0, 'deleted is gone');
});

test('17. public stats count only approved + public reviews', async () => {
  const a = (await submit(alice, { ...good, rating: 5 })).body.data.id;
  const b = (await submit(bob, { ...good, rating: 3 })).body.data.id;
  await submit(carol, { ...good, rating: 1 }); // pending
  await call('PATCH', `/api/admin/reviews/${a}/approve`, admin);
  await call('PATCH', `/api/admin/reviews/${b}/approve`, admin);
  await call('PATCH', `/api/admin/reviews/${b}/unpublish`, admin);

  const { stats } = await publicList();
  assert.equal(stats.total, 1);
  assert.equal(stats.averageRating, 5);
  assert.deepEqual(stats.distribution, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });

  const adminStats = (await call('GET', '/api/admin/reviews/stats', admin)).body.data;
  assert.equal(adminStats.total, 3);
  assert.equal(adminStats.pending, 1);
  assert.equal(adminStats.approved, 2);
  assert.equal(adminStats.published, 1);
  assert.equal(adminStats.averageAll, 3);
  assert.equal(adminStats.averagePublic, 5);
});

test('18–19. the public API never contains emails, user ids or moderation details', async () => {
  const { body } = await submit(alice);
  await call('PATCH', `/api/admin/reviews/${body.data.id}/reject`, admin, { reason: 'secret moderation note' });
  await call('PATCH', `/api/admin/reviews/${body.data.id}/approve`, admin);
  const res = await call('GET', '/api/reviews/public', null);
  assert.equal(res.status, 200, 'no session needed');
  for (const forbidden of [alice.email, alice.id, admin.id, 'userId', 'approvedBy', 'rejectionReason', 'secret moderation note', 'email']) {
    assert.ok(!res.raw.includes(forbidden), `public response must not contain ${forbidden}`);
  }
  assert.deepEqual(Object.keys(res.body.data.reviews[0]).sort(), ['approvedAt', 'category', 'createdAt', 'displayName', 'id', 'rating', 'reviewText', 'verified']);
});

test('20. markup is stored and returned as plain text', async () => {
  const text = '<script>alert(1)</script> <b>bold</b> really nice app';
  const { body } = await submit(alice, { ...good, reviewText: text });
  await call('PATCH', `/api/admin/reviews/${body.data.id}/approve`, admin);
  const res = await call('GET', '/api/reviews/public', null);
  assert.equal(res.body.data.reviews[0].reviewText, text, 'kept verbatim as a JSON string, never turned into HTML');
  assert.match(res.raw, /\\u003cscript|<script/, 'serialised as data');
});

test('validation: rating, length, whitespace and category', async () => {
  const dave = await fresh('Dave Kumar');
  for (const bad of [
    { ...good, rating: 0 },
    { ...good, rating: 6 },
    { ...good, rating: 4.5 },
    { ...good, rating: '5' },
    { ...good, reviewText: '   ' },
    { ...good, reviewText: 'too short' },
    { ...good, reviewText: 'x'.repeat(501) },
    { ...good, category: 'hacking' },
    { rating: 5 },
  ]) {
    assert.equal((await submit(dave, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  }
  assert.equal(await Review.countDocuments({}), 0);
  const trimmed = await submit(dave, { rating: 4, reviewText: '   Nice and clean app, works well.   ' });
  assert.equal(trimmed.status, 201);
  assert.equal(trimmed.body.data.reviewText, 'Nice and clean app, works well.');
  assert.equal(trimmed.body.data.category, 'overall', 'category is optional');
});

test('inactive authors are not shown publicly', async () => {
  const { body } = await submit(bob);
  await call('PATCH', `/api/admin/reviews/${body.data.id}/approve`, admin);
  assert.equal((await publicList()).reviews.length, 1);
  await User.updateOne({ _id: bob.id }, { isActive: false });
  assert.equal((await publicList()).reviews.length, 0);
  await User.updateOne({ _id: bob.id }, { isActive: true });
});

test('admin list filters and search', async () => {
  const erin = await fresh('Erin Joseph');
  const frank = await fresh('Frank');
  const a = (await submit(erin, { ...good, rating: 5, category: 'media' })).body.data.id;
  await submit(frank, { rating: 2, reviewText: 'Games section could be better.', category: 'games' });
  await call('PATCH', `/api/admin/reviews/${a}/approve`, admin);
  const list = async (q: string) => (await call('GET', `/api/admin/reviews${q}`, admin)).body;
  assert.equal((await list('')).meta.total, 2);
  assert.equal((await list('?status=approved')).data.length, 1);
  assert.equal((await list('?rating=2')).data[0].user.name, 'Frank');
  assert.equal((await list('?category=media')).data.length, 1);
  assert.equal((await list(`?search=${encodeURIComponent(erin.email)}`)).data.length, 1, 'by email');
  assert.equal((await list('?search=games%20section')).data.length, 1, 'by text');
  assert.equal((await list('?search=.*')).data.length, 0, 'search is literal, not a regex');
});

test('display names never reveal more than a first name and an initial', () => {
  assert.equal(displayNameFor('Narayan Singh'), 'Narayan S.');
  assert.equal(displayNameFor('Narayan Kumar singh'), 'Narayan S.');
  assert.equal(displayNameFor('Bob'), 'Bob');
  assert.equal(displayNameFor('  '), 'Media Tool user');
});

test('review writes are rate limited per account', async () => {
  const gina = await fresh('Gina');
  assert.equal((await submit(gina)).status, 201);
  let status = 0;
  for (let i = 0; i < 25 && status !== 429; i++) status = (await call('PUT', '/api/reviews/me', gina, good)).status;
  assert.equal(status, 429, 'an edit loop is stopped');
  const other = await fresh('Henry');
  assert.equal((await submit(other)).status, 201, 'other accounts are unaffected');
});

test('admin visibility filter, sorting, default page size and the pending count', async () => {
  const [p1, p2, p3] = [await fresh('Ira Pendse'), await fresh('Jai Rao'), await fresh('Kiran Bose')];
  const a = (await submit(p1, { ...good, rating: 2 })).body.data.id; // will be public
  const b = (await submit(p2, { ...good, rating: 5 })).body.data.id; // approved then unpublished
  await submit(p3, { ...good, rating: 4 }); // stays pending

  const pending = async () => (await call('GET', '/api/admin/reviews/stats', admin)).body.data.pending;
  assert.equal(await pending(), 3);
  await call('PATCH', `/api/admin/reviews/${a}/approve`, admin);
  assert.equal(await pending(), 2, 'pending count drops after approval');
  await call('PATCH', `/api/admin/reviews/${b}/approve`, admin);
  await call('PATCH', `/api/admin/reviews/${b}/unpublish`, admin);
  assert.equal(await pending(), 1);

  const list = async (q: string) => (await call('GET', `/api/admin/reviews${q}`, admin)).body;
  assert.deepEqual((await list('?visibility=public')).data.map((r: { id: string }) => r.id), [a], 'public = approved + isPublic');
  assert.equal((await list('?visibility=private')).data.length, 2, 'private = pending + unpublished');
  assert.equal((await list('?status=approved&visibility=private')).data[0].id, b, 'approved but unpublished');
  assert.equal((await list('?status=pending&visibility=public')).data.length, 0, 'a pending review is never public');
  assert.deepEqual((await list('?sort=rating_desc')).data.map((r: { rating: number }) => r.rating), [5, 4, 2]);
  assert.deepEqual((await list('?sort=rating_asc')).data.map((r: { rating: number }) => r.rating), [2, 4, 5]);
  assert.equal((await list('?sort=oldest')).data[0].id, a);
  assert.equal((await list('')).meta.limit, 10, 'default page size is 10');
  assert.equal((await call('GET', '/api/admin/reviews?sort=random', admin)).status, 400);
  assert.equal((await call('GET', '/api/admin/reviews?visibility=everyone', admin)).status, 400);

  // Approving a rejected review changes the decision: approved + public again.
  await call('PATCH', `/api/admin/reviews/${a}/reject`, admin);
  const back = await call('PATCH', `/api/admin/reviews/${a}/approve`, admin);
  assert.equal(back.body.data.status, 'approved');
  assert.equal(back.body.data.isPublic, true);
  assert.equal(back.body.data.rejectedAt, null);
});
