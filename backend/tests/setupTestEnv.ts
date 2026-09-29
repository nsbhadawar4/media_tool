/**
 * Environment for the test suite. **Must be imported before anything that reads
 * `src/config/env`** — ES modules are evaluated in import order, so importing this first
 * is what makes the assignments below take effect.
 *
 * The critical line is UPLOAD_DIR. The tests assert that files really are and are
 * not deleted, so they wipe the storage root between cases. `env.localStorageRoot`
 * defaults to `./uploads` — the actual media library — so a run without this override
 * would delete every photo the installation holds. It is therefore forced to a throwaway
 * directory unconditionally, ignoring any value from the shell or a .env file: there is no
 * legitimate reason to point these tests at real storage, and no way to opt in by mistake.
 */
import os from 'node:os';
import path from 'node:path';

process.env.UPLOAD_DIR = path.join(os.tmpdir(), `media-tool-tests-${process.pid}`);
/**
 * Per-process for the same reason, one step further on: the suites run in parallel and
 * several of them assert that a failed upload leaves no temp file behind. Sharing one
 * scratch directory would have each of them watching the others' uploads go past.
 */
process.env.TMP_DIR = path.join(os.tmpdir(), `media-tool-tests-tmp-${process.pid}`);
process.env.STORAGE_PROVIDER = 'local';
/**
 * Same reasoning as STORAGE_PROVIDER above, for the same failure mode: without this, a
 * developer's real backend/.env setting EMAIL_PROVIDER=resend (or smtp) — needed for
 * actually receiving password-reset emails locally — would leak into every test process
 * here too, since dotenv only fills in what isn't already set. A test expecting the
 * `console` default would then hit a live "RESEND_API_KEY not set" config error instead,
 * for a reason that has nothing to do with what it's testing.
 */
process.env.EMAIL_PROVIDER = 'console';

// Each suite starts its own in-memory MongoDB and connects to that; this only has to
// satisfy env validation at import time.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/media_tool_tests_unused';
process.env.JWT_SECRET ??= 'test-only-secret-not-used-outside-tests';
process.env.NODE_ENV = 'test';
