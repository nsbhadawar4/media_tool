/**
 * Pins down which email provider the factory chooses for a given environment, the same
 * way storageSelection.test.ts does for storage: by booting a fresh process with that
 * environment and asking it what it picked, since config/env reads process.env once at
 * import and the factory memoises its result.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, 'helpers', 'emailProbe.ts');

const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/media_tool_tests_unused',
  JWT_SECRET: 'test-only-secret-not-used-outside-tests',
  NODE_ENV: 'test',
};

function selectProviderWith(overrides: Record<string, string>): Promise<string> {
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
        resolve(stdout.trim());
      },
    );
  });
}

test('an unset EMAIL_PROVIDER means console in test/dev, so a fresh checkout just runs', async () => {
  assert.equal(await selectProviderWith({}), 'OK:console');
});

test('EMAIL_PROVIDER=console never requires any configuration', async () => {
  assert.equal(await selectProviderWith({ EMAIL_PROVIDER: 'console' }), 'OK:console');
});

test('EMAIL_PROVIDER=resend with a key and a from-address selects Resend', async () => {
  const result = await selectProviderWith({
    EMAIL_PROVIDER: 'resend',
    RESEND_API_KEY: 're_test_not_a_real_key',
    EMAIL_FROM: 'media_tool <no-reply@example.com>',
  });
  assert.equal(result, 'OK:resend');
});

test('EMAIL_PROVIDER=resend missing its variables fails by naming them, not silently', async () => {
  const result = await selectProviderWith({ EMAIL_PROVIDER: 'resend' });
  assert.match(result, /^ERR:503:/);
  assert.match(result, /RESEND_API_KEY/);
  assert.match(result, /EMAIL_FROM/);
});

test('EMAIL_PROVIDER=smtp with its variables selects SMTP', async () => {
  const result = await selectProviderWith({
    EMAIL_PROVIDER: 'smtp',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '587',
    EMAIL_FROM: 'media_tool <no-reply@example.com>',
  });
  assert.equal(result, 'OK:smtp');
});

test('EMAIL_PROVIDER=smtp missing its variables fails by naming them', async () => {
  const result = await selectProviderWith({ EMAIL_PROVIDER: 'smtp' });
  assert.match(result, /^ERR:503:/);
  assert.match(result, /SMTP_HOST/);
  assert.match(result, /SMTP_PORT/);
  assert.match(result, /EMAIL_FROM/);
});

/**
 * The production failure this whole change guards against: a deployment that forgets to
 * configure email must fail loudly enough for someone to notice, not silently drop every
 * reset request. Mirrors "local storage on a serverless host is refused" from
 * storageSelection.test.ts — same shape, a different missing credential.
 */
test('a serverless deployment defaults to resend, and refuses loudly if unconfigured', async () => {
  const result = await selectProviderWith({ VERCEL: '1' });
  assert.match(result, /^ERR:503:/);
  assert.match(result, /RESEND_API_KEY/);
});

test('a serverless deployment with Resend configured just works', async () => {
  const result = await selectProviderWith({
    VERCEL: '1',
    RESEND_API_KEY: 're_test_not_a_real_key',
    EMAIL_FROM: 'media_tool <no-reply@example.com>',
  });
  assert.equal(result, 'OK:resend');
});
