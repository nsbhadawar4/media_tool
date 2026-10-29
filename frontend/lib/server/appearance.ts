import { cache } from 'react';
import { connection } from 'next/server';
import { parsePolicy, type ThemePolicy } from '@/lib/theme/policy';
import { loadBackend } from './backend';

/** Longest a page waits for the setting; after that the browser's own rule applies. */
const TIMEOUT_MS = 2000;

/**
 * The administrator's appearance setting, for server-rendered pages (the public site), so the
 * first paint already follows it. Null when it can't be read in time: the page then relies on the
 * pre-paint script and the theme provider, as the app's pages do. Once per request. Read in-process,
 * like the rest of the public content (see contentCatalog.ts), not over HTTP.
 */
export const getServerAppearance = cache(async (): Promise<ThemePolicy | null> => {
  await connection();
  try {
    const read = async () => {
      const backend = await loadBackend();
      await backend.ensureDatabase();
      return backend.publicContent.appearance();
    };
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS));
    return parsePolicy(JSON.parse(JSON.stringify(await Promise.race([read(), timeout]))));
  } catch {
    return null;
  }
});
