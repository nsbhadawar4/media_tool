import { api } from './client';
import type { ActivityCategory, AdminActivityEntry, AdminStats, AdminUserStats, AdminUserSummary, AuthProvider, UserProfile } from '@/types/api';
import type { ReviewCategory, ReviewStatus } from './reviews';

/** GET /api/admin/users/:id — the account, what it holds, and what it has been doing. */
export interface AdminUserDetail {
  user: UserProfile & {
    lastActiveAt: string | null;
    phoneVerifiedAt: string | null;
    onboardingCompletedAt: string | null;
    subscriptionStartedAt: string | null;
    subscriptionExpiresAt: string | null;
    /** e.g. "203.0.113.•••" — the full address never leaves the server. */
    lastLoginIpMasked: string | null;
  };
  recentActivity: AdminActivityEntry[];
  review: {
    id: string;
    rating: number;
    reviewText: string;
    category: ReviewCategory;
    status: ReviewStatus;
    isPublic: boolean;
    createdAt: string;
  } | null;
  /** Null when the account has never opened Kid Games. */
  kidGames: {
    totalXp: number;
    gamesPlayed: number;
    gamesCompleted: number;
    totalAttempts: number;
    stars: number;
    bestDailyStreak: number;
    achievements: number;
    lastPlayedAt: string | null;
  } | null;
  stats: {
    folderCount: number;
    imageCount: number;
    videoCount: number;
    documentCount: number;
    trashCount: number;
    storageUsedBytes: number;
  };
}

export type UserSort = 'newest' | 'oldest' | 'last_login' | 'last_active' | 'name';

export interface ListUsersParams {
  search?: string;
  role?: 'user' | 'admin';
  status?: 'active' | 'inactive';
  provider?: AuthProvider;
  plan?: 'free' | 'pro' | 'premium';
  /** Signed up on/after and on/before (ISO). */
  from?: string;
  to?: string;
  sort?: UserSort;
  page?: number;
  limit?: number;
}

export interface ListActivityParams {
  /** Only these actions; omitted, every action. */
  actions?: string[];
  category?: ActivityCategory;
  status?: 'success' | 'failure';
  provider?: AuthProvider;
  /** Only events concerning this account. */
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  sort?: 'newest' | 'oldest';
  page?: number;
  limit?: number;
}

export interface UserActivityParams {
  status?: 'success' | 'failure';
  category?: ActivityCategory;
  page?: number;
  limit?: number;
}

/** Local midnight as ISO — the admin's own "today". */
function startOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const adminApi = {
  /** `todayStart` is the admin's local midnight, so "today" means their day. */
  stats: (signal?: AbortSignal) => api.get<AdminStats>('/api/admin/stats', { todayStart: startOfToday() }, signal),
  userStats: (signal?: AbortSignal) => api.get<AdminUserStats>('/api/admin/users/stats', undefined, signal),
  listUsers: (params: ListUsersParams = {}, signal?: AbortSignal) =>
    api.get<AdminUserSummary[]>('/api/admin/users', { ...params }, signal),
  activity: ({ actions, ...params }: ListActivityParams = {}, signal?: AbortSignal) =>
    api.get<AdminActivityEntry[]>(
      '/api/admin/activity',
      { ...params, actions: actions?.length ? actions.join(',') : undefined },
      signal,
    ),
  getUser: (id: string, signal?: AbortSignal) =>
    api.get<AdminUserDetail>(`/api/admin/users/${id}`, undefined, signal),
  userActivity: (id: string, params: UserActivityParams = {}, signal?: AbortSignal) =>
    api.get<AdminActivityEntry[]>(`/api/admin/users/${id}/activity`, { ...params }, signal),
  setStatus: (id: string, isActive: boolean) =>
    api.patch<UserProfile>(`/api/admin/users/${id}/status`, { isActive }),
  deleteUser: (id: string) =>
    api.delete<{ deleted: boolean; retainedFolders: number; retainedMedia: number }>(
      `/api/admin/users/${id}`,
    ),
};
