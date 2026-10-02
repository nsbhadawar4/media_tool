import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMove, applyRoll, createGame, getValidMoves } from 'ludo-core';
import {
  LUDO_SESSION_KEY,
  LUDO_SESSION_TTL_MS,
  clearLudoSession,
  loadLudoSession,
  parseGameState,
  saveLudoSession,
  type PersistedLocalGame,
} from '../components/games/ludo/persistence';

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}
const mem = () => new FakeStorage() as unknown as Storage;

/** A real mid-game state: play scripted turns with the actual engine. */
function midGame() {
  let state = createGame(3);
  let guard = 0;
  while (state.turns < 12 && guard++ < 500) {
    const r = applyRoll(state, (guard % 6) + 1 === 6 ? 6 : (guard % 5) + 1);
    state = r.state;
    if (r.kind === 'move') state = applyMove(state, getValidMoves(state, state.die!)[0]!).state;
  }
  return state;
}

function localPayload(state = midGame()): PersistedLocalGame {
  return {
    config: { count: 3, mode: 'bot', level: 'hard' },
    controllers: { yellow: 'human', green: 'bot', red: 'bot', blue: 'human' },
    state,
    shownDie: 4,
    tally: { moves: 9, captures: 2 },
    seconds: 0,
    elapsedMs: 12_345,
  };
}

describe('ludo session persistence', () => {
  it('round-trips an exact local game', () => {
    const s = mem();
    const local = localPayload();
    assert.ok(saveLudoSession({ gameMode: 'bot', local }, s, 1000));
    const read = loadLudoSession(s, 2000);
    assert.equal(read.kind, 'valid');
    if (read.kind !== 'valid') return;
    assert.deepEqual(read.session.local, local);
    assert.equal(read.session.updatedAt, 1000);
  });

  it('keeps a rolled-but-unmoved turn exactly (die preserved, no new roll)', () => {
    let state = createGame(2);
    const r = applyRoll(state, 6);
    assert.equal(r.kind, 'move');
    state = r.state;
    const s = mem();
    saveLudoSession({ gameMode: 'local', local: { ...localPayload(state), config: { count: 2, mode: 'local', level: 'easy' }, controllers: { yellow: 'human', green: 'human', red: 'human', blue: 'human' } } }, s);
    const read = loadLudoSession(s);
    assert.equal(read.kind, 'valid');
    if (read.kind === 'valid') {
      assert.equal(read.session.local!.state.phase, 'move');
      assert.equal(read.session.local!.state.die, 6);
    }
  });

  it('expires after the TTL', () => {
    const s = mem();
    saveLudoSession({ gameMode: 'bot', local: localPayload() }, s, 0);
    assert.equal(loadLudoSession(s, LUDO_SESSION_TTL_MS - 1).kind, 'valid');
    assert.equal(loadLudoSession(s, LUDO_SESSION_TTL_MS + 1).kind, 'expired');
  });

  it('clears corrupt JSON and wrong versions instead of crashing', () => {
    const s = mem();
    s.setItem(LUDO_SESSION_KEY, '{not json');
    assert.equal(loadLudoSession(s).kind, 'none');
    assert.equal(s.getItem(LUDO_SESSION_KEY), null);
    s.setItem(LUDO_SESSION_KEY, JSON.stringify({ version: 99, updatedAt: Date.now(), gameMode: 'local' }));
    assert.equal(loadLudoSession(s).kind, 'none');
    assert.equal(s.getItem(LUDO_SESSION_KEY), null);
  });

  it('rejects impossible game states', () => {
    const good = JSON.parse(JSON.stringify(createGame(2)));
    assert.ok(parseGameState(good));
    // Mutating untyped JSON on purpose: this is what corrupted storage looks like.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bad = (mutate: (g: Record<string, any>) => void) => {
      const g = JSON.parse(JSON.stringify(good));
      mutate(g);
      return parseGameState(g);
    };
    assert.equal(bad((g) => (g.players[0].tokens[0].progress = 99)), null);
    assert.equal(bad((g) => (g.players[0].tokens[1].progress = 2.5)), null);
    assert.equal(bad((g) => (g.players[1].color = g.players[0].color)), null);
    assert.equal(bad((g) => (g.current = 5)), null);
    assert.equal(bad((g) => (g.phase = 'move')), null); // move phase needs a die with a legal move
    assert.equal(bad((g) => (g.die = 7)), null);
    assert.equal(bad((g) => (g.phase = 'over')), null); // over needs a winner
    assert.equal(bad((g) => (g.players[0].tokens = g.players[0].tokens.slice(0, 3))), null);
  });

  it('a stored mismatch between mode and config is invalid', () => {
    const s = mem();
    saveLudoSession({ gameMode: 'local', local: localPayload() }, s); // payload says bot
    assert.equal(loadLudoSession(s).kind, 'none');
  });

  it('multiplayer: stores identity, validates it, and drops a snapshot of another room', () => {
    const s = mem();
    const room = {
      code: 'ABCDEF',
      status: 'lobby' as const,
      hostId: 'player-aaaa-1111',
      players: [{ id: 'player-aaaa-1111', name: 'Narayan', color: 'yellow' as const, ready: true, host: true, connected: true, left: false }],
      game: null,
      serverTime: 0,
    };
    saveLudoSession({ gameMode: 'multiplayer', roomCode: 'ABCDEF', playerId: 'player-aaaa-1111', playerName: 'Narayan', lastRoom: room }, s);
    let read = loadLudoSession(s);
    assert.equal(read.kind, 'valid');
    if (read.kind === 'valid') {
      assert.equal(read.session.roomCode, 'ABCDEF');
      assert.equal(read.session.lastRoom?.players[0]?.name, 'Narayan');
    }
    saveLudoSession({ gameMode: 'multiplayer', roomCode: 'ZZZZZZ', playerId: 'player-aaaa-1111', playerName: 'Narayan', lastRoom: room }, s);
    read = loadLudoSession(s);
    assert.equal(read.kind, 'valid');
    if (read.kind === 'valid') assert.equal(read.session.lastRoom, undefined);
    saveLudoSession({ gameMode: 'multiplayer', roomCode: 'bad', playerId: 'x', playerName: '' }, s);
    assert.equal(loadLudoSession(s).kind, 'none');
  });

  it('clear removes the session, and storage failures never throw', () => {
    const s = mem();
    saveLudoSession({ gameMode: 'bot', local: localPayload() }, s);
    clearLudoSession(s);
    assert.equal(loadLudoSession(s).kind, 'none');
    const broken = {
      getItem() {
        throw new Error('blocked');
      },
      setItem() {
        throw new Error('quota');
      },
      removeItem() {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    assert.equal(saveLudoSession({ gameMode: 'bot', local: localPayload() }, broken), false);
    assert.equal(loadLudoSession(broken).kind, 'none');
    assert.doesNotThrow(() => clearLudoSession(broken));
    assert.equal(loadLudoSession(null).kind, 'none');
  });
});
