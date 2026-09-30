'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { ResetPasswordInput, SignupInput, UserProfile } from '@/types/api';

interface AuthContextValue {
  user: UserProfile | null;
  /** Convenience for the admin area's guard; the backend enforces this independently. */
  isAdmin: boolean;
  isLoading: boolean;
  /**
   * Why there is no user, when there is none. The distinction matters to the auth gates:
   * a 401 is a real answer and they should send the visitor to sign in, while a request
   * that never arrived says nothing about the session and should be shown as the outage
   * it is. Treating the second as a sign-out would bounce anyone whose backend hiccuped
   * — or, locally, anyone who simply hasn't started it — out of a valid session.
   */
  sessionError: 'rejected' | 'unreachable' | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<UserProfile>;
  signup: (input: SignupInput) => Promise<UserProfile>;
  /** Completes a password reset; the backend sets the session cookie, this records who is signed in. */
  resetPassword: (input: ResetPasswordInput) => Promise<UserProfile>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionError, setSessionError] = useState<'rejected' | 'unreachable' | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await authApi.me();
      setUser(data);
      setSessionError(null);
    } catch (err) {
      setUser(null);
      // Only a 401 is the server saying this session is over. Anything else — it is down,
      // the network dropped, it returned a 500 — leaves the session's fate unknown, and
      // the gates render a retry rather than signing anyone out over it.
      setSessionError(err instanceof ApiError && err.status === 401 ? 'rejected' : 'unreachable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Syncing with the server's session state on mount — there's no prop/derived
    // value this could come from instead, so an effect is the right tool here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, rememberMe = false) => {
    const { data } = await authApi.login(email, password, rememberMe);
    setUser(data);
    setSessionError(null);
    // Returned as well as stored: callers redirect by role, and reading it back from
    // state in the same tick would still see the old value.
    return data;
  }, []);

  /** The backend signs the new account in (session cookie) as part of signup. */
  const signup = useCallback(async (input: SignupInput) => {
    const { data } = await authApi.signup(input);
    setUser(data);
    setSessionError(null);
    return data;
  }, []);

  const resetPassword = useCallback(async (input: ResetPasswordInput) => {
    const { data } = await authApi.resetPassword(input);
    setUser(data);
    setSessionError(null);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
      // A deliberate sign-out is not a failed session check: the gate should redirect
      // quietly, not report that anything went wrong.
      setSessionError(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAdmin: user?.role === 'admin',
      isLoading,
      sessionError,
      login,
      signup,
      resetPassword,
      logout,
      refresh,
    }),
    [user, isLoading, sessionError, login, signup, resetPassword, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
