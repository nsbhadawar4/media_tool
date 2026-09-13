import { api } from './client';
import type { Breadcrumb, Folder, FolderSortOption } from '@/types/api';

export interface ListFoldersResult {
  folders: Folder[];
  parent: Folder | null;
  breadcrumbs: Breadcrumb[];
}

export interface FolderDetailResult {
  folder: Folder;
  subfolders: Folder[];
  breadcrumbs: Breadcrumb[];
}

export const foldersApi = {
  list: (params?: {
    parentFolder?: string | null;
    search?: string;
    includeDeleted?: boolean;
    sort?: FolderSortOption;
  }) =>
    api.get<ListFoldersResult>('/api/folders', {
      parentFolder: params?.parentFolder ?? undefined,
      search: params?.search,
      includeDeleted: params?.includeDeleted,
      sort: params?.sort,
    }),
  get: (id: string) => api.get<FolderDetailResult>(`/api/folders/${id}`),
  create: (input: { name: string; description?: string; parentFolder?: string | null }) =>
    api.post<Folder>('/api/folders', input),
  update: (id: string, input: Partial<{ name: string; description: string | null; parentFolder: string | null; coverImage: string | null }>) =>
    api.patch<Folder>(`/api/folders/${id}`, input),
  remove: (id: string) => api.delete<Folder>(`/api/folders/${id}`),
  restore: (id: string) => api.post<Folder>(`/api/folders/${id}/restore`),
};
