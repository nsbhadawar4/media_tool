/**
 * Pins the file size ceiling that actually applies, which is not always MAX_FILE_SIZE_MB.
 *
 * When storage can presign, the browser PUTs straight to the bucket and only the
 * configured limit matters. When it cannot — `gridfs`, or `local` — every byte goes
 * through the API, and a serverless host refuses an oversized body *before* the function
 * runs. The app never sees that request, so it cannot explain the failure: the user is
 * left with a file that will not upload and no reason given. Computing the lower ceiling
 * up front is what lets `presign` say "too big, and here is why" instead.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, 'helpers', 'uploadLimitProbe.ts');

const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/media_tool_tests_unused',
  JWT_SECRET: 'test-only-secret-not-used-outside-tests',
  NODE_ENV: 'test',
};

const MB = 1024 * 1024;

/** Vercel's documented request body limit, which the app sizes its ceiling against. */
const PLATFORM_BODY_LIMIT = 4.5 * MB;

/** The parent's environment is withheld so a stray VERCEL in the shell cannot decide this. */
function limitsWith(overrides: Record<string, string>): Promise<{ configured: number; proxy: number }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', PROBE],
      {
        cwd: path.join(HERE, '..'),
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...BASE_ENV, ...overrides },
      },
      (err, stdout) => {
        if (err && !stdout) {
          reject(err);
          return;
        }
        const [configured, proxy] = stdout.trim().split(':');
        resolve({ configured: Number(configured), proxy: Number(proxy) });
      },
    );
  });
}

test('off a serverless host, the configured limit is the only limit', async () => {
  const { configured, proxy } = await limitsWith({ MAX_FILE_SIZE_MB: '500' });

  assert.equal(configured, 500 * MB);
  assert.equal(proxy, configured, 'a real server streams the body to disk; nothing caps it but the setting');
});

test('on a serverless host, an upload through the API is capped by the platform', async () => {
  const { configured, proxy } = await limitsWith({ MAX_FILE_SIZE_MB: '500', VERCEL: '1' });

  assert.equal(configured, 500 * MB, 'the configured value still governs direct-to-bucket uploads');
  assert.ok(proxy < PLATFORM_BODY_LIMIT, `expected a ceiling under ${PLATFORM_BODY_LIMIT}, got ${proxy}`);
  assert.ok(proxy > 4 * MB, 'the headroom for the multipart envelope should be modest, not most of the budget');
});

test('a configured limit below the platform cap still wins', async () => {
  // Somebody who deliberately limits uploads to 2 MB means 2 MB, serverless or not.
  const { proxy } = await limitsWith({ MAX_FILE_SIZE_MB: '2', VERCEL: '1' });

  assert.equal(proxy, 2 * MB);
});
