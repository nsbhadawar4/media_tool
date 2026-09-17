'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import type { SignupInput, UserProfile } from '@/types/api';

interface AuthContextValue {
  user: UserProfile | null;
  /** Convenience for the admin area's guard; the backend enforces this independently. */
  isAdmin: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<UserProfile>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authApi.me();
      setUser(data);
    } catch (err) {
      setUser(err instanceof ApiError && err.status === 401 ? null : null);
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
    // Returned as well as stored: callers redirect by role, and reading it back from
    // state in the same tick would still see the old value.
    return data;
  }, []);

  /** Deliberately does not sign the new account in — see the backend's signup handler. */
  const signup = useCallback(async (input: SignupInput) => {
    await authApi.signup(input);
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAdmin: user?.role === 'admin',
      isLoading,
      login,
      signup,
      logout,
      refresh,
    }),
    [user, isLoading, login, signup, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
