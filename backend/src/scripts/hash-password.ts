/**
 * Utility: hash a plaintext password with bcrypt so it can be pasted into
 * ADMIN_PASSWORD_HASH in .env without ever writing the plaintext password to disk.
 *
 * Usage: npm run hash-password -- "your-password"
 */
import bcrypt from 'bcryptjs';

async function main() {
  const password = process.argv[2];
  if (!password) {
    console.error('Usage: npm run hash-password -- "your-password"');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  console.log('\nBcrypt hash (copy into ADMIN_PASSWORD_HASH):\n');
  console.log(hash);
  console.log();
}

main();
