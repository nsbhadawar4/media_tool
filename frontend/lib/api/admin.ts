import { api } from './client';
import type { AdminStats, AdminUserSummary, UserProfile } from '@/types/api';

export interface AdminUserDetail {
  user: AdminUserSummary;
  stats: {
    folderCount: number;
    imageCount: number;
    videoCount: number;
    documentCount: number;
    trashCount: number;
    storageUsedBytes: number;
  };
}

export interface ListUsersParams {
  search?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'inactive';
  page?: number;
  limit?: number;
}

export const adminApi = {
  stats: (signal?: AbortSignal) => api.get<AdminStats>('/api/admin/stats', undefined, signal),
  listUsers: (params: ListUsersParams = {}, signal?: AbortSignal) =>
    api.get<AdminUserSummary[]>('/api/admin/users', { ...params }, signal),
  getUser: (id: string, signal?: AbortSignal) =>
    api.get<AdminUserDetail>(`/api/admin/users/${id}`, undefined, signal),
  setStatus: (id: string, isActive: boolean) =>
    api.patch<UserProfile>(`/api/admin/users/${id}/status`, { isActive }),
  deleteUser: (id: string) =>
    api.delete<{ deleted: boolean; retainedFolders: number; retainedMedia: number }>(
      `/api/admin/users/${id}`,
    ),
};
