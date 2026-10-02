import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { io as connect, type Socket } from 'socket.io-client';
import type { Ack, GameEvent, JoinData, RoomState } from 'ludo-core';
import { getValidMoves, ROOM_CODE_ALPHABET } from 'ludo-core';
import { createRealtime } from '../src/server';

type C = Socket & { room?: RoomState; events: GameEvent[]; closed?: string; playerId?: string };

let server: ReturnType<typeof createRealtime>;
let url = '';
const clients: C[] = [];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const call = <T = undefined>(c: Socket, event: string, payload?: unknown): Promise<Ack<T>> =>
  new Promise((resolve) => (payload === undefined ? c.emit(event, resolve) : c.emit(event, payload, resolve)));

async function client(): Promise<C> {
  const c = connect(url, { transports: ['websocket'], forceNew: true, reconnection: false }) as C;
  c.events = [];
  c.on('room:state', (r: RoomState) => (c.room = r));
  c.on('game:event', (e: GameEvent) => c.events.push(e));
  c.on('room:closed', (p: { reason: string }) => (c.closed = p.reason));
  await new Promise<void>((res) => c.on('connect', () => res()));
  clients.push(c);
  return c;
}
async function until(fn: () => boolean, ms = 4000) {
  const t = Date.now();
  while (!fn()) {
    if (Date.now() - t > ms) throw new Error('timed out waiting for condition');
    await sleep(15);
  }
}
async function lobby(n: number) {
  const host = await client();
  const a = await call<JoinData>(host, 'room:create', { name: 'Host' });
  assert.ok(a.ok);
  host.playerId = a.data!.playerId;
  const code = a.data!.room.code;
  const others: C[] = [];
  for (let i = 1; i < n; i++) {
    const c = await client();
    const r = await call<JoinData>(c, 'room:join', { code, name: `P${i + 1}` });
    assert.ok(r.ok, r.error);
    c.playerId = r.data!.playerId;
    others.push(c);
  }
  return { host, others, all: [host, ...others], code };
}
async function startGame(all: C[]) {
  for (const c of all) assert.ok((await call(c, 'room:ready', { ready: true })).ok);
  assert.ok((await call(all[0]!, 'room:start')).ok);
  await until(() => all.every((c) => c.room?.status === 'playing'));
}
/** Latest game state a client has been told about (events are ordered; no extra requests needed). */
const gs = (c: C) => c.events.at(-1)?.state ?? c.room!.game!.state;
const colorOf = (c: C, room: RoomState) => room.players.find((p) => p.id === c.playerId)!.color;

/** Plays the current turn through whoever owns it. */
async function turn(all: C[]) {
  const live = all[0]!.room!;
  const st = gs(all[0]!);
  const color = st.players[st.current]!.color;
  const who = all.find((c) => colorOf(c, live) === color)!;
  const roll = await call(who, 'game:roll');
  assert.ok(roll.ok, roll.error);
  const ev = who.events.filter((e) => e.type === 'DICE_ROLLED').at(-1);
  await sleep(60);
  if (ev && ev.type === 'DICE_ROLLED' && ev.kind === 'move') {
    await sleep(30);
    const now = gs(who);
    const ids = getValidMoves(now, now.die!);
    const mv = await call(who, 'game:move', { tokenId: ids[0] });
    assert.ok(mv.ok, mv.error);
    await sleep(30);
  } else await sleep(60);
}

before(async () => {
  server = createRealtime(0, {
    reconnectGraceMs: 400,
    countdownMs: 150,
    autopilotMs: 80,
    emptyRoomMs: 300,
    finishedRoomMs: 300,
    idleRoomMs: 100000,
    lockScale: 0.02,
  });
  const port = await server.listen();
  url = `http://localhost:${port}`;
});
after(async () => {
  for (const c of clients) c.close();
  await server.close();
});

