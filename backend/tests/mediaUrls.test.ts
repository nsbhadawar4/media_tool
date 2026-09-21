/**
 * Covers the URLs the API hands the browser for every file.
 *
 * This is the join between private storage and the page: the client never learns a
 * storage key or a bucket address, only these three links, each carrying a short-lived
 * token scoped to one file and one account. Two things therefore matter and are asserted
 * here — that the links are shaped the way a same-origin Vercel deployment needs, and
 * that nothing about where the bytes physically live leaks into the response.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/media_tool_tests_unused';
process.env.JWT_SECRET ??= 'test-only-secret-not-used-outside-tests';
process.env.NODE_ENV = 'test';

/**
 * Empty is what production runs with: on Vercel the API and the app share one origin, so
 * media URLs must be relative. A hardcoded host would also break every preview
 * deployment, each of which gets its own hostname.
 */
process.env.API_BASE_URL = '';

const OWNER = '6aab87a711540c1852a355f3';
const OTHER_OWNER = '6aabe9f033600c1272f910b8';
const MEDIA_ID = '6ab00e2ab9d356abccaf02ee';

/** The fields of a Media document that URL building actually reads. */
function mediaStub(overrides: Record<string, unknown> = {}) {
  return {
    _id: { toString: () => MEDIA_ID },
    folderId: null,
    originalName: 'holiday photo.jpg',
    storedName: '1789922874956-5b3ef56c031b51e7.jpeg',
    storageKey: 'images/6ab00e2ab9d356abccaf02ee/1789922874956-5b3ef56c031b51e7.jpeg',
    storageProvider: 'r2',
    url: null,
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: 482_133,
    width: 4032,
    height: 3024,
    duration: null,
    thumbnailKey: 'thumbnails/1789922874956-5b3ef56c031b51e7.webp',
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date('2026-09-01T10:00:00Z'),
    updatedAt: new Date('2026-09-01T10:00:00Z'),
    ...overrides,
  } as never;
}

test('media URLs are same-origin API paths, never bucket addresses', async () => {
  const { buildMediaUrls } = await import('../src/utils/mediaUrls');
  const urls = buildMediaUrls(mediaStub(), OWNER);

  assert.match(urls.viewUrl, new RegExp(`^/api/media/${MEDIA_ID}/raw\\?token=`));
  assert.match(urls.downloadUrl, new RegExp(`^/api/media/${MEDIA_ID}/download\\?token=`));
  assert.match(urls.thumbnailUrl ?? '', new RegExp(`^/api/media/${MEDIA_ID}/thumb\\?token=`));

  // The whole point of routing through the API: the bucket is private and its addresses
  // are never disclosed, so an R2 host or a raw storage key must appear in none of them.
  for (const url of [urls.viewUrl, urls.downloadUrl, urls.thumbnailUrl!]) {
    assert.ok(!url.includes('r2.cloudflarestorage'), `bucket host leaked into ${url}`);
    assert.ok(!url.includes('images/'), `storage key leaked into ${url}`);
  }
});

test('no thumbnail means no thumbnail URL, rather than a link that 404s', async () => {
  const { buildMediaUrls } = await import('../src/utils/mediaUrls');
  const urls = buildMediaUrls(mediaStub({ thumbnailKey: null }), OWNER);

  // The gallery branches on null to fall back to the full image or a typed placeholder.
  assert.equal(urls.thumbnailUrl, null);
  assert.ok(urls.viewUrl);
});

test('each token is scoped to one file and one account', async () => {
  const { buildMediaUrls } = await import('../src/utils/mediaUrls');
  const { verifyMediaToken } = await import('../src/services/tokenService');

  const token = new URL(buildMediaUrls(mediaStub(), OWNER).viewUrl, 'http://x').searchParams.get('token');
  assert.ok(token);

  const payload = verifyMediaToken(token);
  assert.equal(payload.sub, OWNER);
  assert.equal(payload.mediaId, MEDIA_ID);

  /**
   * A token minted for one viewer must not read as another's. The streaming handlers look
   * the file up with `ownerId: req.user.id`, so a token carrying the wrong subject finds
   * nothing — which is what stops a leaked link from working for anybody else.
   */
  const otherToken = new URL(
    buildMediaUrls(mediaStub(), OTHER_OWNER).viewUrl,
    'http://x',
  ).searchParams.get('token');
  assert.notEqual(otherToken, token);
  assert.equal(verifyMediaToken(otherToken!).sub, OTHER_OWNER);
});

test('the serialized media never carries storage details', async () => {
  const { serializeMedia } = await import('../src/utils/mediaUrls');
  const serialized = serializeMedia(mediaStub(), OWNER) as Record<string, unknown>;

  // Everything the UI renders.
  for (const field of ['id', 'originalName', 'mimeType', 'fileType', 'size', 'viewUrl', 'downloadUrl']) {
    assert.ok(field in serialized, `${field} is missing from the response`);
  }

  /**
   * And nothing else. `storageKey` in particular is the object's address in the bucket:
   * disclosing it would turn a presigned-URL scheme into a guessable one the moment the
   * bucket were ever misconfigured, and `ownerId` would expose account ids to the client
   * for no purpose.
   */
  for (const field of ['storageKey', 'storageProvider', 'storedName', 'ownerId', 'thumbnailKey']) {
    assert.ok(!(field in serialized), `${field} leaked into the response`);
  }
});

test('an empty API_BASE_URL resolves to same-origin, as production sets it', async () => {
  const { env } = await import('../src/config/env');

  /**
   * Pins the configuration the URLs above were built under, so this file cannot start
   * passing for the wrong reason if the default ever changes. Empty is both what Vercel
   * defaults to and the only value that works across preview deployments, since each one
   * is served from a different hostname.
   */
  assert.equal(env.API_BASE_URL, '');
  assert.equal(env.isSameOrigin, true);
});
