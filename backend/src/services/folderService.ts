import { Types } from 'mongoose';
import { Folder, type IFolder } from '../models/Folder';
import { Media } from '../models/Media';
import { AppError } from '../utils/AppError';
import { getStorageProvider } from './storage';

/**
 * Every function here takes the authenticated user's id and puts it into the query filter
 * itself, rather than loading a document and comparing owners afterwards. The difference
 * matters: a filter cannot be forgotten halfway through a code path, and a folder
 * belonging to someone else comes back as "not found" — which is also the right thing to
 * tell the caller, since confirming the id exists would leak that another account has it.
 *
 * The owner id always comes from req.user (set by requireAuth from the session cookie),
 * never from the request body, params or query.
 */

/** Blocks deletion of folders flagged as protected. The flag is set out-of-band and no route can clear it. */
export function assertDeletable(folder: IFolder): void {
  if (folder.isProtected) {
    throw AppError.forbidden(`"${folder.name}" is a protected folder and cannot be deleted`);
  }
}

/** Slugifies a folder name for uniqueness checks among siblings; display name keeps original casing. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '') || 'folder';
}

async function buildPath(ownerId: string, parentId: string | null): Promise<Types.ObjectId[]> {
  if (!parentId) return [];
  const parent = await Folder.findOne({ _id: parentId, ownerId, isDeleted: false });
  if (!parent) throw AppError.notFound('Parent folder not found');
  return [...parent.path, parent._id];
}

export async function assertNoCycle(
  ownerId: string,
  folderId: string,
  newParentId: string | null,
): Promise<void> {
  if (!newParentId) return;
  if (newParentId === folderId) throw AppError.badRequest('A folder cannot be its own parent');
  const newParent = await Folder.findOne({ _id: newParentId, ownerId });
  if (!newParent || newParent.isDeleted) throw AppError.notFound('Target parent folder not found');
  if (newParent.path.some((ancestorId) => ancestorId.toString() === folderId)) {
    throw AppError.badRequest('Cannot move a folder into its own subfolder');
  }
}

export async function assertUniqueSibling(
  ownerId: string,
  name: string,
  parentId: string | null,
  excludeId?: string,
): Promise<void> {
  const slug = slugify(name);
  const query: Record<string, unknown> = {
    ownerId,
    parentFolder: parentId ?? null,
    slug,
    isDeleted: false,
  };
  if (excludeId) query._id = { $ne: excludeId };
  const clash = await Folder.findOne(query);
  if (clash) throw AppError.conflict(`A folder named "${name}" already exists here`);
}

export interface CreateFolderInput {
  ownerId: string;
  name: string;
  description?: string;
  parentFolder?: string | null;
  createdBy: string;
}

export async function createFolder(input: CreateFolderInput): Promise<IFolder> {
  const parentId = input.parentFolder ?? null;
  await assertUniqueSibling(input.ownerId, input.name, parentId);
  const path = await buildPath(input.ownerId, parentId);

  return Folder.create({
    ownerId: new Types.ObjectId(input.ownerId),
    name: input.name,
    slug: slugify(input.name),
    description: input.description,
    parentFolder: parentId,
    path,
    createdBy: new Types.ObjectId(input.createdBy),
  });
}

export interface UpdateFolderInput {
  name?: string;
  description?: string | null;
  parentFolder?: string | null;
  coverImage?: string | null;
}

export async function updateFolder(
  ownerId: string,
  id: string,
  input: UpdateFolderInput,
): Promise<IFolder> {
  const folder = await Folder.findOne({ _id: id, ownerId, isDeleted: false });
  if (!folder) throw AppError.notFound('Folder not found');

  const nextName = input.name ?? folder.name;
  const parentChanging =
    input.parentFolder !== undefined && input.parentFolder !== (folder.parentFolder?.toString() ?? null);
  const nextParent =
    input.parentFolder !== undefined ? input.parentFolder : (folder.parentFolder?.toString() ?? null);

  if (input.name !== undefined || parentChanging) {
    await assertUniqueSibling(ownerId, nextName, nextParent, id);
  }

  if (parentChanging) {
    await assertNoCycle(ownerId, id, nextParent);
    const newPath = await buildPath(ownerId, nextParent);
    folder.path = newPath;
    folder.parentFolder = nextParent ? new Types.ObjectId(nextParent) : null;
    await propagateDescendantPaths(ownerId, folder);
  }

  if (input.name !== undefined) {
    folder.name = input.name;
    folder.slug = slugify(input.name);
  }
  if (input.description !== undefined) folder.description = input.description ?? undefined;
  if (input.coverImage !== undefined) {
    // The cover must be one of this user's own files, or it would expose another
    // account's image through this folder's card.
    if (input.coverImage) {
      const owned = await Media.exists({ _id: input.coverImage, ownerId, isDeleted: false });
      if (!owned) throw AppError.notFound('Cover image not found');
      folder.coverImage = new Types.ObjectId(input.coverImage);
    } else {
      folder.coverImage = null;
    }
  }

  await folder.save();
  return folder;
}

/** After a folder moves, every descendant's stored ancestor `path` array must be rewritten. */
async function propagateDescendantPaths(ownerId: string, folder: IFolder): Promise<void> {
  const descendants = await Folder.find({ ownerId, path: folder._id });
  for (const descendant of descendants) {
    const idx = descendant.path.findIndex((p) => p.toString() === folder._id.toString());
    const prefix = idx >= 0 ? descendant.path.slice(idx) : [descendant._id];
    descendant.path = [
      ...folder.path,
      folder._id,
      ...prefix.filter((p) => p.toString() !== folder._id.toString()),
    ];
    await descendant.save();
  }
}

