'use client';

import { useRef, useState, type FormEvent } from 'react';
import {
  AtSign,
  BadgeCheck,
  CalendarDays,
  Camera,
  Clock,
  KeyRound,
  Loader2,
  Phone,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { AuthField } from '@/components/auth/AuthField';
import { initialsOf } from '@/components/ui/Avatar';
import { AvatarCropperModal } from '@/components/profile/AvatarCropperModal';
import { useAuth } from '@/lib/auth/AuthContext';
import { authApi } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast/ToastContext';
import { formatDate, formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';

/**
 * The account's own details — what it signed up with, and the parts of that it can change.
 *
 * Kept apart from Settings, which is about this device: a theme lives in one browser's
 * local storage, while a name and an email belong to the account and follow it everywhere.
 * Mixing the two would file "how the app looks here" beside "who you are" under one word.
 */
export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const toast = useToast();

  if (!user) return null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <IdentityHeader user={user} onChanged={refresh} toast={toast} />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ProfileForm user={user} onSaved={refresh} toast={toast} />
        <PasswordForm toast={toast} />
      </div>
    </div>
  );
}

type Toast = ReturnType<typeof useToast>;
type User = NonNullable<ReturnType<typeof useAuth>['user']>;

/**
 * Who this account is, above everything it can edit.
 *
 * The tinted band exists to give the avatar something to sit against, so the page opens on
 * a person rather than on a form. Everything in it is recorded rather than entered — the
 * editable half lives in the cards below, and keeping the two visibly apart is what stops
 * "member since" reading like a field somebody forgot to make editable.
 */
function IdentityHeader({
  user,
  onChanged,
  toast,
}: {
  user: User;
  onChanged: () => Promise<void>;
  toast: Toast;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isBusy, setIsBusy] = useState(false);

  // The picked file waits here while the cropper is open; nothing is uploaded until Save.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const handlePick = (file: File | undefined) => {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    setPendingFile(file);
  };

  const handleCropped = async (cropped: File) => {
    setIsBusy(true);
    try {
      await authApi.uploadAvatar(cropped);
      await onChanged();
      setPendingFile(null);
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not upload your photo');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemove = async () => {
    setIsBusy(true);
    try {
      await authApi.removeAvatar();
      await onChanged();
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove your photo');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <section className="gradient-border overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div className="h-24 bg-linear-to-r from-accent/25 via-accent/10 to-transparent sm:h-28" />

        <div className="px-5 pb-5 sm:px-7 sm:pb-6">
          {/* Pulled up over the band so the avatar straddles it, which is what makes the
            header read as one object rather than a stripe with a card under it. */}
          <div className="-mt-11 flex flex-wrap items-end gap-4 sm:-mt-12">
            <div className="group/avatar relative shrink-0">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-surface bg-accent text-xl font-semibold text-accent-foreground shadow-pop ring-1 ring-accent/40 transition-transform duration-300 ease-out group-hover/avatar:scale-105 sm:h-24 sm:w-24 sm:text-2xl">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a small data URL, nothing to optimise
                  <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                ) : (
                  initialsOf(user.name)
                )}
                {isBusy && (
                  <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45">
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  </span>
                )}
              </div>
              {/* The whole circle is the button; the camera overlay fades in on hover or focus. */}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={isBusy}
                aria-label="Change profile photo"
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-[2px] transition-opacity duration-200 focus-visible:opacity-100 group-hover/avatar:opacity-100 disabled:opacity-0"
              >
                <span className="flex flex-col items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider">
                  <Camera className="h-5 w-5" />
                  Change
                </span>
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => handlePick(e.target.files?.[0])}
              />
            </div>

            <div className="min-w-0 flex-1 basis-56 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-foreground sm:text-2xl">{user.name}</h1>
                {user.role === 'admin' && (
                  <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-xs font-medium text-accent">
                    Admin
                  </span>
                )}
                {!user.isActive && (
                  <span className="rounded-full bg-danger/12 px-2.5 py-0.5 text-xs font-medium text-danger">
                    Deactivated
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
              {user.avatarUrl && (
                <button
                  type="button"
                  onClick={() => void handleRemove()}
                  disabled={isBusy}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted transition hover:text-danger disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" /> Remove photo
                </button>
              )}
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Fact icon={Phone} label="Mobile" value={user.mobile ?? 'Not provided'} muted={!user.mobile} />
            <Fact
              icon={user.isEmailVerified ? BadgeCheck : ShieldAlert}
              label="Email"
              value={user.isEmailVerified ? 'Verified' : 'Not verified'}
              tone={user.isEmailVerified ? 'success' : 'warning'}
            />
            <Fact icon={CalendarDays} label="Member since" value={formatDate(user.createdAt)} />
            <Fact
              icon={Clock}
              label="Last sign-in"
              value={user.lastLoginAt ? formatRelativeTime(user.lastLoginAt) : 'First session'}
            />
          </dl>
        </div>
      </section>
      <AvatarCropperModal
        file={pendingFile}
        isSaving={isBusy}
        onCancel={() => setPendingFile(null)}
        onSave={(f) => void handleCropped(f)}
      />
    </>
  );
}

