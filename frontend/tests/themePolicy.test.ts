/**
 * The theme rule (lib/theme/policy.ts): the administrator's allowed themes first, then the
 * visitor's own saved choice, then the administrator's default, then the device. Also runs the
 * actual pre-paint scripts against a fake document, so they can never drift from the rule.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEME_INIT_SCRIPT, canSwitchTheme, parsePolicy, parsePreference, policyBootScript, resolveTheme, type ThemePolicy } from '../lib/theme/policy';

const both = (defaultTheme: 'light' | 'dark'): ThemePolicy => ({ themeMode: 'both', defaultTheme });

test('priority: allowed themes → saved choice → admin default → device', () => {
  // 1. A single allowed theme wins over everything, including a saved choice.
  assert.equal(resolveTheme({ themeMode: 'light', defaultTheme: 'dark' }, 'dark', true), 'light');
  assert.equal(resolveTheme({ themeMode: 'dark', defaultTheme: 'light' }, 'light', false), 'dark');
  // 2. With both allowed, the visitor's own choice.
  assert.equal(resolveTheme(both('dark'), 'light', true), 'light');
  assert.equal(resolveTheme(both('light'), 'system', true), 'dark');
  // 3. No choice saved: the administrator's default.
  assert.equal(resolveTheme(both('light'), null, true), 'light');
  assert.equal(resolveTheme(both('dark'), null, false), 'dark');
  // 4. Setting not known yet: the device.
  assert.equal(resolveTheme(null, null, true), 'dark');
  assert.equal(resolveTheme(null, null, false), 'light');
  assert.equal(resolveTheme(null, 'light', true), 'light');
});

test('the switch: shown only when both themes are allowed (and while the setting is unknown)', () => {
  assert.equal(canSwitchTheme(both('dark')), true);
  assert.equal(canSwitchTheme({ themeMode: 'light', defaultTheme: 'light' }), false);
  assert.equal(canSwitchTheme({ themeMode: 'dark', defaultTheme: 'light' }), false);
  assert.equal(canSwitchTheme(null), true);
});

test('stored values are validated, never trusted', () => {
  assert.deepEqual(parsePolicy('{"themeMode":"light","defaultTheme":"dark"}'), { themeMode: 'light', defaultTheme: 'dark' });
  assert.equal(parsePolicy('{"themeMode":"sepia","defaultTheme":"dark"}'), null);
  assert.equal(parsePolicy('not json'), null);
  assert.equal(parsePolicy(null), null);
  assert.equal(parsePreference('system'), 'system');
  assert.equal(parsePreference('blue'), null);
});

/** Runs a pre-paint script with a fake <html>, storage and media query; returns the attributes it set. */
function runScript(source: string, storage: Record<string, string>, systemDark: boolean) {
  const attrs: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (k: string, v: string) => (attrs[k] = v),
      removeAttribute: (k: string) => delete attrs[k],
    },
  };
  const localStorage = {
    getItem: (k: string) => (k in storage ? storage[k] : null),
    setItem: (k: string, v: string) => (storage[k] = v),
  };
  const window = { matchMedia: () => ({ matches: systemDark }) };
  new Function('document', 'localStorage', 'window', source)(document, localStorage, window);
  return attrs;
}

test('the root layout’s pre-paint script follows the same rule as resolveTheme', () => {
  const policies: Array<ThemePolicy | null> = [null, both('light'), both('dark'), { themeMode: 'light', defaultTheme: 'dark' }, { themeMode: 'dark', defaultTheme: 'light' }];
  for (const policy of policies)
    for (const pref of [null, 'light', 'dark', 'system'] as const)
      for (const dark of [true, false]) {
        const storage: Record<string, string> = {};
        if (policy) storage.media_tool_theme_policy = JSON.stringify(policy);
        if (pref) storage.media_tool_theme = pref;
        const attrs = runScript(THEME_INIT_SCRIPT, storage, dark);
        const label = JSON.stringify({ policy, pref, dark });
        assert.equal(attrs['data-theme'], resolveTheme(policy, pref, dark), label);
        assert.equal(attrs['data-theme-lock'], policy && policy.themeMode !== 'both' ? policy.themeMode : undefined, label);
      }
});

test('the public site’s boot script applies the server’s setting and remembers it', () => {
  const storage: Record<string, string> = { media_tool_theme: 'dark' };
  const attrs = runScript(policyBootScript({ themeMode: 'light', defaultTheme: 'light' }), storage, true);
  assert.equal(attrs['data-theme'], 'light');
  assert.equal(attrs['data-theme-lock'], 'light');
  assert.equal(storage.media_tool_theme, 'dark', 'the visitor’s own choice is not overwritten');
  assert.deepEqual(JSON.parse(storage.media_tool_theme_policy), { themeMode: 'light', defaultTheme: 'light' });
  const again = runScript(policyBootScript(both('light')), storage, false);
  assert.equal(again['data-theme'], 'dark', 'both allowed again: their choice returns');
});