/**
 * Moves a folder and everything inside it to the trash. Nothing is removed from storage
 * here — this only flips flags, and is always reversible via restoreFolder.
 *
 * Every item swept up is stamped with `deletedCascadeRoot = this folder`, which is what
 * lets the restore put the subtree back exactly as it was. Items that were *already* in
 * the trash are left untouched: re-deleting a parent must not rewrite when they were
 * deleted, nor claim them for a restore that would undo a deliberate earlier deletion.
 */
export async function softDeleteFolder(ownerId: string, id: string): Promise<IFolder> {
  const folder = await Folder.findOne({ _id: id, ownerId, isDeleted: false });
  if (!folder) throw AppError.notFound('Folder not found');
  assertDeletable(folder);

  const now = new Date();
  const descendantIds = (await Folder.find({ ownerId, path: folder._id }, { _id: 1 })).map((f) => f._id);
  const allFolderIds = [folder._id, ...descendantIds];

  // The root records no cascade parent: the user deleted this one on purpose, so it is
  // the entry that shows up in the trash list.
  await Folder.updateOne(
    { _id: folder._id, ownerId },
    { isDeleted: true, deletedAt: now, deletedCascadeRoot: null },
  );

  if (descendantIds.length > 0) {
    await Folder.updateMany(
      { _id: { $in: descendantIds }, ownerId, isDeleted: false },
      { isDeleted: true, deletedAt: now, deletedCascadeRoot: folder._id },
    );
  }

  await Media.updateMany(
    { folderId: { $in: allFolderIds }, ownerId, isDeleted: false },
    { isDeleted: true, deletedAt: now, deletedCascadeRoot: folder._id },
  );

  if (folder.parentFolder) {
    await recalculateItemCount(ownerId, folder.parentFolder.toString());
  }

  return (await Folder.findOne({ _id: id, ownerId }))!;
}

export interface RestoreFolderResult {
  folder: IFolder;
  /** How many descendants came back with it — surfaced to the user and the activity log. */
  restoredFolders: number;
  restoredMedia: number;
  /** True when the original parent is gone, so the folder was restored to the root instead. */
  reparentedToRoot: boolean;
}

