import { api } from './client';
import type { DashboardRecent, DashboardStats, StorageSummary } from '@/types/api';

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/api/dashboard/stats'),
  recent: () => api.get<DashboardRecent>('/api/dashboard/recent'),
  /** The signed-in user's own storage; the server decides whose (the session's). */
  storage: () => api.get<StorageSummary>('/api/dashboard/storage'),
};
