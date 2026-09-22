/**
 * Reports which media records still have the bytes they describe, and repairs what can be
 * repaired without destroying anything.
 *
 * Uploads can no longer produce a record without a verified object behind it, but records
 * written before that was true still exist, and nothing stops a file being removed from a
 * bucket or a database behind the app's back. Those show up in the gallery as a tile that
 * never loads. This says how many there are and which they are, so the answer is a list
 * rather than a scroll through the library.
 *
 * Usage (from the repository root):
 *   npm run verify-storage                      # report only, changes nothing
 *   npm run verify-storage -- --checksum        # also re-hash objects that recorded one
 *   npm run verify-storage -- --fix-thumbnails  # regenerate previews that are missing
 *   npm run verify-storage -- --trash-missing   # move records with no bytes to the trash
 *
 * What it will not do, by design:
 *   - It never deletes a media record or a stored object. `--trash-missing` moves records
 *     to the trash, which is reversible from the app, and even that is opt-in.
 *   - It never runs on its own. Nothing in the application invokes it.
 *   - Without a flag it only reads.
 *
 * Run it with backend/.env pointing at the database and storage you want to check.
 */
import path from 'node:path';
import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { env } from '../config/env';
import { connectDatabase, disconnectDatabase } from '../config/database';
import { Media, type IMedia } from '../models/Media';
import { getStorageProvider } from '../services/storage';
import { generateThumbnail } from '../services/thumbnailService';

type Verdict = 'ok' | 'legacy-provider' | 'missing' | 'size-mismatch' | 'checksum-mismatch' | 'unreadable';

interface Finding {
  media: IMedia;
  verdict: Verdict;
  detail: string;
  thumbnailMissing: boolean;
}

const args = new Set(process.argv.slice(2));
const withChecksum = args.has('--checksum');
const fixThumbnails = args.has('--fix-thumbnails');
const trashMissing = args.has('--trash-missing');

