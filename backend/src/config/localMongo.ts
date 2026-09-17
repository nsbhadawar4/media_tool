/**
 * NOT part of the running application. MongoDB Atlas is the only database the server
 * ever talks to (see config/database.ts) — there is no local or embedded fallback.
 *
 * This module exists solely so `npm run migrate-to-atlas` can open the database left
 * behind by an earlier local-development setup (backend/.data/mongodb) and copy its
 * contents up to Atlas. Once that has been done it can be deleted along with .data/.
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import type { MongoMemoryServer } from 'mongodb-memory-server';
import { logger } from '../utils/logger';

const DB_NAME = 'media_tool';
const PORT = 27017;
const URI = `mongodb://127.0.0.1:${PORT}/${DB_NAME}`;

/** Set only when *we* spawned mongod, so we never stop a server we did not start. */
let server: MongoMemoryServer | undefined;

/** Resolves true when something is already listening on the local MongoDB port. */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

/** Starts the legacy local mongod if it is not already running, and returns its URI. */
export async function startLocalMongo(): Promise<string> {
  if (server) return URI;

  if (await isPortInUse(PORT)) {
    logger.info(`Using the MongoDB already running on port ${PORT}`);
    return URI;
  }

  const dbPath = path.resolve(process.cwd(), '.data', 'mongodb');
  fs.mkdirSync(dbPath, { recursive: true });

  logger.info('Starting local MongoDB (no install needed)...');

  // Imported lazily so production never loads this dev-only dependency.
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  server = await MongoMemoryServer.create({
    instance: { port: PORT, dbPath, dbName: DB_NAME, storageEngine: 'wiredTiger' },
  });

  logger.info(`Local MongoDB ready at ${URI}`);
  logger.info(`Data directory: ${dbPath}`);
  return URI;
}

/** Stops the mongod we spawned, keeping the data directory intact. */
export async function stopLocalMongo(): Promise<void> {
  if (!server) return;
  await server.stop({ doCleanup: false, force: false });
  server = undefined;
}

export function isLocalMongoRunning(): boolean {
  return server !== undefined;
}