/**
 * Brings a folder back out of the trash together with everything its deletion swept up.
 *
 * Restoring only the folder document would leave its contents stranded in the trash —
 * the folder would come back empty and every file inside it would have to be found and
 * restored one by one. Anything trashed separately (cascade root null, or a different
 * root) deliberately stays where it is.
 */
export async function restoreFolder(ownerId: string, id: string): Promise<RestoreFolderResult> {
  const folder = await Folder.findOne({ _id: id, ownerId, isDeleted: true });
  if (!folder) throw AppError.notFound('Deleted folder not found');

  // A folder can only be restored into a parent that still exists and isn't itself deleted.
  let reparentedToRoot = false;
  if (folder.parentFolder) {
    const parent = await Folder.findOne({ _id: folder.parentFolder, ownerId });
    if (!parent || parent.isDeleted) {
      folder.parentFolder = null;
      folder.path = [];
      reparentedToRoot = true;
    }
  }

  folder.isDeleted = false;
  folder.deletedAt = null;
  folder.deletedCascadeRoot = null;
  await folder.save();

  const [folderResult, mediaResult] = await Promise.all([
    Folder.updateMany(
      { ownerId, deletedCascadeRoot: folder._id, isDeleted: true },
      { isDeleted: false, deletedAt: null, deletedCascadeRoot: null },
    ),
    Media.updateMany(
      { ownerId, deletedCascadeRoot: folder._id, isDeleted: true },
      { isDeleted: false, deletedAt: null, deletedCascadeRoot: null },
    ),
  ]);

  // Restored media changes the counts on this folder and on every subfolder that came back.
  const subtreeIds = (await Folder.find({ ownerId, path: folder._id }, { _id: 1 })).map((f) =>
    f._id.toString(),
  );
  for (const folderId of [folder._id.toString(), ...subtreeIds]) {
    await recalculateItemCount(ownerId, folderId);
  }
  if (folder.parentFolder) {
    await recalculateItemCount(ownerId, folder.parentFolder.toString());
  }

  return {
    folder,
    restoredFolders: folderResult.modifiedCount ?? 0,
    restoredMedia: mediaResult.modifiedCount ?? 0,
    reparentedToRoot,
  };
}

/**
 * Everything a permanent folder delete would destroy. Computed before anything is touched
 * so the user can be shown the real blast radius, and so the API can refuse to proceed
 * if the caller's confirmation doesn't match what is actually about to happen.
 */
export interface FolderDeletionScope {
  folder: IFolder;
  /** Trashed descendant folders that came down with it. */
  folderIds: Types.ObjectId[];
  /** Trashed media inside the whole subtree — these files leave storage for good. */
  media: IMediaLike[];
  totalBytes: number;
}

/** The media fields this service needs; avoids importing the full document type. */
export interface IMediaLike {
  _id: Types.ObjectId;
  originalName: string;
  size: number;
  storageKey: string;
  thumbnailKey?: string | null;
}

/**
 * Works out exactly what a permanent delete of this folder would remove.
 *
 * Only ever considers items already in the trash. A live file that was moved into this
 * folder after it was trashed is never in scope — refusing the delete (below) is the safe
 * outcome, since permanently destroying something the user can still see in the gallery
 * would be indefensible.
 */
export async function getFolderDeletionScope(
  ownerId: string,
  id: string,
): Promise<FolderDeletionScope> {
  const folder = await Folder.findOne({ _id: id, ownerId, isDeleted: true });
  if (!folder) throw AppError.notFound('Deleted folder not found');

  const descendants = await Folder.find({ ownerId, path: folder._id, isDeleted: true }, { _id: 1 });
  const folderIds = [folder._id, ...descendants.map((f) => f._id)];

  const media = await Media.find(
    { ownerId, folderId: { $in: folderIds }, isDeleted: true },
    { _id: 1, originalName: 1, size: 1, storageKey: 1, thumbnailKey: 1 },
  );

  return {
    folder,
    folderIds: descendants.map((f) => f._id),
    media,
    totalBytes: media.reduce((sum, m) => sum + (m.size ?? 0), 0),
  };
}

