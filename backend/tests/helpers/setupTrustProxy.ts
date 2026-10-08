/**
 * Import after setupTestEnv and before src/config/env: trust one proxy hop, so a test can give
 * each request its own client address through X-Forwarded-For — the way an attack spread over
 * many addresses looks to the server.
 */
process.env.TRUST_PROXY = '1';
