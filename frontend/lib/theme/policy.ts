/**
 * Which theme a page shows. One rule, used before first paint (the inline script), by the theme
 * provider, and in tests — pure, so it can't drift between them.
 *
 * Priority:
 *  1. what the administrator allows (/admin/settings → Appearance): light only or dark only wins;
 *  2. the visitor's own saved choice (light, dark, or "system");
 *  3. the administrator's default theme;
 *  4. the device's light / dark setting (only while the setting itself isn't known yet).
 * A visitor's saved choice is never overwritten: a forced theme simply takes precedence while it
 * lasts, and the choice applies again when both are allowed.
 */

export type Theme = 'light' | 'dark';
export type ThemeMode = 'both' | Theme;
export type ThemePreference = Theme | 'system';

export interface ThemePolicy {
  themeMode: ThemeMode;
  defaultTheme: Theme;
}

/** The server's own default, until the setting has been read. */
export const DEFAULT_POLICY: ThemePolicy = { themeMode: 'both', defaultTheme: 'dark' };

/** localStorage: the visitor's choice, and the last known site setting (for the first paint). */
export const THEME_STORAGE_KEY = 'media_tool_theme';
export const POLICY_STORAGE_KEY = 'media_tool_theme_policy';

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

/** A stored or fetched policy, if it is well formed. */
export function parsePolicy(raw: unknown): ThemePolicy | null {
  const v = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!v || typeof v !== 'object') return null;
  const { themeMode, defaultTheme } = v as Record<string, unknown>;
  if ((themeMode === 'both' || isTheme(themeMode)) && isTheme(defaultTheme)) return { themeMode, defaultTheme };
  return null;
}
function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function parsePreference(raw: unknown): ThemePreference | null {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
}

/** The theme to show. `policy` null: the site setting isn't known yet. */
export function resolveTheme(policy: ThemePolicy | null, preference: ThemePreference | null, systemDark: boolean): Theme {
  if (policy && policy.themeMode !== 'both') return policy.themeMode;
  if (preference === 'light' || preference === 'dark') return preference;
  if (preference === 'system' || !policy) return systemDark ? 'dark' : 'light';
  return policy.defaultTheme;
}

/** Whether visitors may switch themes (the switch is shown). */
export const canSwitchTheme = (policy: ThemePolicy | null) => !policy || policy.themeMode === 'both';

/**
 * Applies a theme to the document: `data-theme`, plus `data-theme-lock` when the administrator
 * allows only one theme — CSS hides every theme switch off that attribute, so no switch flashes in
 * and out while React hydrates.
 */
export function applyToDocument(theme: Theme, policy: ThemePolicy | null) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  if (policy && policy.themeMode !== 'both') root.setAttribute('data-theme-lock', policy.themeMode);
  else root.removeAttribute('data-theme-lock');
}

/**
 * The same rule as a tiny script for the root layout's <head>: it runs before first paint, so a
 * page opens in the right theme. Kept in step with resolveTheme by the tests (ludo-free, pure).
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var d=document.documentElement,p=null,s=localStorage.getItem("${THEME_STORAGE_KEY}");
try{p=JSON.parse(localStorage.getItem("${POLICY_STORAGE_KEY}")||"null")}catch(e){}
if(!p||(p.themeMode!=="both"&&p.themeMode!=="light"&&p.themeMode!=="dark"))p=null;
var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
var t=p&&p.themeMode!=="both"?p.themeMode:(s==="light"||s==="dark")?s:(s==="system"||!p)?(dark?"dark":"light"):p.defaultTheme;
d.setAttribute("data-theme",t==="light"?"light":"dark");
if(p&&p.themeMode!=="both")d.setAttribute("data-theme-lock",p.themeMode);
if(localStorage.getItem("media_tool_reduce_motion")==="1")d.setAttribute("data-motion","reduce");
}catch(e){}})()`;

/**
 * For a server-rendered page that already knows the setting (the public site): records it and
 * applies the resulting theme at once, ahead of the page's content.
 */
export function policyBootScript(policy: ThemePolicy): string {
  const json = JSON.stringify(policy).replace(/</g, '\\u003c');
  return `(function(){try{
var p=${json},d=document.documentElement,s=localStorage.getItem("${THEME_STORAGE_KEY}");
localStorage.setItem("${POLICY_STORAGE_KEY}",JSON.stringify(p));
var dark=window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches;
var t=p.themeMode!=="both"?p.themeMode:(s==="light"||s==="dark")?s:s==="system"?(dark?"dark":"light"):p.defaultTheme;
d.setAttribute("data-theme",t);
if(p.themeMode!=="both")d.setAttribute("data-theme-lock",p.themeMode);else d.removeAttribute("data-theme-lock");
}catch(e){}})()`;
}
