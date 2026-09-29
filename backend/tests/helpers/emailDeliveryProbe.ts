/**
 * Boots the real app with whatever EMAIL_PROVIDER/RESEND_API_KEY/etc. it's given, creates
 * one active user, and calls POST /forgot-password for both that real email and a made-up
 * one — reporting each response's status and message as JSON so the parent test can
 * assert the config-error path is loud and, crucially, identical for both. See
 * emailDeliveryFailure.test.ts for why the second part matters: a config error that only
 * ever fires for a real account (because it's thrown after the user lookup) would be an
 * enumeration side-channel, not a fix.
 *
 * Runs as its own process for the same reason storageProbe.ts and emailProbe.ts do:
 * config/env reads process.env once at import.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

async function main(): Promise<void> {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());

  const [{ createApp }, { User }, { default: bcrypt }] = await Promise.all([
    import('../../src/app'),
    import('../../src/models/User'),
    import('bcryptjs'),
  ]);

  await User.create({
    name: 'Probe User',
    email: 'real-account@example.com',
    passwordHash: await bcrypt.hash('whatever-password-1', 10),
  });

  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${port}`;

  const call = async (email: string) => {
    const res = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const body = (await res.json()) as { error?: { message?: string } };
    return { status: res.status, message: body.error?.message ?? '' };
  };

  const real = await call('real-account@example.com');
  const fake = await call('no-such-account@example.com');

  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();

  /**
   * Wrapped in markers rather than written bare: morgan logs every request to stdout,
   * and a 503 also makes the app's own error logger write to stderr (see
   * errorHandler.ts's `if (err.statusCode >= 500) logger.error(...)`) — so neither stream
   * is exclusively this probe's result. The parent test pulls the JSON out from between
   * the markers instead of parsing a whole stream.
   */
  process.stderr.write(`<<<PROBE_RESULT>>>${JSON.stringify({ real, fake })}<<<END_PROBE_RESULT>>>`);
}

void main();
