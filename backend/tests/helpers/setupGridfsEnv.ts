/**
 * The standard test environment, storing files in MongoDB instead of on disk.
 *
 * setupTestEnv forces STORAGE_PROVIDER=local unconditionally, which is right for the
 * suites that assert against a storage root on disk and wrong for the one that has to
 * exercise what production actually runs. Overriding it afterwards works because
 * `src/config/env` reads process.env once, when it is first imported — which is why this
 * has to be the first import in the file that uses it.
 */
import '../setupTestEnv';

process.env.STORAGE_PROVIDER = 'gridfs';
