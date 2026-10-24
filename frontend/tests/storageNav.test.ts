/**
 * Storage Management: Storage (overview), Folders, Media and Documents live under ONE expandable sidebar
 * parent — for users and administrators (the same shared library routes) — and the public website
 * never links to private storage pages.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADMIN_NAV_GROUPS, USER_NAV_GROUPS, isNavParentActive, liveNavItems, openNavGroups } from '../components/admin/navItems';

const topLevel = (groups: typeof USER_NAV_GROUPS) => groups.flatMap((g) => g.items);

const storageKids = [['Storage', '/manage-storage'], ['Folders', '/folders'], ['Media', '/media'], ['Documents', '/documents']];
const STORAGE_HREFS = storageKids.map(([, h]) => h!);

test('user sidebar: ONE Storage Management parent (a link to the overview) holding Storage, Folders, Media, Documents', () => {
  const items = topLevel(USER_NAV_GROUPS);
  for (const label of ['Storage', 'Folders', 'Media', 'Documents', 'Manage Storage']) assert.deepEqual(items.filter((i) => i.label === label), [], `${label} is not a top-level entry`);
  assert.deepEqual(items.filter((i) => STORAGE_HREFS.includes(i.href) && !i.children), [], 'no storage page outside the group');
  const parents = items.filter((i) => i.children);
  assert.deepEqual(parents.map((p) => p.label), ['Storage Management']);
  assert.equal(parents[0]!.href, '/manage-storage', 'the parent opens the existing overview page');
  assert.deepEqual(parents[0]!.children!.map((c) => [c.label, c.href]), storageKids);
  assert.deepEqual(USER_NAV_GROUPS.find((g) => g.label === 'Account')!.items.map((i) => i.label), ['Profile', 'Settings']);
  // The tab bar lists the children as plain pages, in the sidebar's order, never the parent.
  const live = liveNavItems(USER_NAV_GROUPS).map((i) => i.href);
  assert.deepEqual(live.slice(0, 5), ['/dashboard', ...STORAGE_HREFS]);
  assert.equal(live.length, new Set(live).size, 'no destination twice');
  // Section switches still filter inside a parent.
  const open = openNavGroups(USER_NAV_GROUPS, () => false);
  assert.deepEqual(topLevel(open).find((i) => i.children)!.children!.map((c) => c.label), storageKids.map(([l]) => l));
});

test('the parent is active, so the sidebar keeps it expanded, on every storage page and anything below it', () => {
  const parent = topLevel(USER_NAV_GROUPS).find((i) => i.children)!;
  for (const h of STORAGE_HREFS) for (const p of [h, `${h}/x`]) assert.equal(isNavParentActive(p, parent), true, p);
  for (const p of ['/mediax', '/foldersx', '/manage-storagex', '/dashboard', '/settings', '/trash', '/admin/dashboard']) assert.equal(isNavParentActive(p, parent), false, p);
});

test('admin sidebar: the same group over the same existing routes (shared library pages, no /admin copies)', () => {
  const parent = topLevel(ADMIN_NAV_GROUPS).find((i) => i.label === 'Storage Management')!;
  assert.deepEqual(parent.children, topLevel(USER_NAV_GROUPS).find((i) => i.children)!.children, 'one definition for both');
  assert.ok(parent.children!.every((c) => !c.planned && !c.href.startsWith('/admin')), 'real routes, no fake admin pages');
  assert.ok(topLevel(ADMIN_NAV_GROUPS).every((i) => !['Storage', 'Media', 'Documents', 'Folders'].includes(i.label)), 'no top-level copies');
  const live = liveNavItems(ADMIN_NAV_GROUPS).map((i) => i.href);
  for (const h of STORAGE_HREFS) assert.ok(live.includes(h), h);
  assert.ok(!live.includes('/admin/media') && !live.includes('/admin/documents'));
});

test('the public website carries no private storage navigation', () => {
  const dir = join(process.cwd(), 'frontend', 'components', 'marketing');
  for (const file of readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f))) {
    const src = readFileSync(join(dir, file), 'utf8');
    assert.ok(!/['"`]\/(media|documents|manage-storage|folders|storage)\b/.test(src), `${file} must not link to private storage pages`);
    assert.ok(!/Storage Management/.test(src), `${file} must not mention Storage Management`);
  }
});
