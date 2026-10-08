/**
 * Must be imported after setupTestEnv and before anything that reads src/config/env: it gives
 * the Google-auth tests a (fake, never-contacted) OAuth client ID so the feature is enabled.
 */
process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
