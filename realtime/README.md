# Realtime Ludo server

Socket.IO server for online Ludo rooms. It is a **separate, long-running Node process**.

## Why it is not part of the Vercel app

The app is deployed to Vercel as serverless functions (see `DEPLOYMENT.md`). A serverless
function lives for one request and cannot hold a WebSocket open, and two requests may land on
different instances with no shared memory. A Socket.IO server inside `frontend/` would appear to
work on `next dev` and then fail in production. So the realtime server is its own deployable,
and the browser connects to it directly from the page (`NEXT_PUBLIC_REALTIME_URL`).

```
Browser ── https ──▶ Vercel (Next.js + /api Express)          unchanged
        └─ wss ────▶ realtime server (this package)           rooms live here, in memory
```

Rooms are held **in memory on one process**. That is deliberate: a Ludo room is a live session,
not a record, so nothing touches MongoDB or R2. It also means:

- run **one instance** (more would need a Redis adapter and sticky sessions, not included);
- a restart or redeploy ends every room (clients show "Room not found" and return to the menu);
- a free host that sleeps when idle (Render free) drops rooms when it sleeps, and the first
  connection after a sleep takes ~30-60 s to wake it.

## Layout

- `src/rooms.ts` — `RoomManager`: rooms, players, lobby, ready/colour/host, turn validation, dice,
  moves, reconnect grace, host hand-off, autopilot for players who left, cleanup sweeps.
- `src/server.ts` — HTTP + Socket.IO wiring, CORS, flood guard, `/health`.
- `../packages/ludo-core` — the pure rules engine and wire protocol, shared with the browser.
- `tests/rooms.test.ts` — integration tests that drive real Socket.IO clients.

The server is authoritative. Clients send intents (`room:join`, `room:ready`, `game:roll`,
`game:move`, …); the server validates turn, phase, token and room state, rolls the dice itself
(`crypto.randomInt`), and broadcasts ordered `game:event`s that each carry the state after them.

## Run locally

```bash
npm install                 # from the repo root
npm run dev:realtime        # http://localhost:4001   (or `npm run dev` runs everything)
npm run test:realtime       # integration tests
```

The web app finds it automatically on `http://<current host>:4001` when you browse via
`localhost` or a LAN IP, so a phone on the same Wi-Fi can join a room hosted from your laptop
(open `http://<laptop-ip>:3000`). Development accepts any origin.

## Environment variables

| Variable | Where | Meaning |
| --- | --- | --- |
| `NEXT_PUBLIC_REALTIME_URL` | Vercel project (frontend) | `https://your-realtime-host`. Required in production. |
| `ALLOWED_ORIGINS` | realtime host | Comma-separated browser origins allowed to connect, e.g. `https://your-app.vercel.app`. Required in production. |
| `PORT` | realtime host | Usually injected by the host. Defaults to `4001`. |
| `NODE_ENV` | realtime host | `production` turns on the origin allow-list. |

No secrets are involved. See `.env.example`.

## Deploying

Any host that runs a persistent Node process and supports WebSockets works. Free options:
Render (free web service), Fly.io, Railway (trial credit). The service just needs:

- Root directory: the repo root (it imports `packages/ludo-core` from the workspace)
- Build: `npm install`
- Start: `npm run start --workspace media-tool-realtime`
- Health check path: `/health`
- Env: `NODE_ENV=production`, `ALLOWED_ORIGINS=https://<your vercel domain>`

Then set `NEXT_PUBLIC_REALTIME_URL` in the Vercel project and redeploy the frontend.

## Room lifecycle

Codes are 6 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `O 0 I 1 L`), drawn with
`crypto.randomInt` and unique among live rooms. A dropped player keeps their seat for 30 s; the
host role moves to another connected player at once. In a running game a player who does not
return (or who leaves) has their seat played by the server. Rooms are swept when nobody has been
connected for 2 min, 10 min after a game ends, or after 30 min of inactivity.
