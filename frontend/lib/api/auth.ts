import { api } from './client';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  GoogleConfig,
  MobileSignupConfig,
  GoogleSignInResult,
  MobileLoginInput,
  MobileSignupStartInput,
  MobileSignupStarted,
  MobileSignupState,
  MobileSignupVerifyInput,
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
  mobileSignupConfig: () => api.get<MobileSignupConfig>('/api/auth/signup/mobile/config'),
  startMobileSignup: (input: MobileSignupStartInput) =>
    api.post<MobileSignupStarted>('/api/auth/signup/mobile', input),
  resendMobileSignupCode: (input: { phone: string; signupToken: string }) =>
    api.post<MobileSignupState>('/api/auth/signup/mobile/resend', input),
  verifyMobileSignup: (input: MobileSignupVerifyInput) =>
    api.post<UserProfile>('/api/auth/signup/mobile/verify', input),
  loginWithMobile: (input: MobileLoginInput) => api.post<UserProfile>('/api/auth/login/mobile', input),
  googleConfig: () => api.get<GoogleConfig>('/api/auth/google/config'),
  googleSignIn: (credential: string) => api.post<GoogleSignInResult>('/api/auth/google', { credential }),
  completeOnboarding: (plan: 'free' | 'pro' | 'premium') => api.post<UserProfile>('/api/auth/onboarding', { plan }),
  logout: () => api.post<{ loggedOut: boolean }>('/api/auth/logout'),
  me: (signal?: AbortSignal) => api.get<UserProfile>('/api/auth/me', undefined, signal),
  updateProfile: (input: UpdateProfileInput) => api.patch<UserProfile>('/api/auth/me', input),
  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('avatar', file);
    return api.postForm<UserProfile>('/api/auth/me/avatar', form);
  },
  removeAvatar: () => api.delete<UserProfile>('/api/auth/me/avatar'),
  changePassword: (input: ChangePasswordInput) =>
    api.post<{ changed: boolean }>('/api/auth/change-password', input),
  forgotPassword: (input: ForgotPasswordInput) =>
    api.post<{ requested: boolean }>('/api/auth/forgot-password', input),
  verifyOtp: (input: VerifyOtpInput) => api.post<VerifyOtpResult>('/api/auth/verify-otp', input),
  resetPassword: (input: ResetPasswordInput) =>
    api.post<UserProfile>('/api/auth/reset-password', input),
};
