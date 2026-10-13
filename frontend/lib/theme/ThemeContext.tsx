'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '@/lib/api/client';
import {
  POLICY_STORAGE_KEY,
  THEME_STORAGE_KEY,
  applyToDocument,
  canSwitchTheme,
  parsePolicy,
  parsePreference,
  resolveTheme,
  type Theme,
  type ThemePolicy,
  type ThemePreference,
} from './policy';

interface ThemeContextValue {
  /** The visitor's own choice (kept even while the site forces a theme). */
  theme: ThemePreference;
  resolvedTheme: Theme;
  /** The administrator's appearance setting, once known. */
  policy: ThemePolicy | null;
  /** False when the site allows one theme only: switches are hidden and setTheme does nothing. */
  canSwitch: boolean;
  setTheme: (theme: ThemePreference) => void;
  /** Re-reads the site setting (after an administrator saves it). */
  refreshPolicy: () => Promise<void>;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / storage blocked: the theme still applies for this page view.
  }
};
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

/**
 * Light / dark for the whole application — public site, user app and admin panel — under the
 * administrator's appearance setting (lib/theme/policy.ts has the rule). The inline script in the
 * root layout has already applied the right theme before paint; this keeps it in sync, reads the
 * current setting from the server, and lets the visitor switch when switching is allowed.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<Theme>('dark');
  const [policy, setPolicy] = useState<ThemePolicy | null>(null);
  const policyRef = useRef<ThemePolicy | null>(null);

  const apply = useCallback((nextPolicy: ThemePolicy | null) => {
    const preference = parsePreference(read(THEME_STORAGE_KEY));
    const resolved = resolveTheme(nextPolicy, preference, systemDark());
    applyToDocument(resolved, nextPolicy);
    setResolvedTheme(resolved);
    return resolved;
  }, []);

  const loadPolicy = useCallback(async () => {
    try {
      const res = await api.get<ThemePolicy>('/api/settings/appearance');
      const fresh = parsePolicy(res.data);
      if (!fresh) return;
      write(POLICY_STORAGE_KEY, JSON.stringify(fresh));
      policyRef.current = fresh;
      setPolicy(fresh);
      apply(fresh);
    } catch {
      // Unreachable API: keep the last known setting (or the visitor's own choice).
    }
  }, [apply]);

  useEffect(() => {
    // Browser-only state (storage, media query): read after mount; the pre-paint script has
    // already put the right attribute on <html>, so nothing visibly changes here.
    const cached = parsePolicy(read(POLICY_STORAGE_KEY));
    policyRef.current = cached;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPolicy(cached);
    setThemeState(parsePreference(read(THEME_STORAGE_KEY)) ?? 'system');
    apply(cached);
    void loadPolicy();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => apply(policyRef.current);
    media.addEventListener('change', onSystemChange);
    // Another tab changed the choice or the setting: follow it.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setThemeState(parsePreference(e.newValue) ?? 'system');
      if (e.key === POLICY_STORAGE_KEY) {
        policyRef.current = parsePolicy(e.newValue);
        setPolicy(policyRef.current);
      }
      if (e.key === THEME_STORAGE_KEY || e.key === POLICY_STORAGE_KEY) apply(policyRef.current);
    };
    window.addEventListener('storage', onStorage);
    return () => {
      media.removeEventListener('change', onSystemChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [apply, loadPolicy]);

  const setTheme = useCallback(
    (next: ThemePreference) => {
      if (!canSwitchTheme(policyRef.current)) return;
      setThemeState(next);
      write(THEME_STORAGE_KEY, next);
      apply(policyRef.current);
    },
    [apply],
  );

  const value = useMemo(
    () => ({ theme, resolvedTheme, policy, canSwitch: canSwitchTheme(policy), setTheme, refreshPolicy: loadPolicy }),
    [theme, resolvedTheme, policy, setTheme, loadPolicy],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
