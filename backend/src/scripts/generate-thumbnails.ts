/**
 * Backfills thumbnails for media uploaded before thumbnail generation existed.
 *
 * Only images can be processed here: a video thumbnail comes from a poster frame the
 * browser captures at upload time, and there is no ffmpeg dependency to recover one
 * after the fact. Already-thumbnailed items are skipped, so this is safe to re-run.
 *
 * Usage: npm run generate-thumbnails [-- --force]
 *   --force  regenerate even for media that already has a thumbnail
 */
import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Media } from '../models/Media';
import { getStorageProvider } from '../services/storage';
import { generateThumbnail } from '../services/thumbnailService';

/**
 * Copies a stored object to a local temp file. Thumbnailing needs a real path on disk
 * (sharp streams from one), and the provider may be a remote bucket rather than local disk.
 */
async function downloadToTemp(storageKey: string): Promise<string> {
  const tempPath = path.join(env.tmpDir, `backfill-${crypto.randomBytes(8).toString('hex')}${path.extname(storageKey)}`);
  const { stream } = await getStorageProvider().getObjectStream(storageKey);
  await pipeline(stream, createWriteStream(tempPath));
  return tempPath;
}

async function main() {
  const force = process.argv.includes('--force');

  await connectDatabase();
  await fsp.mkdir(env.tmpDir, { recursive: true });

  const filter: Record<string, unknown> = { fileType: 'image', isDeleted: false };
  if (!force) filter.thumbnailKey = null;

  const items = await Media.find(filter).select('_id originalName storedName storageKey');
  if (items.length === 0) {
    console.log('Nothing to do — every image already has a thumbnail.');
    await disconnectDatabase();
    return;
  }

  console.log(`Generating thumbnails for ${items.length} image${items.length === 1 ? '' : 's'}…`);

  let generated = 0;
  let skipped = 0;

  for (const media of items) {
    let tempPath: string | null = null;
    try {
      tempPath = await downloadToTemp(media.storageKey);
      // generateThumbnail consumes the temp file on success; clean up whatever remains.
      const thumbnailKey = await generateThumbnail({ sourcePath: tempPath, storedName: media.storedName });

      if (thumbnailKey) {
        await Media.updateOne({ _id: media._id }, { thumbnailKey });
        generated += 1;
        console.log(`  ✓ ${media.originalName}`);
      } else {
        skipped += 1;
        console.log(`  – ${media.originalName} (could not be decoded)`);
      }
    } catch (err) {
      skipped += 1;
      console.log(`  ! ${media.originalName}: ${err instanceof Error ? err.message : err}`);
    } finally {
      if (tempPath) await fsp.unlink(tempPath).catch(() => undefined);
    }
  }

  console.log(`\nDone. ${generated} generated, ${skipped} skipped.`);
  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