const FACT_TONES = {
  default: 'text-muted',
  success: 'text-success',
  warning: 'text-warning',
} as const;

function Fact({
  icon: Icon,
  label,
  value,
  tone = 'default',
  muted = false,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  tone?: keyof typeof FACT_TONES;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface-hover px-3.5 py-3">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', FACT_TONES[tone])} />
      <div className="min-w-0">
        <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
        <dd className={cn('truncate text-sm font-medium', muted ? 'text-muted' : 'text-foreground')}>
          {value}
        </dd>
      </div>
    </div>
  );
}

/** Shared frame for the two editable panels, so they read as a pair. */
function FormCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Phone;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-3xl border border-border bg-surface shadow-sm">
      <header className="flex items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{description}</p>
        </div>
      </header>
      <div className="flex-1 px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

/** Inline, dismissible-by-fixing error shown under a form rather than as a toast. */
function FormError({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="animate-fade-in rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger"
    >
      {message}
    </div>
  );
}

/**
 * Edits name, email and mobile.
 *
 * Sends only what actually changed, so saving a new phone number cannot quietly rewrite a
 * name someone edited in another tab — and an unchanged email never trips the uniqueness
 * check or resets the verified flag.
 */
function ProfileForm({ user, onSaved, toast }: { user: User; onSaved: () => Promise<void>; toast: Toast }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [mobile, setMobile] = useState(user.mobile ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedMobile = mobile.trim();
  const originalMobile = user.mobile ?? '';
  const isDirty =
    name.trim() !== user.name || email.trim() !== user.email || trimmedMobile !== originalMobile;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      await authApi.updateProfile({
        ...(name.trim() !== user.name ? { name: name.trim() } : {}),
        ...(email.trim() !== user.email ? { email: email.trim() } : {}),
        // An emptied field is a deliberate "remove it", which null says and "" does not.
        ...(trimmedMobile !== originalMobile ? { mobile: trimmedMobile === '' ? null : trimmedMobile } : {}),
      });

      // Re-read rather than trusting the local copy: the header above, the top bar and
      // every other reader of the session take their values from there.
      await onSaved();
      toast.success('Profile updated');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your profile');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormCard icon={UserRound} title="Your details" description="The information you signed up with.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField
          id="profile-name"
          label="Name"
          icon={<UserRound className="h-4 w-4" />}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
        />
        <AuthField
          id="profile-email"
          label="Email"
          icon={<AtSign className="h-4 w-4" />}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
        <AuthField
          id="profile-mobile"
          label="Mobile (optional)"
          icon={<Phone className="h-4 w-4" />}
          type="tel"
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          autoComplete="tel"
          placeholder="+91 98765 43210"
        />

        {email.trim() !== user.email && (
          <p className="rounded-xl bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
            This is the address you sign in with, so you will need the new one next time.
          </p>
        )}

        {error && <FormError message={error} />}

        <div className="flex items-center gap-2 pt-1">
          <Button type="submit" disabled={!isDirty || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
          {isDirty && !isSaving && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setName(user.name);
                setEmail(user.email);
                setMobile(user.mobile ?? '');
                setError(null);
              }}
            >
              Discard
            </Button>
          )}
        </div>
      </form>
    </FormCard>
  );
}

/** Changes the password, given the current one — a live session is not proof of identity. */
function PasswordForm({ toast }: { toast: Toast }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = currentPassword !== '' && newPassword !== '' && confirmPassword !== '';

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    // Checked here as well as on the server so the mismatch is caught before a round trip.
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsSaving(true);
    try {
      await authApi.changePassword({
        currentPassword,
        newPassword,
        confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change your password');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormCard
      icon={KeyRound}
      title="Password"
      description="Your current password is required to set a new one."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <AuthField
          id="current-password"
          label="Current password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        <AuthField
          id="new-password"
          label="New password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />
        <AuthField
          id="confirm-new-password"
          label="Confirm new password"
          icon={<KeyRound className="h-4 w-4" />}
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <p className="text-xs text-muted">At least 8 characters. You stay signed in on this device.</p>

        {error && <FormError message={error} />}

        <div className="pt-1">
          <Button type="submit" disabled={!canSubmit || isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? 'Changing…' : 'Change password'}
          </Button>
        </div>
      </form>
    </FormCard>
  );
}
