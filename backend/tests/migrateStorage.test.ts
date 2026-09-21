/**
 * Holds the local-to-bucket migration to the promises its documentation makes.
 *
 * This is the one script in the project pointed at a real media library and a real
 * bucket at the same time, and the person running it will be running it against the only
 * copy of their photos. Every provider's `upload` consumes its source file, so the script
 * working from a temp duplicate rather than the original is the single line standing
 * between "copied to R2" and "moved off this machine". That is asserted here, by running
 * the script for real and then checking the local files are still on disk.
 *
 * It is spawned as a process rather than imported, because that is how it is used and
 * because it reads its configuration once at import, like every other entry point.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startFakeS3, type FakeS3 } from './helpers/fakeS3';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND = path.join(HERE, '..');
const SCRIPT = path.join(BACKEND, 'src', 'scripts', 'migrate-storage.ts');
const BUCKET = 'media-tool-test';

const OWNER = '6aab87a711540c1852a355f3';
const PHOTO_KEY = 'images/unfiled/holiday.jpg';
const THUMB_KEY = 'thumbnails/holiday.webp';
const ORPHAN_KEY = 'images/unfiled/only-on-another-machine.jpg';

let bucket: FakeS3;
let mongo: MongoMemoryServer;
let uploadsDir: string;
let mongoUri: string;

/** Environment the script runs under: this bucket, this database, this uploads folder. */
function scriptEnv(): Record<string, string> {
  return {
    PATH: process.env.PATH ?? '',
    SystemRoot: process.env.SystemRoot ?? '',
    NODE_ENV: 'test',
    MONGODB_URI: mongoUri,
    JWT_SECRET: 'test-only-secret-not-used-outside-tests',
    UPLOAD_DIR: uploadsDir,
    STORAGE_PROVIDER: 's3',
    S3_REGION: 'auto',
    S3_BUCKET_NAME: BUCKET,
    S3_ACCESS_KEY_ID: 'AKIAEXAMPLEEXAMPLE',
    S3_SECRET_ACCESS_KEY: 'not-a-real-secret-key',
    S3_ENDPOINT: bucket.endpoint,
    S3_FORCE_PATH_STYLE: 'true',
  };
}

function runMigration(args: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', SCRIPT, ...args],
      { cwd: BACKEND, env: scriptEnv() },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          reject(new Error(`${err.message}\n${stderr}`));
          return;
        }
        resolve(stdout);
      },
    );
  });
}

/** Writes a local file at the path a storage key maps to under UPLOAD_DIR. */
async function writeLocalFile(key: string, contents: Buffer): Promise<string> {
  const full = path.join(uploadsDir, key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, contents);
  return full;
}

before(async () => {
  bucket = await startFakeS3(BUCKET);
  mongo = await MongoMemoryServer.create();
  mongoUri = mongo.getUri('media_tool_migrate_tests');
  uploadsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'media-tool-migrate-'));

  process.env.MONGODB_URI = mongoUri;
  process.env.JWT_SECRET = 'test-only-secret-not-used-outside-tests';
  process.env.NODE_ENV = 'test';

  const mongoose = await import('mongoose');
  await mongoose.default.connect(mongoUri);
});

after(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.disconnect();
  await mongo.stop();
  await bucket.close();
  await fsp.rm(uploadsDir, { recursive: true, force: true });
});

/** Two records written while the provider was `local`, one of whose files is missing. */
async function seedLocalLibrary() {
  const { Media } = await import('../src/models/Media');
  const { Types } = await import('mongoose');

  await Media.deleteMany({});
  bucket.objects.clear();

  await writeLocalFile(PHOTO_KEY, Buffer.alloc(900, 4));
  await writeLocalFile(THUMB_KEY, Buffer.alloc(120, 5));

  const common = {
    ownerId: new Types.ObjectId(OWNER),
    folderId: null,
    storageProvider: 'local' as const,
    url: null,
    mimeType: 'image/jpeg',
    fileType: 'image' as const,
    size: 900,
    isDeleted: false,
  };

  await Media.create({
    ...common,
    originalName: 'holiday.jpg',
    storedName: 'holiday.jpg',
    storageKey: PHOTO_KEY,
    thumbnailKey: THUMB_KEY,
  });

  // Deliberately has no file on this machine — the case the script must report and skip
  // rather than fail on or "fix" by dropping the record.
  await Media.create({
    ...common,
    originalName: 'elsewhere.jpg',
    storedName: 'elsewhere.jpg',
    storageKey: ORPHAN_KEY,
    thumbnailKey: null,
  });
}

