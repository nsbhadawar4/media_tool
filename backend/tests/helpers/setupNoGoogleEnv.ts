/**
 * Import after setupTestEnv and before src/config/env. An empty value (rather than deleting it)
 * also stops dotenv from filling GOOGLE_CLIENT_ID in from a developer's real backend/.env.
 */
process.env.GOOGLE_CLIENT_ID = '';
