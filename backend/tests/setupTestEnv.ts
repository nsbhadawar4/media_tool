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

// Each suite starts its own in-memory MongoDB and connects to that; this only has to
// satisfy env validation at import time.
process.env.MONGODB_URI ??= 'mongodb://127.0.0.1:27017/media_tool_tests_unused';
process.env.JWT_SECRET ??= 'test-only-secret-not-used-outside-tests';
process.env.NODE_ENV = 'test';
