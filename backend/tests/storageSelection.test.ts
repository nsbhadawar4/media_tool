/**
 * Pins down which storage provider the app chooses for a given environment.
 *
 * This is the switch the whole production fix turns on: one wrong variable and files
 * either go to a disk that evaporates with the serverless instance, or the app refuses
 * to start a provider it should have been able to build. Both are configuration
 * failures, so they are tested the way configuration is actually applied — by booting a
 * fresh process with that environment and asking it what it picked. `src/config/env`
 * reads process.env once at import, so nothing short of a new process tests this
 * honestly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, 'helpers', 'storageProbe.ts');

/** Environment every case needs before the app's own configuration is even considered. */
const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/media_tool_tests_unused',
  JWT_SECRET: 'test-only-secret-not-used-outside-tests',
  NODE_ENV: 'test',
};

const R2_CREDENTIALS = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
  R2_SECRET_ACCESS_KEY: 'not-a-real-secret-key',
  R2_BUCKET_NAME: 'test-bucket',
};

/**
 * Boots the probe with exactly this environment and returns what it chose.
 *
 * The parent's own variables are deliberately not inherited: a stray STORAGE_PROVIDER or
 * VERCEL in the shell would otherwise decide the outcome of these tests. PATH is passed
 * through because Node needs it to resolve its own loader.
 */
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
        // The probe reports failures on stdout as `ERR:`; a rejection here means the
        // process itself could not run, which is a broken test rather than a result.
        if (err && !stdout) {
          reject(err);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

test('local development selects the local provider', async () => {
  assert.equal(await selectProviderWith({ STORAGE_PROVIDER: 'local' }), 'OK:local');
});

test('an unset STORAGE_PROVIDER still means local, so a fresh checkout just runs', async () => {
  assert.equal(await selectProviderWith({}), 'OK:local');
});

test('STORAGE_PROVIDER=r2 with credentials selects R2', async () => {
  const result = await selectProviderWith({ STORAGE_PROVIDER: 'r2', ...R2_CREDENTIALS });
  assert.equal(result, 'OK:r2');
});

test('R2 without a public base URL is valid — that is the private default', async () => {
  // R2_PUBLIC_BASE_URL is deliberately absent above and here: a private bucket is the
  // recommended setup, and requiring the variable would push people into publishing one.
  const result = await selectProviderWith({ STORAGE_PROVIDER: 'r2', ...R2_CREDENTIALS });
  assert.equal(result, 'OK:r2');
});

test('R2 missing a credential fails by naming every variable it needs', async () => {
  const result = await selectProviderWith({
    STORAGE_PROVIDER: 'r2',
    ...R2_CREDENTIALS,
    R2_SECRET_ACCESS_KEY: '',
  });

  assert.match(result, /^ERR:/);
  for (const name of Object.keys(R2_CREDENTIALS)) {
    assert.ok(result.includes(name), `the error should name ${name}`);
  }
});

test('the error singles out which variable is missing, not just which are required', async () => {
  /**
   * Four variable names in one sentence is a list to diff by eye against a dashboard,
   * which is exactly where a typo'd name survives a careful read. Naming the one that is
   * absent turns that into a single fact to act on.
   */
  const result = await selectProviderWith({
    STORAGE_PROVIDER: 'r2',
    ...R2_CREDENTIALS,
    R2_BUCKET_NAME: '',
  });

  assert.match(result, /Not set: R2_BUCKET_NAME/);
});

/**
 * Every configuration failure here must reach the operator as a 503 carrying its own
 * message. The global error handler replaces an unrecognised error with a bare "Internal
 * server error" in production — correct for an unexpected fault, and the reason a
 * perfectly self-explanatory misconfiguration used to reach the user as five words that
 * name nothing. An upload is where these are hit, so this is what stands between
 * "uploads are broken" and "R2_BUCKET_NAME is not set".
 */
for (const [label, overrides] of [
  ['a missing credential', { STORAGE_PROVIDER: 'r2', ...R2_CREDENTIALS, R2_BUCKET_NAME: '' }],
  ['local storage on a serverless host', { STORAGE_PROVIDER: 'local', VERCEL: '1' }],
  ['an unusable account id', { STORAGE_PROVIDER: 'r2', ...R2_CREDENTIALS, R2_ACCOUNT_ID: 'https://dash.cloudflare.com/x y' }],
] as const) {
  test(`${label} is reported as a readable 503, not an opaque 500`, async () => {
    const result = await selectProviderWith(overrides);
    assert.match(result, /^ERR:503:/, `expected a 503 carrying its own message, got: ${result}`);
  });
}

test('R2_ACCOUNT_ID pasted as the S3 endpoint still works', async () => {
  /**
   * The account id is only ever shown inside that endpoint, so the endpoint is what gets
   * copied. Left unnormalised it produced
   * `https://https://<id>.r2.cloudflarestorage.com.r2.cloudflarestorage.com` and every
   * request against it failed with an SDK error naming neither the variable nor the
   * mistake.
   */
  const result = await selectProviderWith({
    STORAGE_PROVIDER: 'r2',
    ...R2_CREDENTIALS,
    R2_ACCOUNT_ID: `https://${R2_CREDENTIALS.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  });

  assert.equal(result, 'OK:r2');
});

test('an R2_ACCOUNT_ID that is no kind of account id is refused with a hint', async () => {
  // The other thing on that dashboard page is the API token, which is a different
  // credential and not an id at all.
  const result = await selectProviderWith({
    STORAGE_PROVIDER: 'r2',
    ...R2_CREDENTIALS,
    R2_ACCOUNT_ID: 'https://dash.cloudflare.com/some/bucket page',
  });

  assert.match(result, /^ERR:/);
  assert.match(result, /R2_ACCOUNT_ID/);
});

test('local storage on a serverless host is refused, not quietly accepted', async () => {
  /**
   * The failure this whole change exists to prevent. A Vercel Function's filesystem is
   * read-only apart from /tmp, and /tmp goes away with the instance, so this combination
   * either throws EROFS on the first upload or loses the file minutes later. Refusing up
   * front is what turns "my images are broken" into a line in the deployment log.
   */
  const result = await selectProviderWith({ STORAGE_PROVIDER: 'local', VERCEL: '1' });

  assert.match(result, /^ERR:/);
  assert.match(result, /serverless/i);
  assert.ok(result.includes('STORAGE_PROVIDER=r2'), 'the error should say what to set instead');
});

test('the smoke check can opt out of that refusal explicitly', async () => {
  // smoke-vercel.mts runs the deployed shape with no bucket and no credentials on purpose.
  const result = await selectProviderWith({
    STORAGE_PROVIDER: 'local',
    VERCEL: '1',
    ALLOW_LOCAL_STORAGE_ON_SERVERLESS: '1',
  });

  assert.equal(result, 'OK:local');
});
