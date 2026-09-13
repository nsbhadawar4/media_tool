import { api } from './client';
import type { ActivityLog } from '@/types/api';

export const activityApi = {
  list: (params: { action?: string; page?: number; limit?: number } = {}) =>
    api.get<ActivityLog[]>('/api/activity', { ...params }),
};
