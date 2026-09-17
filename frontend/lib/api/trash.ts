import { api } from './client';
import type { Folder, Media } from '@/types/api';

/**
 * The exact phrase the API requires before it will destroy anything permanently. It is
 * checked server-side too — the dialog is a courtesy, not the safeguard.
 */
export const PERMANENT_DELETE_CONFIRMATION = 'DELETE PERMANENTLY';

/** A trashed folder, plus what its deletion swept up and would take with it. */
export interface TrashFolder extends Folder {
  contains: { folders: number; media: number; bytes: number };
}

export interface TrashResult {
  folders: TrashFolder[];
  media: Media[];
}

/** What a permanent delete would destroy, fetched before the confirmation is shown. */
export interface DeletionPreview {
  type: 'folder' | 'media';
  name: string;
  isProtected: boolean;
  folders: number;
  media: number;
  bytes: number;
}

export interface PermanentDeleteResult {
  type: 'folder' | 'media';
  deleted: boolean;
  deletedFolders: number;
  deletedMedia: number;
  freedBytes: number;
  failed: Array<{ id: string; name: string; error: string }>;
}

export interface RestoreResult {
  type: 'folder' | 'media';
  restoredFolders?: number;
  restoredMedia?: number;
  /** True when the original parent folder is gone, so the item landed at the top level. */
  reparentedToRoot?: boolean;
}

export const trashApi = {
  list: () => api.get<TrashResult>('/api/trash'),
  deletionPreview: (id: string) => api.get<DeletionPreview>(`/api/trash/${id}/deletion-preview`),
  restore: (id: string) => api.post<RestoreResult>(`/api/trash/${id}/restore`),
  permanentlyDelete: (id: string, confirm: string) =>
    api.delete<PermanentDeleteResult>(`/api/trash/${id}/permanent`, { confirm }),
};