describe('rooms', () => {
  it('creates a room with a valid, unambiguous 6-char code, host in yellow', async () => {
    const { host, code } = await lobby(1);
    assert.match(code, new RegExp(`^[${ROOM_CODE_ALPHABET}]{6}$`));
    assert.ok(!/[O0I1L]/.test(code));
    assert.equal(host.room!.players[0]!.color, 'yellow');
    assert.ok(host.room!.players[0]!.host);
  });

  it('generates distinct codes', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const c = await client();
      codes.add((await call<JoinData>(c, 'room:create', { name: 'x' })).data!.room.code);
      c.close();
    }
    assert.equal(codes.size, 25);
  });

  it('rejects bad joins with the right messages', async () => {
    const c = await client();
    assert.equal((await call(c, 'room:join', { code: 'ZZZZZZ', name: 'a' })).error, 'Room not found.');
    assert.equal((await call(c, 'room:join', { code: 'abc', name: 'a' })).error, 'Room not found.');
    const full = await lobby(4);
    const late = await client();
    assert.equal((await call(late, 'room:join', { code: full.code, name: 'late' })).error, 'This room is full.');
    const l2 = await lobby(2);
    await startGame(l2.all);
    const late2 = await client();
    assert.equal((await call(late2, 'room:join', { code: l2.code, name: 'late' })).error, 'This game has already started.');
    assert.equal((await call(late2, 'room:create', { name: '   ' })).error, 'Enter a name to continue.');
  });

  it('assigns default colours in order and refuses duplicates', async () => {
    const { all } = await lobby(4);
    assert.deepEqual(all[0]!.room!.players.map((p) => p.color), ['yellow', 'green', 'blue', 'red']);
    assert.equal((await call(all[1]!, 'room:color', { color: 'yellow' })).error, 'That colour is already taken.');
    assert.ok((await call(all[3]!, 'room:ready', { ready: true })).ok);
    await call(all[3]!, 'room:leave');
    await until(() => all[0]!.room!.players.length === 3);
    assert.ok((await call(all[1]!, 'room:color', { color: 'red' })).ok);
    await until(() => all[0]!.room!.players[1]!.color === 'red');
    assert.equal(all[0]!.room!.players[1]!.ready, false);
  });

  it('ready/unready syncs to everyone; only the host can start; start needs everyone ready', async () => {
    const { host, others, all } = await lobby(3);
    assert.equal((await call(host, 'room:start')).error, 'Everyone must be ready first.');
    await call(others[0]!, 'room:ready', { ready: true });
    await until(() => host.room!.players[1]!.ready);
    await call(others[0]!, 'room:ready', { ready: false });
    await until(() => !host.room!.players[1]!.ready);
    for (const c of all) await call(c, 'room:ready', { ready: true });
    assert.equal((await call(others[1]!, 'room:start')).error, 'Only the host can start the game.');
    assert.ok((await call(host, 'room:start')).ok);
    await until(() => all.every((c) => c.room!.status === 'starting'));
    await until(() => all.every((c) => c.room!.status === 'playing'));
    assert.equal(host.room!.game!.state.players.length, 3);
  });

  it('refuses a start with fewer than 2 players', async () => {
    const { host } = await lobby(1);
    await call(host, 'room:ready', { ready: true });
    assert.equal((await call(host, 'room:start')).error, 'You need at least 2 players.');
  });

  it('server is authoritative: wrong turn and early moves are refused; all clients see identical dice and state', async () => {
    const { all } = await lobby(4);
    await startGame(all);
    const room = all[0]!.room!;
    const st = room.game!.state;
    const turnColor = st.players[st.current]!.color;
    const wrong = all.find((c) => colorOf(c, room) !== turnColor)!;
    assert.equal((await call(wrong, 'game:roll')).error, 'Not your turn.');
    const owner = all.find((c) => colorOf(c, room) === turnColor)!;
    assert.equal((await call(owner, 'game:move', { tokenId: 0 })).error, 'Roll the dice first.');
    for (let i = 0; i < 12; i++) await turn(all);
    const dice = all.map((c) => c.events.filter((e) => e.type === 'DICE_ROLLED').map((e) => (e as { die: number }).die));
    for (const d of dice) assert.deepEqual(d, dice[0]);
    assert.ok(dice[0]!.length >= 12 && dice[0]!.every((d) => d >= 1 && d <= 6));
    const snaps = (await Promise.all(all.map((c) => call<RoomState>(c, 'room:sync')))).map((a) => JSON.stringify(a.data!.game));
    assert.equal(new Set(snaps).size, 1);
    const seqs = all[1]!.events.map((e) => e.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => seqs[0]! + i));
  });

  it('rejects a forged token id', async () => {
    const { all } = await lobby(2);
    await startGame(all);
    for (let i = 0; i < 80; i++) {
      const live = all[0]!.room!;
      const st = gs(all[0]!);
      const who = all.find((c) => colorOf(c, live) === st.players[st.current]!.color)!;
      if (st.phase === 'move') {
        assert.equal((await call(who, 'game:move', { tokenId: 99 })).error, 'Invalid move.');
        assert.equal((await call(who, 'game:move', { tokenId: 'x' })).error, 'Invalid move.');
        return;
      }
      await call(who, 'game:roll');
      await sleep(50);
    }
    throw new Error('never reached a move phase');
  });

  it('reconnects with the same identity without duplicating the player', async () => {
    const { host, others, code } = await lobby(2);
    const id = others[0]!.playerId!;
    others[0]!.close();
    await until(() => host.room!.players[1]!.connected === false);
    const back = await client();
    const r = await call<JoinData>(back, 'room:join', { code, name: 'ignored', playerId: id });
    assert.ok(r.ok);
    assert.equal(r.data!.playerId, id);
    await until(() => host.room!.players[1]!.connected);
    assert.equal(host.room!.players.length, 2);
  });

  it('moves the host when the host drops, and removes a lobby player who never returns', async () => {
    const { host, others } = await lobby(3);
    host.close();
    await until(() => others[0]!.room!.hostId === others[0]!.playerId);
    await until(() => others[0]!.room!.players.length === 2, 3000);
    assert.ok(!others[0]!.room!.players.some((p) => p.id === host.playerId));
  });

  it('plays the seat of a player who left, a game finishes with a winner, and the host can restart', async () => {
    const { all } = await lobby(2);
    await startGame(all);
    await call(all[1]!, 'room:leave');
    await until(() => all[0]!.room!.players.some((p) => p.left));
    let won = false;
    const latest = () => all[0]!.events.at(-1)?.state ?? all[0]!.room!.game!.state;
    for (let i = 0; i < 4000 && !won; i++) {
      if (all[0]!.events.some((e) => e.type === 'GAME_WON')) {
        won = true;
        break;
      }
      const g = latest();
      if (g.players[g.current]!.color === all[0]!.room!.players[0]!.color) {
        if (g.phase === 'roll') await call(all[0]!, 'game:roll');
        else if (g.die !== null) {
          const ids = getValidMoves(g, g.die);
          await call(all[0]!, 'game:move', { tokenId: ids[ids.length - 1] });
        }
      }
      await sleep(30);
    }
    assert.ok(won, 'game should reach a winner');
    assert.ok(all[0]!.events.some((e) => e.type === 'GAME_WON'));
    assert.ok((await call(all[0]!, 'room:restart')).ok);
    await until(() => all[0]!.room!.status === 'lobby');
  });

  it('host closes the room; joining it afterwards says it is gone; abandoned rooms are swept', async () => {
    const { host, others, code } = await lobby(2);
    assert.equal((await call(others[0]!, 'room:close')).error, 'Only the host can close the room.');
    assert.ok((await call(host, 'room:close')).ok);
    await until(() => others[0]!.closed !== undefined);
    const c = await client();
    assert.equal((await call(c, 'room:join', { code, name: 'x' })).error, 'This room is no longer available.');

    const lone = await lobby(1);
    const before = server.manager.roomCount;
    lone.host.close();
    await sleep(1000);
    server.manager.sweep();
    assert.ok(server.manager.roomCount < before);
  });
});
