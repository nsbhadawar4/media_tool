/**
 * Kid Games progress through the real HTTP stack: it is private to each account, it only ever
 * gets better (a replay cannot lower a best score), and XP cannot be farmed by replaying the
 * same result. The identity always comes from the session cookie — a userId in the body is
 * ignored — so these use two real accounts and try to cross between them.
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
import { KidGameProfile, KidGameRecord } from '../src/models/KidGameProgress';
import { signSessionToken } from '../src/services/tokenService';
import { applyResult, emptyProfile, parseGameId, previousDay, resolveDay, starsFor } from '../src/kidGames/rules';

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
  const user = await User.create({ email, name: email.split('@')[0]!, passwordHash: 'not-used-by-these-tests', role: 'user' });
  const id = user._id.toString();
  const token = signSessionToken({ sub: id, role: 'user', email: user.email, name: user.name });
  return { id, cookie: `${env.COOKIE_NAME}=${token}` };
}

function request(url: string, actor: Actor | null, init: RequestInit = {}) {
  return fetch(`${baseUrl}${url}`, {
    ...init,
    headers: { ...(actor ? { cookie: actor.cookie } : {}), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
}

const today = () => new Date().toISOString().slice(0, 10);

async function play(actor: Actor, gameId: string, correct: number, total = 10, extra: Record<string, unknown> = {}) {
  const res = await request('/api/kid-games/results', actor, {
    method: 'POST',
    body: JSON.stringify({ gameId, correct, total, bestStreak: correct, seconds: 60, day: today(), ...extra }),
  });
  return { status: res.status, body: await res.json() };
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
});

beforeEach(async () => {
  await Promise.all([KidGameRecord.deleteMany({}), KidGameProfile.deleteMany({})]);
});

test('progress needs a session', async () => {
  const res = await request('/api/kid-games/progress', null);
  assert.equal(res.status, 401);
  const post = await request('/api/kid-games/results', null, { method: 'POST', body: JSON.stringify({ gameId: 'c1-math-number-runner', correct: 5, total: 10 }) });
  assert.equal(post.status, 401);
});

test("one account never sees or changes another's progress, even when it names the other's id", async () => {
  const mine = await play(alice, 'c1-hindi-varn-pehchan', 9);
  assert.equal(mine.status, 201);

  // Bob names Alice in the body; the server must ignore it and record against Bob.
  const forged = await play(bob, 'c1-hindi-varn-pehchan', 2, 10, { userId: alice.id });
  assert.equal(forged.status, 201);

  const bobs = await (await request('/api/kid-games/progress', bob)).json();
  const alices = await (await request('/api/kid-games/progress', alice)).json();
  assert.equal(alices.data.games.length, 1);
  assert.equal(alices.data.games[0].bestScore, 90, "Alice's best is untouched by Bob's attempt");
  assert.equal(bobs.data.games[0].bestScore, 20);
  assert.equal(await KidGameRecord.countDocuments({ userId: alice.id }), 1);
  assert.ok(!JSON.stringify(bobs).includes(alice.id), "Bob's response never contains Alice's id");
});

test('a best score only ever goes up; the latest score is still recorded', async () => {
  await play(alice, 'c2-english-spell-it', 9);
  const worse = await play(alice, 'c2-english-spell-it', 4);
  assert.equal(worse.body.data.game.bestScore, 90);
  assert.equal(worse.body.data.game.latestScore, 40);
  assert.equal(worse.body.data.game.attempts, 2);
  assert.equal(worse.body.data.game.stars, 3, 'stars keep the best result');
  assert.equal(worse.body.data.result.isNewBest, false);
});

test('XP is paid once per achievement: replaying the same result earns nothing', async () => {
  const gameId = 'c1-hindi-varn-pehchan'; // easy: 50 XP
  const first = await play(alice, gameId, 8);
  assert.equal(first.body.data.result.xpGained, 40);

  const same = await play(alice, gameId, 8);
  assert.equal(same.body.data.result.xpGained, 0);

  const perfect = await play(alice, gameId, 10);
  // +10 for the better score, +25 perfect, +25 new personal best
  assert.equal(perfect.body.data.result.xpGained, 60);
  assert.deepEqual(perfect.body.data.result.xpLines.map((l: { reason: string }) => l.reason).sort(), ['new-best', 'perfect', 'score']);

  const again = await play(alice, gameId, 10);
  assert.equal(again.body.data.result.xpGained, 0, 'no second perfect bonus');

  const progress = await (await request('/api/kid-games/progress', alice)).json();
  assert.equal(progress.data.profile.totalXp, 100);
});

test('the 3-game streak bonus is paid when three passed games each earn something new', async () => {
  await play(alice, 'c3-math-number-runner', 6);
  await play(alice, 'c3-math-counting-challenge', 6);
  const third = await play(alice, 'c3-math-addition-adventure', 6);
  assert.equal(third.body.data.result.gameStreak, 3);
  assert.ok(third.body.data.result.xpLines.some((l: { reason: string }) => l.reason === 'streak-3'));

  const failed = await play(alice, 'c3-math-subtraction-challenge', 2);
  assert.equal(failed.body.data.result.gameStreak, 0, 'a game below one star resets the run');
});

test('the daily streak counts days, not games', async () => {
  const yesterday = previousDay(today());
  const a = await play(alice, 'c1-math-number-runner', 7, 10, { day: yesterday });
  assert.equal(a.body.data.result.dailyStreak, 1);
  const b = await play(alice, 'c1-math-counting-challenge', 7, 10, { day: today() });
  assert.equal(b.body.data.result.dailyStreak, 2);
  const c = await play(alice, 'c1-math-addition-adventure', 7, 10, { day: today() });
  assert.equal(c.body.data.result.dailyStreak, 2, 'a second game the same day does not add to it');
});

test('achievements unlock and are kept', async () => {
  const first = await play(alice, 'c1-english-word-match', 6);
  assert.deepEqual(first.body.data.result.unlocked, ['first-game']);
  const second = await play(alice, 'c1-english-spell-it', 6);
  assert.deepEqual(second.body.data.result.unlocked, []);
  const progress = await (await request('/api/kid-games/progress', alice)).json();
  assert.deepEqual(progress.data.profile.achievements.map((a: { id: string }) => a.id), ['first-game']);
});

test('nonsense is refused', async () => {
  assert.equal((await play(alice, 'c9-math-number-runner', 5)).status, 400);
  assert.equal((await play(alice, 'c1-math-not-a-game', 5)).status, 400);
  assert.equal((await play(alice, 'c1-math-number-runner', 11, 10)).status, 400, 'more right than asked');
  assert.equal(await KidGameRecord.countDocuments({}), 0);
});

test('the sound setting is saved per account', async () => {
  const res = await request('/api/kid-games/settings', alice, { method: 'PUT', body: JSON.stringify({ sound: true }) });
  assert.equal(res.status, 200);
  const alices = await (await request('/api/kid-games/progress', alice)).json();
  const bobs = await (await request('/api/kid-games/progress', bob)).json();
  assert.equal(alices.data.profile.settings.sound, true);
  assert.equal(bobs.data.profile.settings.sound, false);
});

test('rules: stars, difficulty and dates', () => {
  assert.deepEqual([100, 90, 89, 70, 69, 50, 49, 0].map(starsFor), [3, 3, 2, 2, 1, 1, 0, 0]);
  assert.equal(parseGameId('c1-hindi-varn-pehchan')?.difficulty, 'easy');
  assert.equal(parseGameId('c5-math-pattern-puzzle')?.difficulty, 'hard');
  assert.equal(parseGameId('c5-math-pattern-puzzle')?.baseXp, 100);
  assert.equal(previousDay('2026-03-01'), '2026-02-28');
  const now = new Date('2026-10-06T12:00:00Z');
  assert.equal(resolveDay('2026-10-07', now), '2026-10-07', 'a time zone ahead of UTC is believed');
  assert.equal(resolveDay('2026-12-25', now), '2026-10-06', 'a far-off date is not');
  const game = parseGameId('c1-hindi-varn-pehchan')!;
  const { summary } = applyResult(game, new Map(), emptyProfile(), { correct: 0, total: 10, bestStreak: 0, seconds: 5 }, '2026-10-06');
  assert.equal(summary.completed, false);
  assert.equal(summary.xpGained, 0);
});
