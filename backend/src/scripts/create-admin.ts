/**
 * Bootstraps an administrator account, or recovers access to one (new password, re-activated,
 * role=admin). Upserts by email, so it can also promote an existing account.
 *
 * Usage:
 *   npm run create-admin -- <email> --prompt     (recommended: asks for the password, hidden)
 *   npm run create-admin -- <email> <password>   (the password ends up in shell history)
 *   npm run create-admin -- <email>              (with ADMIN_PASSWORD_HASH, a bcrypt hash, in the environment)
 *
 * A plaintext password is never read from the environment or .env (ADMIN_PASSWORD is not
 * supported). Replacing the password of an account that is already an administrator asks you
 * to type its email to confirm (or pass --yes when no terminal is attached).
 *
 * This is the only way an account gets role='admin' — public signup, Google and mobile signup
 * always create a plain user, whatever the request says. Nothing is printed but the email.
 */
import readline from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { strongPassword } from '../validators/authValidators';

const USAGE = [
  'Usage: npm run create-admin -- <email> --prompt',
  '       npm run create-admin -- <email> <password>',
  '       npm run create-admin -- <email> (with ADMIN_PASSWORD_HASH, a bcrypt hash, in the environment)',
].join('\n');

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) fail('--prompt needs an interactive terminal.');
  process.stdout.write(question);
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function confirm(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const [argEmail, argPassword] = args.filter((a) => !a.startsWith('--'));
  const usePrompt = flags.has('--prompt');

  const email = (argEmail ?? env.ADMIN_EMAIL)?.trim().toLowerCase();
  if (!email) fail(`${USAGE}\n(or set ADMIN_EMAIL in the environment)`);

  let passwordHash: string;
  if (usePrompt) {
    const first = await promptHidden(`New password for ${email}: `);
    const checked = strongPassword.safeParse(first);
    if (!checked.success) fail(checked.error.issues[0]?.message ?? 'That password is not strong enough.');
    if ((await promptHidden('Repeat it: ')) !== first) fail('The passwords did not match. Nothing was changed.');
    passwordHash = await bcrypt.hash(first, 12);
  } else {
    if (!argPassword && !env.ADMIN_PASSWORD_HASH) {
      fail(`${USAGE}\n(ADMIN_PASSWORD is not read: use --prompt, or a bcrypt ADMIN_PASSWORD_HASH)`);
    }
    if (argPassword) console.warn('Note: a password typed on the command line can end up in shell history; --prompt avoids that.');
    passwordHash = argPassword ? await bcrypt.hash(argPassword, 12) : env.ADMIN_PASSWORD_HASH!;
  }

  await connectDatabase();
  const existing = await User.findOne({ email }).select('+passwordHash');

  if (existing?.role === 'admin' && !flags.has('--yes')) {
    if (!process.stdin.isTTY) fail(`${email} is already an administrator. Re-run with --yes to replace its password.`);
    const typed = await confirm(`${email} is already an administrator. Type its email to replace its password: `);
    if (typed.toLowerCase() !== email) fail('Not confirmed. Nothing was changed.');
  }

  if (existing) {
    existing.name = env.ADMIN_NAME ?? existing.name;
    existing.passwordHash = passwordHash;
    existing.role = 'admin';
    existing.isActive = true;
    // Every session signed in with the old password ends now.
    existing.tokenVersion = (existing.tokenVersion ?? 0) + 1;
    await existing.save();
    console.log(`Updated ${existing.email}: role=admin, active, new password; its other sessions are signed out.`);
  } else {
    const created = await User.create({
      email,
      name: env.ADMIN_NAME ?? 'Administrator',
      passwordHash,
      role: 'admin',
      isActive: true,
      isEmailVerified: true,
    });
    console.log(`Created admin: ${created.email}`);
  }

  await disconnectDatabase();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create/update admin:', err instanceof Error ? err.message : err);
  process.exit(1);
});
