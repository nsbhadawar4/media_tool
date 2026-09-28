/**
 * Reports which email provider the factory selects for the environment it is given, or
 * the error that stopped it. Same reasoning as helpers/storageProbe.ts: config/env reads
 * process.env once at import and the factory memoises its result, so a fresh process is
 * the only honest way to test the choice.
 *
 * Spawned by tests/emailSelection.test.ts; not part of the application.
 */
async function main(): Promise<void> {
  try {
    const { getEmailProvider } = await import('../../src/services/email');
    process.stdout.write(`OK:${getEmailProvider().name}`);
  } catch (err) {
    const status = (err as { statusCode?: number })?.statusCode ?? 0;
    process.stdout.write(`ERR:${status}:${err instanceof Error ? err.message : String(err)}`);
  }
}

void main();
