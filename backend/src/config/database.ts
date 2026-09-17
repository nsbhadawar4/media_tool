import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

/**
 * Everything the app stores lives in the MongoDB deployment named by MONGODB_URI —
 * there is deliberately no local or embedded fallback. A fallback would let the server
 * come up healthy while writing somewhere nobody is looking, which is exactly the
 * failure that is impossible to spot from inside the application.
 */

/** Host + database name only: the credentials in the URI must never reach a log. */
function describeTarget(uri: string): string {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, '') || '(default database)';
    return `${parsed.host}/${dbName}`;
  } catch {
    return '(unparseable connection string)';
  }
}

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error', err);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });

  const target = describeTarget(env.MONGODB_URI);
  logger.info(`Connecting to MongoDB at ${target}...`);

  try {
    await mongoose.connect(env.MONGODB_URI, {
      // Fail in seconds rather than hanging for the 30s default, so a wrong password or a
      // missing Atlas IP allowlist entry surfaces as an error instead of a silent stall.
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 45_000,
      retryWrites: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Could not connect to MongoDB at ${target}`);

    if (/authentication failed|bad auth/i.test(message)) {
      logger.error('The username or password in MONGODB_URI was rejected by the server.');
      logger.error('If the password contains @ : / ? # or %, it must be URL-encoded (@ -> %40).');
    } else if (/ENOTFOUND|querySrv|getaddrinfo/i.test(message)) {
      logger.error('The cluster hostname in MONGODB_URI could not be resolved. Check it for typos.');
    } else if (/timed out|ETIMEDOUT|ServerSelection/i.test(message)) {
      logger.error(
        'No response from the cluster. In MongoDB Atlas, add this machine to Network Access ' +
          '(Atlas -> Network Access -> Add IP Address).',
      );
    }

    throw err;
  }

  logger.info('MongoDB connected successfully');
  logger.info(`Database: ${target}`);
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
