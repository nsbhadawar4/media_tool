/**
 * Bootstraps (or resets) the single admin account from environment variables.
 * Safe to re-run: it upserts by email, so it can also be used to rotate the
 * admin password later (update .env and re-run).
 *
 * Usage: npm run create-admin
 * Requires in .env: ADMIN_EMAIL, ADMIN_NAME, and either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH.
 */
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Admin } from '../models/Admin';

async function main() {
  if (!env.ADMIN_EMAIL) {
    console.error('ADMIN_EMAIL is required in .env');
    process.exit(1);
  }
  if (!env.ADMIN_PASSWORD && !env.ADMIN_PASSWORD_HASH) {
    console.error('Provide either ADMIN_PASSWORD or ADMIN_PASSWORD_HASH in .env');
    process.exit(1);
  }

  const passwordHash = env.ADMIN_PASSWORD_HASH ?? (await bcrypt.hash(env.ADMIN_PASSWORD!, 12));

  await connectDatabase();

  const existing = await Admin.findOne({ email: env.ADMIN_EMAIL.toLowerCase() });

  if (existing) {
    existing.name = env.ADMIN_NAME ?? existing.name;
    existing.passwordHash = passwordHash;
    existing.isActive = true;
    await existing.save();
    console.log(`Updated existing admin: ${existing.email}`);
  } else {
    const created = await Admin.create({
      email: env.ADMIN_EMAIL.toLowerCase(),
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
