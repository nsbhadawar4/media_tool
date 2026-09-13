import { api } from './client';
import type { DashboardRecent, DashboardStats } from '@/types/api';

export const dashboardApi = {
  stats: () => api.get<DashboardStats>('/api/dashboard/stats'),
  recent: () => api.get<DashboardRecent>('/api/dashboard/recent'),
};
