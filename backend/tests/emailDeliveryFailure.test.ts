/**
 * A misconfigured email provider must fail loudly, not silently report success while
 * sending nothing.
 *
 * This is the bug fixed in this change: getEmailProvider() used to be called inside the
 * same try/catch that swallows a per-send delivery failure, so a deployment with
 * EMAIL_PROVIDER=resend and no RESEND_API_KEY got a 200 "code has been sent" on every
 * request while never sending a single email. Boots the real app in a fresh process per
 * case, the same way storageSelection.test.ts and emailSelection.test.ts pin down their
 * factories, since config/env reads process.env once at import.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROBE = path.join(HERE, 'helpers', 'emailDeliveryProbe.ts');

/**
 * MONGODB_URI is required just to satisfy config/env's synchronous validation at import —
 * the probe connects to its own throwaway MongoMemoryServer instead and never touches this.
 */
const BASE_ENV = {
  MONGODB_URI: 'mongodb://127.0.0.1:27017/media_tool_tests_unused',
  JWT_SECRET: 'test-only-secret-not-used-outside-tests',
  NODE_ENV: 'test',
};

interface ProbeResult {
  real: { status: number; message: string };
  fake: { status: number; message: string };
}

function runProbeWith(overrides: Record<string, string>): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', PROBE],
      {
        // See emailSelection.test.ts: `tests/helpers/`, not `backend/` — dotenv would
        // otherwise silently fill in whatever `overrides` doesn't set (EMAIL_PROVIDER,
        // most importantly) from the real .env there, while still resolving `tsx` by
        // walking up to backend/node_modules.
        cwd: path.join(HERE, 'helpers'),
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...BASE_ENV, ...overrides },
      },
      (err, _stdout, stderr) => {
        const match = /<<<PROBE_RESULT>>>(.*)<<<END_PROBE_RESULT>>>/s.exec(stderr);
        if (!match) {
          reject(err ?? new Error(`Probe produced no result. stderr:\n${stderr}`));
          return;
        }
        resolve(JSON.parse(match[1]!) as ProbeResult);
      },
    );
  });
}

test('EMAIL_PROVIDER=resend with no RESEND_API_KEY fails loudly, for a real account', async () => {
  const { real } = await runProbeWith({ EMAIL_PROVIDER: 'resend' });
  assert.equal(real.status, 503, 'a misconfigured provider must not report success');
  assert.match(real.message, /RESEND_API_KEY/);
});

test('...and answers a non-existent email with the exact same error', async () => {
  /**
   * The property that actually matters: if the config error only fired after a "does
   * this account exist" lookup, a misconfigured deployment would 503 for real accounts
   * and 200 for made-up ones — turning the bug's own fix into a new enumeration
   * side-channel. Resolving the provider before the lookup is what this guards.
   */
  const { real, fake } = await runProbeWith({ EMAIL_PROVIDER: 'resend' });
  assert.equal(real.status, fake.status);
  assert.equal(real.message, fake.message);
});

test('EMAIL_PROVIDER=smtp with no SMTP_HOST fails loudly too, naming what is missing', async () => {
  const { real } = await runProbeWith({ EMAIL_PROVIDER: 'smtp' });
  assert.equal(real.status, 503);
  assert.match(real.message, /SMTP_HOST/);
});

test('a correctly configured provider (console, the test default) still answers 200', async () => {
  const { real, fake } = await runProbeWith({});
  assert.equal(real.status, 200, 'the fix must not break the working case');
  assert.equal(fake.status, 200);
  assert.equal(real.message, fake.message);
});
