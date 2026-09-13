import { api } from './client';
import type { AdminProfile } from '@/types/api';

export const authApi = {
  login: (email: string, password: string) => api.post<AdminProfile>('/api/auth/login', { email, password }),
  logout: () => api.post<{ loggedOut: boolean }>('/api/auth/logout'),
  me: (signal?: AbortSignal) => api.get<AdminProfile>('/api/auth/me', undefined, signal),
};
