/**
 * One-off migration from the single-admin model to multi-user.
 *
 * Before: one `admins` document owned everything implicitly, and folders/media had no
 * owner field at all. After: every account lives in `users` with a role, and every folder
 * and file carries the ownerId that all queries now filter on.
 *
 * Usage: npm run migrate-to-users
 *
 * Safe to re-run: each step checks whether it has already been applied. Files on disk are
 * never touched — only database documents change.
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { User } from '../models/User';
import { Folder } from '../models/Folder';
import { Media } from '../models/Media';

async function main(): Promise<void> {
  await connectDatabase();
  const db = mongoose.connection;

  // ---------------------------------------------------------------- 1. admins -> users
  const adminDocs = await db
    .collection('admins')
    .find({})
    .toArray()
    .catch(() => []);

  for (const admin of adminDocs) {
    const existing = await User.findOne({ email: String(admin.email).toLowerCase() });
    if (existing) {
      console.log(`users: ${admin.email} already present, skipped`);
      continue;
    }
    // Inserted through the driver, not the model, so the _id is preserved — every
    // createdBy/uploadedBy/performedBy reference in the database still resolves.
    await db.collection('users').insertOne({
      _id: admin._id,
      name: admin.name ?? 'Administrator',
      email: String(admin.email).toLowerCase(),
      passwordHash: admin.passwordHash,
      mobile: null,
      role: 'admin',
      isActive: admin.isActive ?? true,
      isEmailVerified: true,
      lastLoginAt: admin.lastLoginAt ?? undefined,
      lastLoginIp: admin.lastLoginIp ?? undefined,
      createdAt: admin.createdAt ?? new Date(),
      updatedAt: new Date(),
    });
    console.log(`users: migrated ${admin.email} as role=admin`);
  }

  // ---------------------------------------------------- 2. backfill ownerId on content
  const [orphanFolders, orphanMedia] = await Promise.all([
    Folder.countDocuments({ ownerId: { $exists: false } }),
    Media.countDocuments({ ownerId: { $exists: false } }),
  ]);

  if (orphanFolders > 0 || orphanMedia > 0) {
    // Everything that predates multi-user belonged to the single admin account. Prefer the
    // createdBy/uploadedBy already on the document; fall back to the first admin.
    const fallbackOwner = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 });
    if (!fallbackOwner) {
      throw new Error(
        'No admin account found to own the existing folders and files. ' +
          'Run `npm run create-admin` first, then run this migration again.',
      );
    }

    const folderResult = await db.collection('folders').updateMany({ ownerId: { $exists: false } }, [
      { $set: { ownerId: { $ifNull: ['$createdBy', fallbackOwner._id] } } },
    ]);
    const mediaResult = await db.collection('media').updateMany({ ownerId: { $exists: false } }, [
      { $set: { ownerId: { $ifNull: ['$uploadedBy', fallbackOwner._id] } } },
    ]);

    console.log(`folders: set ownerId on ${folderResult.modifiedCount}`);
    console.log(`media:   set ownerId on ${mediaResult.modifiedCount}`);
    console.log(`         (owner defaults to ${fallbackOwner.email} where no creator was recorded)`);
  } else {
    console.log('folders/media: every document already has an ownerId');
  }

  // --------------------------------------------------------------------- 3. indexes
  // The old unique index on (parentFolder, slug) would now stop two different people
  // from each having a folder with the same name.
  const folderIndexes = await db.collection('folders').indexes();
  for (const index of folderIndexes) {
    const keys = Object.keys(index.key);
    if (index.unique && keys.length === 2 && keys.includes('parentFolder') && keys.includes('slug')) {
      await db.collection('folders').dropIndex(index.name!);
      console.log(`folders: dropped obsolete unique index ${index.name}`);
    }
  }

  console.log('\nBuilding current indexes...');
  await Promise.all([User.createIndexes(), Folder.createIndexes(), Media.createIndexes()]);

  const [users, folders, media] = await Promise.all([
    User.countDocuments({}),
    Folder.countDocuments({}),
    Media.countDocuments({}),
  ]);
  console.log(`\nDone. users=${users} folders=${folders} media=${media}`);
  console.log(`Database: ${env.MONGODB_URI.replace(/:\/\/([^:/?#]+):([^@]*)@/, '://$1@')}`);
  console.log('\nThe `admins` collection is left in place as a backup; drop it once you are happy.');

  await disconnectDatabase();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
