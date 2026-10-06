import fs from 'node:fs';
import { logger } from './utils/logger';

/**
 * The application modules are imported inside bootstrap() rather than at the top of this
 * file, because config/env validates the environment the moment it is loaded and throws
 * when something is missing. A static import would raise that during module evaluation —
 * before any code here runs, out of reach of the catch below, and surfacing as a raw
 * stack trace instead of the message config/env already printed. Loading them here keeps
 * the failure catchable, so a missing MONGODB_URI still ends in one clear line and exit
 * code 1. (utils/logger is imported statically on purpose: it reads no configuration.)
 */
async function bootstrap(): Promise<void> {
  /**
   * Awaited one at a time rather than through Promise.all. Node evicts a module from the
   * require cache when it throws while being evaluated, so loading these concurrently
   * would re-evaluate config/env once per import and print the same diagnostic three
   * times. Sequential loading stops at the first failure, which is the only one that
   * matters. The cost is three cached requires at startup.
   */
  const { env } = await import('./config/env');
  const { createApp } = await import('./app');
  const { connectDatabase, disconnectDatabase, isTransientConnectionError } = await import(
    './config/database'
  );

  // Ensure local-dev directories exist regardless of which storage provider is active,
  // since multer always writes incoming uploads to tmp/ first.
  fs.mkdirSync(env.tmpDir, { recursive: true });
  if (env.STORAGE_PROVIDER === 'local') {
    fs.mkdirSync(env.localStorageRoot, { recursive: true });
  }

  /**
   * A cluster that does not answer is retried rather than fatal. One slow handshake (a
   * flaky Wi-Fi or mobile connection is enough) used to end the process, and under
   * `tsx watch` nothing restarts it until a file changes, so the frontend went on reporting
   * "could not reach the server" with no backend behind it. Errors that will fail the same
   * way every time, such as a wrong password, still exit straight away.
   */
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; ; attempt++) {
    try {
      await connectDatabase();
      break;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS || !isTransientConnectionError(err)) throw err;
      const delayMs = Math.min(2_000 * attempt, 10_000);
      logger.warn(`Retrying MongoDB connection in ${delayMs / 1000}s (attempt ${attempt + 1} of ${MAX_ATTEMPTS})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`media_tool API listening on port ${env.PORT} [${env.NODE_ENV}]`);
    logger.info(`Storage provider: ${env.STORAGE_PROVIDER}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err: unknown) => {
  /**
   * A configuration error has already printed exactly what is wrong and how to fix it,
   * so re-logging it with a stack trace would only bury that. Anything else is genuinely
   * unexpected and gets reported in full.
   */
  const message = err instanceof Error ? err.message : String(err);
  if (!message.startsWith('Invalid environment configuration')) {
    logger.error('Failed to start server', err);
  }
  process.exit(1);
});
