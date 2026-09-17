/**
 * Bootstraps (or resets) the single admin account from environment variables.
 * Safe to re-run: it upserts by email, so it can also be used to rotate the
 * admin password later (update .env and re-run).
 *
 * Usage: npm run create-admin -- <email> <password>
 *        npm run create-admin                  (falls back to .env)
 *
 * Passing the credentials as arguments keeps the plaintext password out of .env.
 * Otherwise reads ADMIN_EMAIL, ADMIN_NAME and either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Admin } from '../models/Admin';

async function main() {
  const [argEmail, argPassword] = process.argv.slice(2);

  const email = argEmail ?? env.ADMIN_EMAIL;
  if (!email) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    console.error('(or set ADMIN_EMAIL in backend/.env)');
    process.exit(1);
  }
  if (!argPassword && !env.ADMIN_PASSWORD && !env.ADMIN_PASSWORD_HASH) {
    console.error('Usage: npm run create-admin -- <email> <password>');
    console.error('(or set ADMIN_PASSWORD / ADMIN_PASSWORD_HASH in backend/.env)');
    process.exit(1);
  }

  const plainPassword = argPassword ?? env.ADMIN_PASSWORD;
  const passwordHash = plainPassword
    ? await bcrypt.hash(plainPassword, 12)
    : env.ADMIN_PASSWORD_HASH!;

  await connectDatabase();

  const existing = await Admin.findOne({ email: email.toLowerCase() });

  if (existing) {
    existing.name = env.ADMIN_NAME ?? existing.name;
    existing.passwordHash = passwordHash;
    existing.isActive = true;
    await existing.save();
    console.log(`Updated existing admin: ${existing.email}`);
  } else {
    const created = await Admin.create({
      email: email.toLowerCase(),
      name: env.ADMIN_NAME ?? 'Administrator',
      passwordHash,
      isActive: true,
    });
    console.log(`Created admin: ${created.email}`);
  }

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create/update admin:', err);
  process.exit(1);
});
