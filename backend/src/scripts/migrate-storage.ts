/**
 * Copies media that is still recorded against local disk into the storage provider that
 * is currently configured (Cloudflare R2 or S3), and repoints its database record.
 *
 * This exists because switching STORAGE_PROVIDER changes where the app *looks* for every
 * file, not just where it puts new ones. Records written while the provider was `local`
 * carry keys like `images/<folderId>/<name>.jpg` that only ever existed in
 * backend/uploads on one machine, so after the switch they resolve to nothing in the
 * bucket and appear in the app as broken thumbnails. This walks those records, uploads
 * the bytes that are still on this machine, and updates each record to say where they
 * now live.
 *
 * Usage (from the repository root):
 *   npm run migrate-storage              # dry run - reports what it *would* do
 *   npm run migrate-storage -- --apply   # actually upload and update records
 *
 * Run it on the machine that still holds backend/uploads, with backend/.env pointing at
 * the SAME MongoDB the deployment uses and at the target bucket:
 *
 *   MONGODB_URI=<the production Atlas URI>
 *   STORAGE_PROVIDER=r2
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 *   UPLOAD_DIR=uploads                   # where the local originals still are
 *
 * What it will not do, by design:
 *   - It never deletes anything. Local files stay where they are, so an interrupted run
 *     leaves the originals intact and can simply be run again.
 *   - It never creates or removes media records. It only updates the fields describing
 *     *where* a file is, and only once those bytes are confirmed in the bucket.
 *   - It never runs on its own. Nothing in the app invokes it, and without --apply it
 *     only reports.
 *
 * Safe to re-run: records already on the target provider are skipped, and a key already
 * present in the bucket is adopted rather than uploaded again. Trashed media is included
 * too - otherwise restoring from the trash after a migration would recover a record
 * pointing at bytes that were never moved.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Media } from '../models/Media';
import { getStorageProvider } from '../services/storage';
import type { StorageService } from '../services/storage';

const THUMBNAIL_CONTENT_TYPE = 'image/webp';

interface Tally {
  migrated: number;
  alreadyThere: number;
  skippedNoLocalFile: number;
  failed: Array<{ id: string; name: string; error: string }>;
}

/** Absolute path a local-provider key maps to on this machine. */
function localPathFor(key: string): string {
  return path.resolve(env.localStorageRoot, key.replace(/^[/\\]+/, ''));
}

/**
 * Uploads one key's bytes from local disk, by way of a temp copy.
 *
 * The copy is not incidental. Every storage provider's `upload` consumes its source file
 * - the local one renames it, the S3 one unlinks it after a successful put - so handing
 * it the original would *move* the local library into the bucket rather than copy it.
 * Working from a throwaway duplicate is what makes this migration non-destructive.
 *
 * Returns false when there is no local file to read: a record whose bytes only ever
 * existed on another machine, which is reported rather than treated as a failure.
 */
async function copyToProvider(
  provider: StorageService,
  key: string,
  contentType: string,
): Promise<boolean> {
  const source = localPathFor(key);
  if (!fs.existsSync(source)) return false;

  await fsp.mkdir(env.tmpDir, { recursive: true });
  const temp = path.join(
    env.tmpDir,
    `migrate-${crypto.randomBytes(8).toString('hex')}${path.extname(key)}`,
  );

  await fsp.copyFile(source, temp);
  try {
    await provider.upload({ key, sourcePath: temp, contentType });
  } finally {
    // `upload` consumes the temp file on success; this only matters when it threw.
    await fsp.unlink(temp).catch(() => undefined);
  }
  return true;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const provider = getStorageProvider();

  if (provider.name === 'local') {
    console.error(
      'STORAGE_PROVIDER is still "local", so there is nowhere to migrate to.\n' +
        'Set STORAGE_PROVIDER=r2 (with the R2_* credentials) in backend/.env and run this again.',
    );
    process.exitCode = 1;
    return;
  }

  await connectDatabase();

  // Everything not already on the target provider, trashed items included.
  const pending = await Media.find({ storageProvider: { $ne: provider.name } }).sort({ createdAt: 1 });

  console.log(`Target provider : ${provider.name}`);
  console.log(`Local originals : ${env.localStorageRoot}`);
  console.log(`Records to move : ${pending.length}`);
  console.log(
    apply
      ? '\nApplying changes.\n'
      : '\nDRY RUN - nothing will be uploaded or changed. Re-run with --apply.\n',
  );

  const tally: Tally = { migrated: 0, alreadyThere: 0, skippedNoLocalFile: 0, failed: [] };

  for (const media of pending) {
    const label = `${media.originalName} (${media._id.toString()})`;

    try {
      // Adopt rather than re-upload: an earlier run may have stored the bytes and failed
      // before saving the record, and re-sending them would only cost time and bandwidth.
      const present = await provider.exists(media.storageKey);

      if (!present && !fs.existsSync(localPathFor(media.storageKey))) {
        console.log(`  skip    ${label} - no local file at ${media.storageKey}`);
        tally.skippedNoLocalFile += 1;
        continue;
      }

      if (!apply) {
        console.log(
          `  would   ${label} - ${present ? 'adopt existing object' : 'upload'} ${media.storageKey}`,
        );
        tally[present ? 'alreadyThere' : 'migrated'] += 1;
        continue;
      }

      if (!present) {
        await copyToProvider(provider, media.storageKey, media.mimeType);
      }

      // A missing thumbnail must never hold up the file it belongs to: it is derived
      // data, and the app already treats a null key as "show the original instead".
      if (media.thumbnailKey) {
        try {
          if (!(await provider.exists(media.thumbnailKey))) {
            const copied = await copyToProvider(provider, media.thumbnailKey, THUMBNAIL_CONTENT_TYPE);
            if (!copied) {
              console.log(`          (no local thumbnail for ${label}; clearing it)`);
              media.thumbnailKey = null;
            }
          }
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          console.log(`          (thumbnail for ${label} could not be moved: ${detail})`);
          media.thumbnailKey = null;
        }
      }

      // Written only after the bytes are confirmed in the bucket, so an interrupted run
      // never leaves a record claiming a file is somewhere it is not.
      media.storageProvider = provider.name;
      media.url = provider.getUrl(media.storageKey);
      await media.save();

      console.log(`  ${present ? 'adopted' : 'moved  '} ${label}`);
      tally[present ? 'alreadyThere' : 'migrated'] += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log(`  FAILED  ${label} - ${message}`);
      tally.failed.push({ id: media._id.toString(), name: media.originalName, error: message });
    }
  }

  console.log('\n--------------------------------------------');
  console.log(`${apply ? 'Uploaded' : 'Would upload'} : ${tally.migrated}`);
  console.log(`Already in bucket  : ${tally.alreadyThere}`);
  console.log(`No local file      : ${tally.skippedNoLocalFile}`);
  console.log(`Failed             : ${tally.failed.length}`);

  if (tally.skippedNoLocalFile > 0) {
    console.log(
      '\nRecords with no local file were left untouched. Their bytes are not on this\n' +
        'machine - run this again from wherever backend/uploads actually holds them, or\n' +
        'delete those items from within the app if the originals are genuinely gone.',
    );
  }

  if (tally.failed.length > 0) {
    console.log('\nFailures (nothing was deleted; safe to re-run):');
    for (const f of tally.failed) console.log(`  - ${f.name} [${f.id}]: ${f.error}`);
    process.exitCode = 1;
  }

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error('\nMigration stopped:', err instanceof Error ? err.message : err);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
