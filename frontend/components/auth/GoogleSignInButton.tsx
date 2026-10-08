'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/AuthContext';
import { useToast } from '@/lib/toast/ToastContext';
import { postLoginPath } from '@/lib/auth/routes';
import type { GoogleConfig } from '@/types/api';
import { FormAlert } from './FormFeedback';

/** The slice of Google Identity Services this component uses. */
interface GoogleIdentityApi {
  accounts: {
    id: {
      initialize(options: {
        client_id: string;
        nonce: string;
        callback: (response: { credential?: string }) => void;
        ux_mode?: 'popup';
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        itp_support?: boolean;
      }): void;
      renderButton(
        parent: HTMLElement,
        options: { type: 'standard'; theme: 'outline' | 'filled_black'; size: 'large'; shape: 'pill'; text: 'continue_with' | 'signup_with'; width: number; logo_alignment: 'center' },
      ): void;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';

/** Google's mark, for the not-configured state (the live button draws its own). */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * "Continue with Google". Renders Google's own button (required by Google's branding rules),
 * themed to match the app. The ID token it returns goes to the backend, which verifies it and
 * starts the normal session — this component never decides who the user is.
 *
 * Each attempt uses a fresh nonce from /api/auth/google/config (also set as an HTTP-only
 * cookie); after any failure a new one is fetched, since a nonce only works once.
 */
export function GoogleSignInButton({
  mode = 'signin',
  from = null,
}: {
  mode?: 'signin' | 'signup';
  /** Where to return after signing in (the login page's `?from=`), checked by postLoginPath. */
  from?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { loginWithGoogle } = useAuth();

  const [config, setConfig] = useState<GoogleConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(async () => {
    try {
      const { data } = await authApi.googleConfig();
      setConfig(data);
      setConfigError(false);
    } catch {
      setConfigError(true);
    }
  }, []);

  useEffect(() => {
    // Fetching the server's Google settings on mount; nothing else could provide them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadConfig();
  }, [loadConfig]);

  // The script may already be on the page (a second button, or a client-side navigation).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (window.google?.accounts?.id) setScriptReady(true);
  }, []);

  const onCredential = useCallback(
    async (credential: string | undefined) => {
      if (!credential) return;
      setError(null);
      setBusy(true);
      try {
        const { user, passwordDisabled } = await loginWithGoogle(credential);
        if (passwordDisabled) {
          toast.info('Signed in with Google. For your security, the password previously set on this account was turned off — use “Forgot password” if you want a new one.');
        }
        router.replace(postLoginPath(user.role, from, user.onboardingRequired));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Google sign-in failed. Please try again.');
        setBusy(false);
        void loadConfig(); // the nonce was spent
      }
    },
    [loginWithGoogle, router, from, toast, loadConfig],
  );

  // (Re)draw Google's button whenever a fresh nonce arrives.
  useEffect(() => {
    const slot = slotRef.current;
    const google = window.google;
    if (!scriptReady || !slot || !google || !config?.enabled || !config.clientId || !config.nonce) return;
    google.accounts.id.initialize({
      client_id: config.clientId,
      nonce: config.nonce,
      callback: (response) => void onCredential(response.credential),
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
    });
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches;
    slot.replaceChildren();
    google.accounts.id.renderButton(slot, {
      type: 'standard',
      theme: dark ? 'filled_black' : 'outline',
      size: 'large',
      shape: 'pill',
      text: mode === 'signup' ? 'signup_with' : 'continue_with',
      width: Math.min(400, Math.max(200, Math.floor(slot.getBoundingClientRect().width))),
      logo_alignment: 'center',
    });
  }, [scriptReady, config, mode, onCredential]);

  const notConfigured = config !== null && !config.enabled;

  return (
    <div className="flex flex-col gap-2">
      {config?.enabled && <Script src={GSI_SRC} strategy="afterInteractive" onReady={() => setScriptReady(true)} />}

      {/* 40px: the height of Google's own "large" button, so nothing moves when it arrives. */}
      <div className="relative flex min-h-10 items-center justify-center">
        {notConfigured || configError ? (
          <button
            type="button"
            disabled
            aria-describedby="google-unavailable"
            className="inline-flex h-10 w-full cursor-not-allowed items-center justify-center gap-3 rounded-full border border-border bg-surface/50 text-sm font-medium text-muted"
          >
            <GoogleMark className="h-[18px] w-[18px] opacity-50 grayscale" />
            {mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
          </button>
        ) : (
          <>
            {/* Google's iframe button lands here; a button-shaped skeleton holds the space until it does. */}
            <div ref={slotRef} className="flex w-full justify-center" aria-busy={!scriptReady || !config} />
            {(!scriptReady || !config) && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 rounded-full border border-border bg-surface-elevated" aria-hidden>
                <GoogleMark className="h-[18px] w-[18px]" />
                <span className="h-2.5 w-36 rounded-full bg-surface-hover animate-pulse" />
              </div>
            )}
            {(!scriptReady || !config) && <span className="sr-only" role="status">Loading Google sign-in…</span>}
          </>
        )}
        {busy && (
          <div className="animate-fade-in absolute inset-0 flex items-center justify-center gap-2 rounded-full border border-accent/40 bg-surface-elevated text-sm font-medium text-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Signing you in with Google…
          </div>
        )}
      </div>

      {(notConfigured || configError) && (
        <p id="google-unavailable" className="text-center text-[11px] text-muted">
          {configError ? 'Google sign-in is unavailable right now.' : 'Google sign-in isn’t set up on this server yet.'}
        </p>
      )}
      {error && (
        <FormAlert>{error}</FormAlert>
      )}
    </div>
  );
}

/** "or" between the Google button and the email / mobile forms. */
export function AuthDivider({ label = 'or' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.14em] text-subtle" aria-hidden>
      <span className="h-px flex-1 bg-linear-to-r from-transparent to-border-strong" />
      {label}
      <span className="h-px flex-1 bg-linear-to-l from-transparent to-border-strong" />
    </div>
  );
}
