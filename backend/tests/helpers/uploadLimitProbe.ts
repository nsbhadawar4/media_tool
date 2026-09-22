/**
 * Reports the upload ceilings the app computes for the environment it is given.
 *
 * Its own process for the same reason as storageProbe: `src/config/env` reads process.env
 * once, at import, so the only honest way to test what a deployment would compute is to
 * boot one with that environment.
 *
 * Prints `<configured>:<proxy>` in bytes. Spawned by tests/uploadLimits.test.ts.
 */
async function main(): Promise<void> {
  try {
    const { env } = await import('../../src/config/env');
    process.stdout.write(`${env.maxFileSizeBytes}:${env.proxyUploadMaxBytes}`);
  } catch (err) {
    process.stdout.write(`ERR:${err instanceof Error ? err.message : String(err)}`);
  }
}

void main();
