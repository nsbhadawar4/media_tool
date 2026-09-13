import { api } from './client';
import type { AdminProfile } from '@/types/api';

export const authApi = {
  login: (email: string, password: string, rememberMe = false) =>
    api.post<AdminProfile>('/api/auth/login', { email, password, rememberMe }),
  logout: () => api.post<{ loggedOut: boolean }>('/api/auth/logout'),
  me: (signal?: AbortSignal) => api.get<AdminProfile>('/api/auth/me', undefined, signal),
};
