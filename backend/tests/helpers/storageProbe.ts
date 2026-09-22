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
    // The status is reported alongside the message because it is the part that decides
    // whether an operator ever reads that message: anything the global handler does not
    // recognise as an AppError becomes a bare "Internal server error" in production.
    const status = (err as { statusCode?: number })?.statusCode ?? 0;
    process.stdout.write(`ERR:${status}:${err instanceof Error ? err.message : String(err)}`);
  }
}

void main();
