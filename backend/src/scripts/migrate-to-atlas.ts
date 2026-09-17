/**
 * Copies everything from the built-in local database into whatever MONGODB_URI now
 * points at (MongoDB Atlas), so moving off the old local-development database does
 * not leave your folders and uploads behind.
 *
 * Usage:
 *   1. Put the real Atlas connection string in backend/.env
 *   2. npm run migrate-to-atlas
 *
 * Safe to re-run: documents are matched by _id and skipped if already present, so a
 * second run copies only what is missing rather than duplicating anything.
 *
 * Files on disk are NOT touched — they live in backend/uploads either way, and the
 * database only ever held their metadata.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { startLocalMongo, stopLocalMongo } from '../config/localMongo';

const COLLECTIONS = ['admins', 'folders', 'media', 'activitylogs'] as const;

async function main(): Promise<void> {
  const target = env.MONGODB_URI.trim();

  if (target.includes('127.0.0.1') || target.includes('localhost')) {
    console.error(
      'MONGODB_URI still points at a database on this machine, so there is nowhere to\n' +
        'migrate to. Put your MongoDB Atlas connection string in backend/.env first,\n' +
        'then run this again.',
    );
    process.exit(1);
  }

  const source = await startLocalMongo();
  console.log('Source (local): ' + source);
  console.log('Target        : ' + target.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:***@'));

  const from = await mongoose.createConnection(source).asPromise();
  const to = await mongoose.createConnection(target).asPromise();
  console.log('Connected to both databases.\n');

  let totalCopied = 0;

  for (const name of COLLECTIONS) {
    const docs = await from.collection(name).find({}).toArray();
    if (docs.length === 0) {
      console.log(`${name}: nothing to copy`);
      continue;
    }

    const existingIds = new Set(
      (await to.collection(name).find({}, { projection: { _id: 1 } }).toArray()).map((d) =>
        String(d._id),
      ),
    );
    const fresh = docs.filter((d) => !existingIds.has(String(d._id)));

    if (fresh.length > 0) {
      await to.collection(name).insertMany(fresh, { ordered: false });
    }
    totalCopied += fresh.length;
    const skipped = docs.length - fresh.length;
    console.log(`${name}: copied ${fresh.length}` + (skipped ? `, skipped ${skipped} already there` : ''));
  }

  // Mongoose builds each model's indexes on first use, but doing it here means the very
  // first request against Atlas is not the one paying for it.
  console.log('\nBuilding indexes on the target...');
  const { Admin } = await import('../models/Admin');
  const { Folder } = await import('../models/Folder');
  const { Media } = await import('../models/Media');
  const { ActivityLog } = await import('../models/ActivityLog');
  for (const model of [Admin, Folder, Media, ActivityLog]) {
    await to.model(model.modelName, model.schema).createIndexes();
  }

  console.log(`\nDone. ${totalCopied} document(s) copied.`);
  console.log('Your uploaded files stay in backend/uploads — nothing there needs moving.');

  await from.close();
  await to.close();
  await stopLocalMongo();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  await stopLocalMongo().catch(() => undefined);
  process.exit(1);
});
