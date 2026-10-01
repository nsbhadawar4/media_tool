'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';

interface LogoutPromptValue {
  /** Opens the "Are you sure you want to log out?" dialog. Nothing is signed out until confirmed. */
  requestLogout: () => void;
}

const LogoutPromptContext = createContext<LogoutPromptValue | null>(null);

/**
 * One confirmation dialog for every "Sign out" in the app (sidebar, header menu, mobile
 * menu, settings). Mounting it once, here, is what keeps them all asking the same question
 * and removes the chance of a new entry point forgetting to.
 */
export function LogoutPromptProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const requestLogout = useCallback(() => setIsOpen(true), []);
  const value = useMemo(() => ({ requestLogout }), [requestLogout]);

  const handleConfirm = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
      setIsOpen(false);
      toast.success('Signed out');
      router.replace('/');
    } catch {
      toast.error('Failed to sign out');
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <LogoutPromptContext.Provider value={value}>
      {children}
      <Modal isOpen={isOpen} onClose={() => !isLoggingOut && setIsOpen(false)} size="sm" hideCloseButton>
        <div className="flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/25 bg-danger/10 text-danger">
            <LogOut className="h-6 w-6" strokeWidth={1.9} />
          </div>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-foreground">
            Are you sure you want to log out?
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            You will need to sign in again to get back to your library.
          </p>
        </div>

        <div className="mt-6 flex gap-3">
          <Button variant="secondary" className="flex-1" onClick={() => setIsOpen(false)} disabled={isLoggingOut}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleConfirm} isLoading={isLoggingOut}>
            Log out
          </Button>
        </div>
      </Modal>
    </LogoutPromptContext.Provider>
  );
}

export function useLogoutPrompt(): LogoutPromptValue {
  const ctx = useContext(LogoutPromptContext);
  if (!ctx) throw new Error('useLogoutPrompt must be used within LogoutPromptProvider');
  return ctx;
}
