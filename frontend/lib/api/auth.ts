import { api } from './client';
import type { SignupInput, UserProfile } from '@/types/api';

export const authApi = {
  signup: (input: SignupInput) => api.post<UserProfile>('/api/auth/signup', input),
  login: (email: string, password: string, rememberMe = false) =>
    api.post<UserProfile>('/api/auth/login', { email, password, rememberMe }),
  logout: () => api.post<{ loggedOut: boolean }>('/api/auth/logout'),
  me: (signal?: AbortSignal) => api.get<UserProfile>('/api/auth/me', undefined, signal),
};
