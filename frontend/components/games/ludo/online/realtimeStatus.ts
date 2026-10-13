/**
 * Where the realtime Ludo server is, and what to tell the player when it can't be used. Pure (no
 * React, no globals) so the rules are unit-tested — see tests/ludoRealtime.test.ts.
 *
 * The server is a separate long-running process (realtime/README.md); Vercel can't host it.
 */

/**
 *  - idle: nothing tried yet;
 *  - unavailable: this build has no server address (NEXT_PUBLIC_REALTIME_URL was not set when the
 *    site was built — it is inlined at build time);
 *  - unreachable: the address is set but nothing answers there (down, asleep, wrong URL);
 *  - refused: the server answers but doesn't accept this site's address (its ALLOWED_ORIGINS);
 *  - disconnected: reachable and accepting, yet the socket couldn't connect (a proxy blocking it);
 *  - connecting / connected / reconnecting: the socket's own lifecycle.
 */
export type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'unavailable' | 'unreachable' | 'refused';

/** The server's address: the build's NEXT_PUBLIC_REALTIME_URL, else (development only) port 4001 on this host. */
export function resolveRealtimeUrl(configured: string | undefined, location: { protocol: string; hostname: string } | null): string | null {
  const url = configured?.trim();
  if (url) return url.replace(/\/+$/, '');
  if (location) {
    const host = location.hostname;
    // Also covers a phone on the LAN opening the laptop's dev server.
    if (host === 'localhost' || host === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
      return `${location.protocol}//${host}:4001`;
    }
  }
  return null;
}

/** What GET /health on the realtime server answers. */
export interface Health {
  ok: boolean;
  /** Whether the server accepts the page's own origin. Missing on an older server. */
  originAllowed?: boolean;
}

/** Asks the server's /health; null when nothing answers in time (or the answer isn't the server's). */
export async function probeHealth(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = 6000): Promise<Health | null> {
  try {
    const res = await fetchImpl(`${url}/health`, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<Health>;
    return body?.ok === true ? { ok: true, ...(typeof body.originAllowed === 'boolean' ? { originAllowed: body.originAllowed } : {}) } : null;
  } catch {
    return null;
  }
}

/** Why a first connection failed, from what /health said. */
export function diagnose(health: Health | null): 'unreachable' | 'refused' | 'disconnected' {
  if (!health) return 'unreachable';
  if (health.originAllowed === false) return 'refused';
  return 'disconnected';
}

/** The player-facing explanation for a state that blocks online play, or null when there is none. */
export function connectionProblem(state: Connection): string | null {
  switch (state) {
    case 'unavailable':
      return 'Online play isn’t set up on this site yet: the realtime server address (NEXT_PUBLIC_REALTIME_URL) was not set when the site was built.';
    case 'unreachable':
      return 'Can’t reach the game server right now. If it was asleep it can take up to a minute to wake — retrying automatically.';
    case 'refused':
      return 'The game server doesn’t accept this site yet: this address must be added to its ALLOWED_ORIGINS.';
    case 'disconnected':
      return 'The game server is up, but the connection couldn’t be opened from this network. Trying again…';
    default:
      return null;
  }
}

/**
 * How long Create / Join keep waiting for a first connection. A free host that sleeps when idle
 * (Render free) holds the first requests while it boots, which takes 30–60 s; giving up sooner
 * reports a failure for a server that is about to answer. Once connected, replies are quick.
 */
export const FIRST_CONNECT_WAIT_MS = 90_000;
/** How long Create / Join wait for the server's reply once the socket is connected. */
export const REPLY_WAIT_MS = 8_000;

/** Create / Join can't work at all until someone fixes the configuration. */
export const blocksOnlinePlay = (state: Connection) => state === 'unavailable' || state === 'refused';
