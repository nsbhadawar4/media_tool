import fs from 'node:fs';
import { createApp } from './app';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { logger } from './utils/logger';

async function bootstrap(): Promise<void> {
  // Ensure local-dev directories exist regardless of which storage provider is active,
  // since multer always writes incoming uploads to tmp/ first.
  fs.mkdirSync(env.tmpDir, { recursive: true });
  if (env.STORAGE_PROVIDER === 'local') {
    fs.mkdirSync(env.localStorageRoot, { recursive: true });
  }

  await connectDatabase();

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

bootstrap().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
