/**
 * Safety tests for the trash / recovery system.
 *
 * These cover the invariants that decide whether someone's photos survive a mistake, so
 * they assert on real documents in a real MongoDB and on real files on disk — not mocks.
 * Two of them are regression tests for bugs that silently destroyed or stranded data:
 * restoring a folder used to bring back an empty shell, and permanently deleting a folder
 * used to leave every byte on disk forever.
 *
 * Run with: npm run test:trash
 */
// Redirects storage to a temp dir before config/env is read — see the module for why.
import './setupTestEnv';

import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { env } from '../src/config/env';
import { Folder } from '../src/models/Folder';
import { Media } from '../src/models/Media';
import * as folderService from '../src/services/folderService';
import * as mediaService from '../src/services/mediaService';

let mongo: MongoMemoryServer;

/** Absolute path a storage key maps to under the local provider. */
const storagePath = (key: string) => path.resolve(env.localStorageRoot, key);
const fileExists = (key: string) => fs.existsSync(storagePath(key));

/** Creates a media document with real bytes behind it, so storage deletion is observable. */
async function makeMedia(name: string, folderId: mongoose.Types.ObjectId | null, bytes = 1024) {
  const storageKey = `photos/${folderId?.toString() ?? 'unfiled'}/${name}`;
  const thumbnailKey = `thumbnails/${name}.webp`;

  for (const key of [storageKey, thumbnailKey]) {
    const full = storagePath(key);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, Buffer.alloc(bytes, 1));
  }

  return Media.create({
    folderId,
    originalName: name,
    storedName: name,
    storageKey,
    storageProvider: 'local',
    mimeType: 'image/jpeg',
    fileType: 'image',
    size: bytes,
    thumbnailKey,
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

beforeEach(async () => {
  await Promise.all([Folder.deleteMany({}), Media.deleteMany({})]);
  await fsp.rm(env.localStorageRoot, { recursive: true, force: true });
});

/** parent > child, one photo in each. */
async function makeTree() {
  const parent = await folderService.createFolder({ name: 'Holiday', createdBy: new mongoose.Types.ObjectId().toString() });
  const child = await folderService.createFolder({
    name: 'Beach',
    parentFolder: parent._id.toString(),
    createdBy: new mongoose.Types.ObjectId().toString(),
  });
  const parentPhoto = await makeMedia('parent.jpg', parent._id);
  const childPhoto = await makeMedia('child.jpg', child._id);
  return { parent, child, parentPhoto, childPhoto };
}

test('deleting a folder trashes the whole subtree but touches no files', async () => {
  const { parent, child, parentPhoto, childPhoto } = await makeTree();

  await folderService.softDeleteFolder(parent._id.toString());

  assert.equal((await Folder.findById(parent._id))!.isDeleted, true);
  assert.equal((await Folder.findById(child._id))!.isDeleted, true);
  assert.equal((await Media.findById(parentPhoto._id))!.isDeleted, true);
  assert.equal((await Media.findById(childPhoto._id))!.isDeleted, true);

  // The whole point of a trash: the bytes must still be there.
  assert.ok(fileExists(parentPhoto.storageKey), 'parent photo bytes must survive a soft delete');
  assert.ok(fileExists(childPhoto.storageKey), 'child photo bytes must survive a soft delete');
});

test('restoring a folder brings back its subfolders and files', async () => {
  // Regression: restore used to recover the folder document alone, leaving every photo
  // inside it stranded in the trash.
  const { parent, child, parentPhoto, childPhoto } = await makeTree();
  await folderService.softDeleteFolder(parent._id.toString());

  const result = await folderService.restoreFolder(parent._id.toString());

  assert.equal((await Folder.findById(parent._id))!.isDeleted, false);
  assert.equal((await Folder.findById(child._id))!.isDeleted, false, 'subfolder must come back');
  assert.equal((await Media.findById(parentPhoto._id))!.isDeleted, false, 'photo must come back');
  assert.equal((await Media.findById(childPhoto._id))!.isDeleted, false, 'nested photo must come back');

  assert.equal(result.restoredFolders, 1);
  assert.equal(result.restoredMedia, 2);
  // Denormalised counts must reflect the restored contents.
  assert.equal((await Folder.findById(parent._id))!.itemCount, 1);
  assert.equal((await Folder.findById(child._id))!.itemCount, 1);
});

test('restoring a folder does not resurrect a file deleted separately beforehand', async () => {
  const { parent, parentPhoto, childPhoto } = await makeTree();

  // Deleted on purpose, before the folder was ever trashed.
  await mediaService.softDeleteMedia(childPhoto._id.toString());
  await folderService.softDeleteFolder(parent._id.toString());
  await folderService.restoreFolder(parent._id.toString());

  assert.equal((await Media.findById(parentPhoto._id))!.isDeleted, false);
  assert.equal(
    (await Media.findById(childPhoto._id))!.isDeleted,
    true,
    'a deliberately deleted file must stay in the trash',
  );
});

test('re-deleting a parent preserves an already-trashed subfolder’s deletion time', async () => {
  const { parent, child } = await makeTree();

  await folderService.softDeleteFolder(child._id.toString());
  const originalDeletedAt = (await Folder.findById(child._id))!.deletedAt!;

  await new Promise((resolve) => setTimeout(resolve, 10));
  await folderService.softDeleteFolder(parent._id.toString());

  const after = await Folder.findById(child._id);
  assert.equal(
    after!.deletedAt!.getTime(),
    originalDeletedAt.getTime(),
    'an already-trashed subfolder keeps when it was actually deleted',
  );
  // It stays its own trash entry, so restoring the parent does not silently reinstate it.
  assert.equal(after!.deletedCascadeRoot, null);
});

test('trash lists only directly-deleted entries', async () => {
  const { parent, child, parentPhoto } = await makeTree();
  await folderService.softDeleteFolder(parent._id.toString());

  const roots = await Folder.find({ isDeleted: true, deletedCascadeRoot: null });
  assert.equal(roots.length, 1, 'only the folder the admin deleted should be listed');
  assert.equal(roots[0]!._id.toString(), parent._id.toString());

  const rootMedia = await Media.find({ isDeleted: true, deletedCascadeRoot: null });
  assert.equal(rootMedia.length, 0, 'cascaded files are summarised on the folder, not listed separately');

  // ...and the cascade members point back at the folder that claimed them.
  assert.equal((await Media.findById(parentPhoto._id))!.deletedCascadeRoot!.toString(), parent._id.toString());
  assert.equal((await Folder.findById(child._id))!.deletedCascadeRoot!.toString(), parent._id.toString());
});

test('permanently deleting a folder removes the subtree and its bytes', async () => {
  // Regression: this used to delete the folder document only, orphaning every child
  // record and leaving all the files on disk indefinitely.
  const { parent, child, parentPhoto, childPhoto } = await makeTree();
  await folderService.softDeleteFolder(parent._id.toString());

  const scope = await folderService.getFolderDeletionScope(parent._id.toString());
  assert.equal(scope.media.length, 2, 'preview must account for nested files');
  assert.equal(scope.totalBytes, 2048);

  const result = await folderService.permanentlyDeleteFolder(parent._id.toString());

  assert.equal(result.deletedMedia, 2);
  assert.equal(result.deletedFolders, 2, 'folder and subfolder both removed');
  assert.deepEqual(result.failed, []);

  assert.equal(await Folder.findById(parent._id), null);
  assert.equal(await Folder.findById(child._id), null, 'subfolder record must not be orphaned');
  assert.equal(await Media.findById(parentPhoto._id), null);
  assert.equal(await Media.findById(childPhoto._id), null, 'nested file record must not be orphaned');

  assert.equal(fileExists(parentPhoto.storageKey), false, 'photo bytes must be gone');
  assert.equal(fileExists(childPhoto.storageKey), false, 'nested photo bytes must be gone');
  assert.equal(fileExists(parentPhoto.thumbnailKey!), false, 'thumbnail bytes must be gone');
});

test('permanent deletion refuses while live items are inside', async () => {
  const { parent } = await makeTree();
  await folderService.softDeleteFolder(parent._id.toString());

  // A file that is not in the trash — nobody has confirmed destroying this one.
  await makeMedia('added-later.jpg', parent._id);

  await assert.rejects(
    () => folderService.permanentlyDeleteFolder(parent._id.toString()),
    /not in the trash/,
  );
  assert.notEqual(await Folder.findById(parent._id), null, 'nothing may be deleted when the check fails');
});

test('protected folders cannot be trashed or permanently deleted', async () => {
  const { parent } = await makeTree();
  await Folder.updateOne({ _id: parent._id }, { isProtected: true });

  await assert.rejects(() => folderService.softDeleteFolder(parent._id.toString()), /protected folder/);

  await Folder.updateOne({ _id: parent._id }, { isDeleted: true, deletedAt: new Date() });
  await assert.rejects(() => folderService.permanentlyDeleteFolder(parent._id.toString()), /protected folder/);
  assert.notEqual(await Folder.findById(parent._id), null);
});

test('deleting a single file keeps its bytes until permanent deletion', async () => {
  const { parentPhoto } = await makeTree();

  await mediaService.softDeleteMedia(parentPhoto._id.toString());
  assert.ok(fileExists(parentPhoto.storageKey), 'a normal delete must never remove the file');

  await mediaService.restoreMedia(parentPhoto._id.toString());
  assert.equal((await Media.findById(parentPhoto._id))!.isDeleted, false);
  assert.ok(fileExists(parentPhoto.storageKey));

  await mediaService.softDeleteMedia(parentPhoto._id.toString());
  await mediaService.permanentlyDeleteMedia(parentPhoto._id.toString());
  assert.equal(fileExists(parentPhoto.storageKey), false, 'only permanent deletion removes bytes');
  assert.equal(await Media.findById(parentPhoto._id), null);
});

test('a file cannot be permanently deleted unless it is already in the trash', async () => {
  const { parentPhoto } = await makeTree();

  await assert.rejects(
    () => mediaService.permanentlyDeleteMedia(parentPhoto._id.toString()),
    /Deleted file not found/,
  );
  assert.ok(fileExists(parentPhoto.storageKey), 'a live file keeps its bytes');
});

test('bulk delete routes every file through the trash, not storage', async () => {
  const { parentPhoto, childPhoto } = await makeTree();

  const result = await mediaService.bulkSoftDeleteMedia([
    parentPhoto._id.toString(),
    childPhoto._id.toString(),
  ]);

  assert.equal(result.succeeded.length, 2);
  assert.ok(fileExists(parentPhoto.storageKey));
  assert.ok(fileExists(childPhoto.storageKey));
  // Each is its own trash entry, individually restorable.
  const trashed = await Media.find({ isDeleted: true, deletedCascadeRoot: null });
  assert.equal(trashed.length, 2);
});
