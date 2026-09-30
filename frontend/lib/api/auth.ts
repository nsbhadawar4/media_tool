import { api } from './client';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  SignupInput,
  UpdateProfileInput,
  UserProfile,
  VerifyOtpInput,
  VerifyOtpResult,
} from '@/types/api';

export const authApi = {
  signup: (input: SignupInput) => api.post<UserProfile>('/api/auth/signup', input),
  login: (email: string, password: string, rememberMe = false) =>
    api.post<UserProfile>('/api/auth/login', { email, password, rememberMe }),
  logout: () => api.post<{ loggedOut: boolean }>('/api/auth/logout'),
  me: (signal?: AbortSignal) => api.get<UserProfile>('/api/auth/me', undefined, signal),
  updateProfile: (input: UpdateProfileInput) => api.patch<UserProfile>('/api/auth/me', input),
  changePassword: (input: ChangePasswordInput) =>
    api.post<{ changed: boolean }>('/api/auth/change-password', input),
  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<{ requested: boolean }>('/api/auth/forgot-password', input),
  verifyOtp: (input: VerifyOtpInput) => api.post<VerifyOtpResult>('/api/auth/verify-otp', input),
  resetPassword: (input: ResetPasswordInput) =>
    api.post<UserProfile>('/api/auth/reset-password', input),
};
