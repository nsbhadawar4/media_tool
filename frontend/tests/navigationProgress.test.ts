/**
 * When the top navigation bar should start: only for a real move to another page of this app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { isFileOrApiPath, isNewDestination } from '../lib/navigation/destination';

const at = (href: string) => {
  const u = new URL(href);
  return { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search };
};
const here = at('https://app.example/media?type=image');

test('another page or another query string is a navigation', () => {
  assert.equal(isNewDestination('/documents', here), true);
  assert.equal(isNewDestination('/media?type=video', here), true, 'query-string navigation');
  assert.equal(isNewDestination('/media', here), true, 'dropping the query');
  assert.equal(isNewDestination('https://app.example/admin/users', here), true);
});

test('the same page, a hash, another site or nonsense is not', () => {
  assert.equal(isNewDestination('/media?type=image', here), false, 'the page itself');
  assert.equal(isNewDestination('#top', here), false, 'hash on this page');
  assert.equal(isNewDestination('/media?type=image#faq', here), false, 'same page with a hash');
  assert.equal(isNewDestination('https://elsewhere.example/', here), false, 'external link');
  assert.equal(isNewDestination('mailto:help@example.com', here), false);
  assert.equal(isNewDestination('http://[bad', here), false);
});

test('file and API addresses are left to the browser', () => {
  assert.equal(isFileOrApiPath('/api/media/abc/download'), true);
  assert.equal(isFileOrApiPath('/apidocs'), false);
  assert.equal(isFileOrApiPath('/media'), false);
});