/** Streams an object through SHA-256 without holding it in memory. */
async function hashStoredObject(storageKey: string): Promise<string> {
  const { stream } = await getStorageProvider().getObjectStream(storageKey);
  const hash = createHash('sha256');
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

async function inspect(media: IMedia): Promise<Finding> {
  const provider = getStorageProvider();
  const base = { media, thumbnailMissing: false };

  /**
   * Reported before anything is looked up, because "not found" would be a true answer to
   * the wrong question. A record written while STORAGE_PROVIDER was `local` names a path
   * on one machine's disk; read by a deployment using GridFS it resolves to nothing, and
   * calling that missing sends people hunting for a data-loss bug when the bytes are
   * sitting safely in backend/uploads waiting to be migrated.
   */
  if (media.storageProvider !== provider.name) {
    return { ...base, verdict: 'legacy-provider', detail: `stored by "${media.storageProvider}"` };
  }

  let stat;
  try {
    stat = await provider.stat(media.storageKey);
  } catch (err) {
    return { ...base, verdict: 'unreadable', detail: err instanceof Error ? err.message : String(err) };
  }

  if (!stat) return { ...base, verdict: 'missing', detail: media.storageKey };

  // A thumbnail is checked separately: its absence is a cosmetic fault on a file that is
  // otherwise intact, and it is the one thing here that can be put right automatically.
  let thumbnailMissing = false;
  if (media.thumbnailKey) {
    thumbnailMissing = (await provider.stat(media.thumbnailKey).catch(() => null)) === null;
  } else if (media.fileType === 'image') {
    thumbnailMissing = true;
  }

  if (stat.size !== media.size) {
    return {
      ...base,
      thumbnailMissing,
      verdict: 'size-mismatch',
      detail: `stored ${stat.size} bytes, record says ${media.size}`,
    };
  }

  if (withChecksum && media.checksum) {
    try {
      const actual = await hashStoredObject(media.storageKey);
      if (actual !== media.checksum) {
        return { ...base, thumbnailMissing, verdict: 'checksum-mismatch', detail: actual };
      }
    } catch (err) {
      return {
        ...base,
        thumbnailMissing,
        verdict: 'unreadable',
        detail: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return { ...base, thumbnailMissing, verdict: 'ok', detail: '' };
}

/** Pulls an object to a temp file so sharp can read it; thumbnailing needs a real path. */
async function downloadToTemp(storageKey: string): Promise<string> {
  const target = path.join(
    env.tmpDir,
    `verify-${crypto.randomBytes(8).toString('hex')}${path.extname(storageKey)}`,
  );
  const { stream } = await getStorageProvider().getObjectStream(storageKey);
  await pipeline(stream, createWriteStream(target));
  return target;
}

async function regenerateThumbnail(media: IMedia): Promise<boolean> {
  let localCopy: string | null = null;
  try {
    localCopy = await downloadToTemp(media.storageKey);
    const key = await generateThumbnail({ sourcePath: localCopy, storedName: media.storedName });
    if (!key) return false;
    media.thumbnailKey = key;
    await media.save();
    return true;
  } catch {
    return false;
  } finally {
    if (localCopy) await fsp.unlink(localCopy).catch(() => undefined);
  }
}

async function main(): Promise<void> {
  await connectDatabase();
  await fsp.mkdir(env.tmpDir, { recursive: true });

  const provider = getStorageProvider();
  console.log(`Checking media against storage provider "${provider.name}"`);
  if (!withChecksum) console.log('(pass --checksum to also re-hash objects that recorded one)');

  // Trashed media is included: restoring a file whose bytes are gone would put a broken
  // tile straight back into the library, so it is worth knowing about now.
  const all = await Media.find({}).sort({ createdAt: 1 });
  console.log(`${all.length} media record(s) to check\n`);

  const findings: Finding[] = [];
  for (const media of all) {
    findings.push(await inspect(media));
  }

  const legacy = findings.filter((f) => f.verdict === 'legacy-provider');
  const broken = findings.filter((f) => f.verdict !== 'ok' && f.verdict !== 'legacy-provider');
  const thumbnailGaps = findings.filter((f) => f.verdict === 'ok' && f.thumbnailMissing);

  for (const finding of broken) {
    const { media, verdict, detail } = finding;
    console.log(
      `  ${verdict.padEnd(17)} ${media._id.toString()}  ${media.originalName}${detail ? `  — ${detail}` : ''}`,
    );
  }

  for (const { media, detail } of legacy) {
    console.log(`  legacy-provider    ${media._id.toString()}  ${media.originalName}  — ${detail}`);
  }

  console.log(
    `\n${findings.length - broken.length - legacy.length} intact, ${broken.length} with a problem, ` +
      `${legacy.length} on another storage backend, ${thumbnailGaps.length} missing only a preview`,
  );

  if (legacy.length > 0) {
    /**
     * Said loudly, because it is the one finding here that looks like data loss and is not.
     * These records name bytes that a different provider holds — most often a developer's
     * `backend/uploads`, when one database is shared with a deployment that uses GridFS.
     * The files are intact; they are simply somewhere this deployment cannot reach.
     */
    console.log(
      `\n${legacy.length} record(s) were written against a different storage provider. Their bytes\n` +
        'are not lost — they are wherever that provider put them. Run the migration from the\n' +
        'machine that still holds them:\n\n' +
        `    STORAGE_PROVIDER=${provider.name} npm run migrate-storage            # dry run\n` +
        `    STORAGE_PROVIDER=${provider.name} npm run migrate-storage -- --apply\n`,
    );
  }

  if (fixThumbnails && thumbnailGaps.length > 0) {
    console.log('\nRegenerating previews…');
    let repaired = 0;
    for (const { media } of thumbnailGaps) {
      if (media.fileType !== 'image') continue; // a video's still cannot be recovered here
      if (await regenerateThumbnail(media)) repaired += 1;
    }
    console.log(`  ${repaired} preview(s) regenerated`);
  } else if (thumbnailGaps.length > 0) {
    console.log('  (pass --fix-thumbnails to regenerate those previews)');
  }

  // Deliberately excludes legacy-provider records: those are recoverable by migration,
  // and trashing them would turn a fixable configuration gap into lost user data.
  const gone = broken.filter((f) => f.verdict === 'missing');
  if (trashMissing && gone.length > 0) {
    console.log('\nMoving records with no stored bytes to the trash…');
    for (const { media } of gone) {
      media.isDeleted = true;
      media.deletedAt = new Date();
      media.deletedCascadeRoot = null;
      await media.save();
    }
    console.log(`  ${gone.length} record(s) moved to the trash — recoverable from the app`);
  } else if (gone.length > 0) {
    console.log('  (pass --trash-missing to move those records to the trash; nothing is deleted)');
  }

  await disconnectDatabase();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDatabase().catch(() => undefined);
  process.exitCode = 1;
});
