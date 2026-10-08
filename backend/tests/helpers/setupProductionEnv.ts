/** Import after setupTestEnv and before src/config/env: runs this file's app as production would. */
process.env.NODE_ENV = 'production';
process.env.SMS_PROVIDER = 'mock';