test('a dry run changes nothing at all', async () => {
  await seedLocalLibrary();
  const { Media } = await import('../src/models/Media');

  const output = await runMigration();

  assert.match(output, /DRY RUN/);
  assert.equal(bucket.objects.size, 0, 'a dry run uploaded something');
  assert.equal(
    await Media.countDocuments({ storageProvider: 'local' }),
    2,
    'a dry run modified records',
  );
});

test('--apply copies the bytes up and leaves every local original in place', async () => {
  await seedLocalLibrary();
  const { Media } = await import('../src/models/Media');

  await runMigration(['--apply']);

  assert.equal(bucket.objects.has(PHOTO_KEY), true, 'the photo never reached the bucket');
  assert.equal(bucket.objects.has(THUMB_KEY), true, 'the thumbnail never reached the bucket');
  assert.equal(bucket.objects.get(PHOTO_KEY)?.body.length, 900);

  /**
   * The guarantee the whole script rests on. `upload` consumes its source, so a version
   * that handed it the original would have moved the library into the bucket — and a run
   * interrupted halfway would have left the user with files in neither place.
   */
  assert.equal(fs.existsSync(path.join(uploadsDir, PHOTO_KEY)), true, 'the local original was removed');
  assert.equal(fs.existsSync(path.join(uploadsDir, THUMB_KEY)), true, 'the local thumbnail was removed');

  // The record is repointed, not replaced: same document, new provider.
  const migrated = await Media.findOne({ storageKey: PHOTO_KEY });
  assert.equal(migrated?.storageProvider, 's3');
  assert.equal(migrated?.originalName, 'holiday.jpg');
  assert.equal(migrated?.thumbnailKey, THUMB_KEY);
});

test('a record whose file is not on this machine is reported, not destroyed', async () => {
  await seedLocalLibrary();
  const { Media } = await import('../src/models/Media');

  const output = await runMigration(['--apply']);

  assert.match(output, /no local file/);

  const orphan = await Media.findOne({ storageKey: ORPHAN_KEY });
  assert.ok(orphan, 'the record was deleted');
  assert.equal(orphan.storageProvider, 'local', 'the record was repointed at bytes that are not there');
  assert.equal(bucket.objects.has(ORPHAN_KEY), false);
});

test('running it twice adopts what is already there instead of re-uploading', async () => {
  await seedLocalLibrary();
  const { Media } = await import('../src/models/Media');

  await runMigration(['--apply']);
  const afterFirst = bucket.objects.get(PHOTO_KEY)?.body;

  // Whatever state the first run left — including a half-finished one — the second must
  // be able to pick up from without duplicating work or corrupting anything.
  const second = await runMigration(['--apply']);

  assert.equal(bucket.objects.size, 2, 'the second run created extra objects');
  assert.ok(bucket.objects.get(PHOTO_KEY)?.body.equals(afterFirst!), 'the object changed on re-run');
  assert.equal(await Media.countDocuments({}), 2, 'the second run added or removed records');
  assert.equal(await Media.countDocuments({ storageProvider: 's3' }), 1);

  // Nothing left to move, so the second run has no work: the migrated record is filtered
  // out by provider and the orphan is skipped for having no local file.
  assert.match(second, /Records to move : 1/);
});

test('it refuses to run when the target provider is still local', async () => {
  await seedLocalLibrary();

  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', SCRIPT, '--apply'],
      { cwd: BACKEND, env: { ...scriptEnv(), STORAGE_PROVIDER: 'local' } },
      (_err, stdout, stderr) => (stdout || stderr ? resolve(stdout + stderr) : reject(new Error('no output'))),
    );
  });

  assert.match(output, /nowhere to migrate to/);
  assert.equal(bucket.objects.size, 0);
});
