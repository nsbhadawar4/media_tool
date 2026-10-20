/**
 * Archive and Trash / Deleted in the admin navigation: two separate pages in their own "Content
 * management" section, each with its own count (announced as archived / deleted), its breadcrumb,
 * and a label for every kind the server can list.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_NAV_GROUPS, liveNavItems } from '../components/admin/navItems';
import { BADGE_MEANING, badgeText } from '../components/admin/navBadges';
import { adminCrumbs } from '../lib/admin/breadcrumbs';
import { KIND_LABEL } from '../lib/api/contentLifecycle';

test('the sidebar has a "Content management" section with Archive and Trash / Deleted, right after Manage', () => {
  const labels = ADMIN_NAV_GROUPS.map((g) => g.label);
  assert.equal(labels[labels.indexOf('Manage') + 1], 'Content management');
  const group = ADMIN_NAV_GROUPS.find((g) => g.label === 'Content management')!;
  assert.deepEqual(
    group.items.map((i) => [i.href, i.label, Boolean(i.planned)]),
    [
      ['/admin/archive', 'Archive', false],
      ['/admin/trash', 'Trash / Deleted', false],
    ],
  );
  assert.ok(!ADMIN_NAV_GROUPS.find((g) => g.label === 'Manage')!.items.some((i) => i.href === '/admin/trash'), 'not also under Manage');
  const live = liveNavItems(ADMIN_NAV_GROUPS).map((i) => i.href);
  assert.ok(live.includes('/admin/archive') && live.includes('/admin/trash'), 'reachable on mobile too');
});

test('their badges read as archived / deleted items, and never outgrow the pill', () => {
  assert.equal(BADGE_MEANING['/admin/archive'], 'archived');
  assert.equal(BADGE_MEANING['/admin/trash'], 'deleted');
  assert.equal(badgeText(4), '4');
  assert.equal(badgeText(250), '99+');
});

test('breadcrumbs: Admin › Archive and Admin › Trash / Deleted', () => {
  assert.deepEqual(
    adminCrumbs('/admin/archive').map((c) => c.label),
    ['Admin', 'Archive'],
  );
  assert.deepEqual(
    adminCrumbs('/admin/trash').map((c) => c.label),
    ['Admin', 'Trash / Deleted'],
  );
});

test('every kind the server lists has a label (and only those)', () => {
  assert.deepEqual(Object.keys(KIND_LABEL).sort(), ['chapter', 'class', 'course', 'game', 'kid_game', 'section', 'subject']);
});