export interface PermanentDeleteResult {
  deletedFolders: number;
  deletedMedia: number;
  freedBytes: number;
  /** Files whose bytes could not be removed; their records are kept so it can be retried. */
  failed: Array<{ id: string; name: string; error: string }>;
}

/**
 * Irreversibly removes a trashed folder, its trashed subtree, and those files' bytes.
 *
 * Storage is cleared first and a record is only dropped once its bytes are actually gone,
 * so a storage failure leaves the item in the trash to retry rather than losing track of
 * a file that still exists.
 */
export async function permanentlyDeleteFolder(
  ownerId: string,
  id: string,
): Promise<PermanentDeleteResult> {
  const scope = await getFolderDeletionScope(ownerId, id);
  assertDeletable(scope.folder);

  // Refuse while anything live is inside: those items are still visible in the gallery and
  // were never put in the trash, so nobody has confirmed destroying them.
  const allFolderIds = [scope.folder._id, ...scope.folderIds];
  const [activeDescendant, activeMedia] = await Promise.all([
    Folder.exists({ ownerId, path: scope.folder._id, isDeleted: false }),
    Media.exists({ ownerId, folderId: { $in: allFolderIds }, isDeleted: false }),
  ]);
  if (activeDescendant || activeMedia) {
    throw AppError.badRequest(
      'This folder still contains items that are not in the trash. Restore it, remove those items, then try again.',
    );
  }

  const { deletedMedia, freedBytes, failed } = await purgeMediaRecords(ownerId, scope.media);

  // Leave the folders in place if any file survived, so the user can see and retry it.
  if (failed.length > 0) {
    return { deletedFolders: 0, deletedMedia, freedBytes, failed };
  }

  const folderResult = await Folder.deleteMany({ _id: { $in: allFolderIds }, ownerId });

  return {
    deletedFolders: folderResult.deletedCount ?? 0,
    deletedMedia,
    freedBytes,
    failed,
  };
}

/**
 * Deletes each file's bytes, then its record. Order matters: dropping the record first
 * would strand the bytes with nothing left pointing at them, so they could never be found
 * or cleaned up again.
 */
export async function purgeMediaRecords(
  ownerId: string,
  media: IMediaLike[],
): Promise<{ deletedMedia: number; freedBytes: number; failed: PermanentDeleteResult['failed'] }> {
  const provider = getStorageProvider();
  const failed: PermanentDeleteResult['failed'] = [];
  let deletedMedia = 0;
  let freedBytes = 0;

  for (const item of media) {
    try {
      await provider.delete(item.storageKey);
      // A missing thumbnail must not block removing the file it belongs to.
      if (item.thumbnailKey) await provider.delete(item.thumbnailKey).catch(() => undefined);
      await Media.deleteOne({ _id: item._id, ownerId });
      deletedMedia += 1;
      freedBytes += item.size ?? 0;
    } catch (err) {
      failed.push({
        id: item._id.toString(),
        name: item.originalName,
        error: err instanceof Error ? err.message : 'Could not remove the file from storage',
      });
    }
  }

  return { deletedMedia, freedBytes, failed };
}

export async function recalculateItemCount(ownerId: string, folderId: string): Promise<void> {
  const count = await Media.countDocuments({ ownerId, folderId, isDeleted: false });
  await Folder.updateOne({ _id: folderId, ownerId }, { itemCount: count });
}

export async function getBreadcrumbs(folder: IFolder): Promise<Array<{ id: string; name: string }>> {
  if (folder.path.length === 0) return [];
  const ancestors = await Folder.find({ _id: { $in: folder.path }, ownerId: folder.ownerId });
  const byId = new Map(ancestors.map((a) => [a._id.toString(), a]));
  return folder.path.map((id) => {
    const a = byId.get(id.toString());
    return { id: id.toString(), name: a?.name ?? 'Unknown' };
  });
}
