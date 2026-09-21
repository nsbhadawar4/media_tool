/**
 * Reports which storage provider the factory selects for the environment it is given,
 * or the error that stopped it.
 *
 * Runs as its own process because that is the only honest way to test the choice:
 * `src/config/env` reads process.env once, when the module is first imported, and the
 * factory memoises its result. Mutating process.env inside an already-loaded test would
 * prove nothing about how a real deployment boots.
 *
 * Spawned by tests/storageSelection.test.ts; not part of the application.
 */
async function main(): Promise<void> {
  try {
    const { getStorageProvider } = await import('../../src/services/storage');
    process.stdout.write(`OK:${getStorageProvider().name}`);
  } catch (err) {
    process.stdout.write(`ERR:${err instanceof Error ? err.message : String(err)}`);
  }
}

void main();
