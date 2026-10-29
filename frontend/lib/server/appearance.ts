import { cache } from 'react';
import { connection } from 'next/server';
import { parsePolicy, type ThemePolicy } from '@/lib/theme/policy';
import { apiHeaders, apiOrigin } from './contentCatalog';

/** Longest a page waits for the setting; after that the browser's own rule applies. */
const TIMEOUT_MS = 2000;

/**
 * The administrator's appearance setting, for server-rendered pages (the public site), so the
 * first paint already follows it. Null when it can't be read in time: the page then relies on the
 * pre-paint script and the theme provider, as the app's pages do. Once per request.
 */
export const getServerAppearance = cache(async (): Promise<ThemePolicy | null> => {
  await connection();
  try {
    const origin = await apiOrigin();
    if (!origin) return null;
    const res = await fetch(`${origin}/api/settings/appearance`, { cache: 'no-store', headers: apiHeaders(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return null;
    return parsePolicy(((await res.json()) as { data: unknown }).data);
  } catch {
    return null;
  }
});
