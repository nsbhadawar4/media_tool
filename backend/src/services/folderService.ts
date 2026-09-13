import { Types } from 'mongoose';
import { Folder, type IFolder } from '../models/Folder';
import { Media } from '../models/Media';
import { AppError } from '../utils/AppError';

/** Slugifies a folder name for uniqueness checks among siblings; display name keeps original casing. */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '') || 'folder';
}

async function buildPath(parentId: string | null): Promise<Types.ObjectId[]> {
  if (!parentId) return [];
  const parent = await Folder.findOne({ _id: parentId, isDeleted: false });
  if (!parent) throw AppError.notFound('Parent folder not found');
  return [...parent.path, parent._id];
}

export async function assertNoCycle(folderId: string, newParentId: string | null): Promise<void> {
  if (!newParentId) return;
  if (newParentId === folderId) throw AppError.badRequest('A folder cannot be its own parent');
  const newParent = await Folder.findById(newParentId);
  if (!newParent || newParent.isDeleted) throw AppError.notFound('Target parent folder not found');
  if (newParent.path.some((ancestorId) => ancestorId.toString() === folderId)) {
    throw AppError.badRequest('Cannot move a folder into its own subfolder');
  }
}

export async function assertUniqueSibling(name: string, parentId: string | null, excludeId?: string): Promise<void> {
  const slug = slugify(name);
  const query: Record<string, unknown> = { parentFolder: parentId ?? null, slug, isDeleted: false };
  if (excludeId) query._id = { $ne: excludeId };
  const clash = await Folder.findOne(query);
  if (clash) throw AppError.conflict(`A folder named "${name}" already exists here`);
}

export interface CreateFolderInput {
  name: string;
  description?: string;
  parentFolder?: string | null;
  createdBy: string;
}

export async function createFolder(input: CreateFolderInput): Promise<IFolder> {
  const parentId = input.parentFolder ?? null;
  await assertUniqueSibling(input.name, parentId);
  const path = await buildPath(parentId);

  const folder = await Folder.create({
    name: input.name,
    slug: slugify(input.name),
    description: input.description,
    parentFolder: parentId,
    path,
    createdBy: new Types.ObjectId(input.createdBy),
  });
  return folder;
}

export interface UpdateFolderInput {
  name?: string;
  description?: string | null;
  parentFolder?: string | null;
  coverImage?: string | null;
}

export async function updateFolder(id: string, input: UpdateFolderInput): Promise<IFolder> {
  const folder = await Folder.findOne({ _id: id, isDeleted: false });
  if (!folder) throw AppError.notFound('Folder not found');

  const nextName = input.name ?? folder.name;
  const parentChanging = input.parentFolder !== undefined && input.parentFolder !== (folder.parentFolder?.toString() ?? null);
  const nextParent = input.parentFolder !== undefined ? input.parentFolder : (folder.parentFolder?.toString() ?? null);

  if (input.name !== undefined || parentChanging) {
    await assertUniqueSibling(nextName, nextParent, id);
  }

  if (parentChanging) {
    await assertNoCycle(id, nextParent);
    const newPath = await buildPath(nextParent);
    folder.path = newPath;
    folder.parentFolder = nextParent ? new Types.ObjectId(nextParent) : null;
    await propagateDescendantPaths(folder);
  }

  if (input.name !== undefined) {
    folder.name = input.name;
    folder.slug = slugify(input.name);
  }
  if (input.description !== undefined) folder.description = input.description ?? undefined;
  if (input.coverImage !== undefined) {
    folder.coverImage = input.coverImage ? new Types.ObjectId(input.coverImage) : null;
  }

  await folder.save();
  return folder;
}

/** After a folder moves, every descendant's stored ancestor `path` array must be rewritten. */
async function propagateDescendantPaths(folder: IFolder): Promise<void> {
  const descendants = await Folder.find({ path: folder._id });
  for (const descendant of descendants) {
    const idx = descendant.path.findIndex((p) => p.toString() === folder._id.toString());
    const prefix = idx >= 0 ? descendant.path.slice(idx) : [descendant._id];
    descendant.path = [...folder.path, folder._id, ...prefix.filter((p) => p.toString() !== folder._id.toString())];
    await descendant.save();
  }
}

export async function softDeleteFolder(id: string): Promise<IFolder> {
  const folder = await Folder.findOne({ _id: id, isDeleted: false });
  if (!folder) throw AppError.notFound('Folder not found');

  const now = new Date();
  const descendantIds = (await Folder.find({ path: folder._id }, { _id: 1 })).map((f) => f._id);
  const allFolderIds = [folder._id, ...descendantIds];

  await Folder.updateMany({ _id: { $in: allFolderIds } }, { isDeleted: true, deletedAt: now });
  await Media.updateMany({ folderId: { $in: allFolderIds }, isDeleted: false }, { isDeleted: true, deletedAt: now });

  if (folder.parentFolder) {
    await recalculateItemCount(folder.parentFolder.toString());
  }

  return (await Folder.findById(id))!;
}

export async function restoreFolder(id: string): Promise<IFolder> {
  const folder = await Folder.findOne({ _id: id, isDeleted: true });
  if (!folder) throw AppError.notFound('Deleted folder not found');

  // A folder can only be restored into a parent that still exists and isn't itself deleted.
  if (folder.parentFolder) {
    const parent = await Folder.findById(folder.parentFolder);
    if (!parent || parent.isDeleted) {
      folder.parentFolder = null;
      folder.path = [];
    }
  }

  folder.isDeleted = false;
  folder.deletedAt = null;
  await folder.save();

  if (folder.parentFolder) {
    await recalculateItemCount(folder.parentFolder.toString());
  }

  return folder;
}

export async function permanentlyDeleteFolder(id: string): Promise<void> {
  const folder = await Folder.findOne({ _id: id, isDeleted: true });
  if (!folder) throw AppError.notFound('Deleted folder not found');

  const hasActiveDescendants = await Folder.exists({ path: folder._id, isDeleted: false });
  const hasActiveMedia = await Media.exists({ folderId: folder._id, isDeleted: false });
  if (hasActiveDescendants || hasActiveMedia) {
    throw AppError.badRequest('This folder still contains active items. Delete them first.');
  }

  await Folder.deleteOne({ _id: id });
}

export async function recalculateItemCount(folderId: string): Promise<void> {
  const count = await Media.countDocuments({ folderId, isDeleted: false });
  await Folder.updateOne({ _id: folderId }, { itemCount: count });
}

export async function getBreadcrumbs(folder: IFolder): Promise<Array<{ id: string; name: string }>> {
  if (folder.path.length === 0) return [];
  const ancestors = await Folder.find({ _id: { $in: folder.path } });
  const byId = new Map(ancestors.map((a) => [a._id.toString(), a]));
  return folder.path.map((id) => {
    const a = byId.get(id.toString());
    return { id: id.toString(), name: a?.name ?? 'Unknown' };
  });
}
