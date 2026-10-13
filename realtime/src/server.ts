import { createServer, type IncomingMessage } from 'node:http';
import { Server } from 'socket.io';
import type { Ack, ClientToServer, ServerToClient } from 'ludo-core';
import { DEFAULT_TIMING, RoomManager, type IO, type Sock, type Timing } from './rooms';

const PORT = Number(process.env.PORT ?? 4001);
const IS_PROD = process.env.NODE_ENV === 'production';
/** Comma-separated origins allowed to open a socket, e.g. https://your-app.vercel.app */
const ALLOWED = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

/** Who may connect: development accepts any origin; production only ALLOWED_ORIGINS. */
export interface Access {
  production: boolean;
  allowedOrigins: readonly string[];
}

/**
 * Whether a browser on `origin` may use the server. Development accepts any origin so a phone on
 * the LAN can test against a laptop. A request without an Origin header is not a browser page
 * (health checks, curl) and carries no user's cookies, so it is let through.
 */
export function originAllowed(origin: string | undefined, access: Access): boolean {
  if (!origin || !access.production) return true;
  return access.allowedOrigins.includes(origin.replace(/\/$/, ''));
}

export function createRealtime(port = PORT, timing?: Partial<Timing>, access: Access = { production: IS_PROD, allowedOrigins: ALLOWED }) {
  const allowed = (req: IncomingMessage) => originAllowed(req.headers.origin, access);

  const http = createServer((req, res) => {
    if (req.url === '/health' || req.url?.startsWith('/health?')) {
      // Readable from any page (no cookies, nothing private) so the app can tell the player
      // whether the server is up, and whether it accepts the page's own address.
      res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, rooms: manager.roomCount, originAllowed: allowed(req) }));
      return;
    }
    res.writeHead(404).end();
  });

  const io: IO = new Server<ClientToServer, ServerToClient>(http, {
    // CORS headers only matter to the browser for HTTP long-polling; a WebSocket upgrade is not
    // subject to CORS at all. allowRequest runs for both transports, so it is what actually
    // enforces ALLOWED_ORIGINS.
    cors: { origin: (origin, cb) => cb(null, originAllowed(origin, access)) },
    allowRequest: (req, cb) => cb(null, allowed(req)),
    // Rooms are tiny; a small buffer stops one client from sending huge payloads.
    maxHttpBufferSize: 8 * 1024,
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });

  const manager = new RoomManager(io, { ...DEFAULT_TIMING, ...timing });
  manager.start();

  io.on('connection', (socket: Sock) => {
    // Per-socket flood guard: at most 40 events in any 5 seconds.
    let windowStart = Date.now();
    let count = 0;
    const allowed = () => {
      const now = Date.now();
      if (now - windowStart > 5_000) {
        windowStart = now;
        count = 0;
      }
      return ++count <= 40;
    };
    const safe = <A extends unknown[]>(fn: (...args: A) => Ack<unknown>) =>
      (...args: unknown[]) => {
        const ack = args[args.length - 1];
        const reply = typeof ack === 'function' ? (ack as (a: Ack<unknown>) => void) : () => {};
        if (!allowed()) return reply({ ok: false, error: 'Slow down a little.' });
        try {
          reply(fn(...(args.slice(0, typeof ack === 'function' ? -1 : undefined) as A)));
        } catch (err) {
          console.error('[realtime] handler error', err);
          reply({ ok: false, error: 'Something went wrong.' });
        }
      };

    socket.on('room:create', safe((p: { name: string; playerId?: string }) => manager.create(socket, p ?? {})) as never);
    socket.on('room:join', safe((p: { code: string; name: string; playerId?: string }) => manager.join(socket, p ?? {})) as never);
    socket.on('room:sync', safe(() => manager.sync(socket)) as never);
    socket.on('room:color', safe((p: { color: unknown }) => manager.setColor(socket, p?.color)) as never);
    socket.on('room:ready', safe((p: { ready: unknown }) => manager.setReady(socket, p?.ready)) as never);
    socket.on('room:start', safe(() => manager.startGame(socket)) as never);
    socket.on('room:leave', safe(() => manager.leave(socket)) as never);
    socket.on('room:close', safe(() => manager.close(socket)) as never);
    socket.on('room:restart', safe(() => manager.restart(socket)) as never);
    socket.on('game:roll', safe(() => manager.roll(socket)) as never);
    socket.on('game:move', safe((p: { tokenId: unknown }) => manager.move(socket, p?.tokenId)) as never);
    socket.on('disconnect', () => manager.disconnect(socket));
  });

  return {
    io,
    http,
    manager,
    listen: () =>
      new Promise<number>((resolve) => {
        http.listen(port, () => {
          const addr = http.address();
          resolve(typeof addr === 'object' && addr ? addr.port : port);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        manager.stop();
        void io.close(() => resolve());
      }),
  };
}

// Run directly (npm run dev / npm start), but not when imported by the tests.
const entry = process.argv[1] ?? '';
if (/server\.(ts|js)$/.test(entry)) {
  void createRealtime().listen().then((port) => {
    console.log(`[realtime] Ludo rooms listening on :${port} (${IS_PROD ? 'production' : 'development'})`);
    if (IS_PROD && ALLOWED.length === 0) console.warn('[realtime] ALLOWED_ORIGINS is empty: every browser origin will be refused');
  });
}
