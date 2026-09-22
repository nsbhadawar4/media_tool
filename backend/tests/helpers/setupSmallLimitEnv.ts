/**
 * The standard test environment, with a 1 MB upload ceiling.
 *
 * Exists so the "too large" rejection can be exercised against a 2 MB file rather than a
 * 500 MB one. Lowering the limit is the honest way to test it: the check reads
 * MAX_FILE_SIZE_MB, so a small value tests the real code path, where building a
 * half-gigabyte fixture would test the same path at a cost no suite should pay.
 *
 * Must be the first import in any test file that uses it — `src/config/env` reads
 * process.env once, when it is first imported.
 */
import '../setupTestEnv';

process.env.MAX_FILE_SIZE_MB = '1';
