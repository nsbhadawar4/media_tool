import { SiteSetting } from '../models/SiteSetting';
import type { Theme, ThemeMode } from '../config/constants';

/** What the site needs to know to theme itself: safe to give to anyone, signed in or not. */
export interface PublicAppearance {
  themeMode: ThemeMode;
  defaultTheme: Theme;
}

/** Until an administrator saves anything: both themes allowed, dark first (the brand's own look). */
export const DEFAULT_APPEARANCE: PublicAppearance = { themeMode: 'both', defaultTheme: 'dark' };

/** Milliseconds a read is served from memory; every save clears it at once on this instance. */
const CACHE_MS = 30_000;
let cache: { at: number; value: PublicAppearance } | null = null;

export function invalidateAppearance(): void {
  cache = null;
}

/** The appearance setting, or the defaults when none has been saved. Cheap: cached. */
export async function getAppearance(): Promise<PublicAppearance> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const doc = await SiteSetting.findOne({ key: 'appearance' }, { themeMode: 1, defaultTheme: 1 }).lean();
  const value: PublicAppearance = doc ? { themeMode: doc.themeMode, defaultTheme: doc.defaultTheme } : { ...DEFAULT_APPEARANCE };
  cache = { at: Date.now(), value };
  return value;
}
