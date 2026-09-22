import fsp from 'node:fs/promises';
import { env } from '../../src/config/env';

/**
 * Watches multer's temp directory for files an upload failed to clean up.
 *
 * Counted as a *difference*, not a total. `env.tmpDir` is one directory shared by every
 * suite, and the test runner runs suites in parallel processes — so another suite's
 * in-flight upload is legitimately there while this one looks, and asserting the directory
 * is empty would make a passing suite fail because an unrelated one happened to be busy.
 * What this suite can honestly claim is that nothing *it* created was left behind.
 */

/** multer's naming scheme, so nothing else that lives in the temp directory is counted. */
const MULTER_TEMP = /^\d{13}-[0-9a-f]{32}/;

async function currentTempFiles(): Promise<Set<string>> {
  const entries = await fsp.readdir(env.tmpDir).catch(() => [] as string[]);
  return new Set(entries.filter((name) => MULTER_TEMP.test(name)));
}

export interface TempFileWatch {
  /** Names present now that were not present when the watch started. */
  leaked(): Promise<string[]>;
}

export async function watchTempFiles(): Promise<TempFileWatch> {
  const before = await currentTempFiles();
  return {
    async leaked() {
      const after = await currentTempFiles();
      return [...after].filter((name) => !before.has(name));
    },
  };
}
