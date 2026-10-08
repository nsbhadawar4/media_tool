import {
  Activity,
  BadgeCheck,
  CreditCard,
  FileText,
  FolderClosed,
  Image as ImageIcon,
  KeyRound,
  LogIn,
  LogOut,
  MailCheck,
  MessageSquareText,
  PencilLine,
  RotateCcw,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserRound,
  UserX,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityCategory, AdminActivityEntry, AuthProvider } from '@/types/api';

/**
 * How the admin panel names and draws each logged event. Labels are built only from what the
 * entry recorded (action, sign-in method, what a code was for, success or failure).
 */

export const PROVIDER_LABEL: Record<AuthProvider, string> = { email: 'Email', mobile: 'Mobile', google: 'Google' };

export const CATEGORY_OPTIONS: Array<{ value: ActivityCategory; label: string }> = [
  { value: 'auth', label: 'Authentication' },
  { value: 'signup', label: 'Signup & verification' },
  { value: 'security', label: 'Security' },
  { value: 'account', label: 'Account changes' },
  { value: 'onboarding', label: 'Plans & onboarding' },
  { value: 'content', label: 'Files & folders' },
  { value: 'reviews', label: 'Reviews' },
];

/** The events the dashboard calls "meaningful": accounts, security and plans — not file edits. */
export const MEANINGFUL_ACTIONS = [
  'signup', 'login', 'login_failed', 'logout',
  'otp_verified', 'otp_failed', 'email_verified',
  'password_changed', 'password_reset_requested', 'password_reset',
  'plan_selected', 'onboarding_completed', 'subscription_updated',
  'user_activated', 'user_deactivated', 'user_deleted',
];

/** Every event an administrator can pick in the event filter, grouped. */
export const EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'signup', label: 'Signup' },
  { value: 'login', label: 'Login' },
  { value: 'login_failed', label: 'Failed login' },
  { value: 'logout', label: 'Logout' },
  { value: 'otp_requested', label: 'OTP requested' },
  { value: 'otp_resent', label: 'OTP resent' },
  { value: 'otp_verified', label: 'OTP verified' },
  { value: 'otp_failed', label: 'OTP failed' },
  { value: 'email_verified', label: 'Email verified' },
  { value: 'password_changed', label: 'Password changed' },
  { value: 'password_reset_requested', label: 'Password reset requested' },
  { value: 'password_reset', label: 'Password reset completed' },
  { value: 'onboarding_started', label: 'Onboarding started' },
  { value: 'plan_selected', label: 'Plan selected' },
  { value: 'onboarding_completed', label: 'Onboarding completed' },
  { value: 'subscription_updated', label: 'Subscription changed' },
  { value: 'profile_updated', label: 'Profile updated' },
  { value: 'avatar_updated', label: 'Avatar updated' },
  { value: 'user_activated', label: 'Account activated' },
  { value: 'user_deactivated', label: 'Account suspended' },
  { value: 'user_deleted', label: 'Account deleted' },
];

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

interface EventLook {
  label: string;
  icon: LucideIcon;
  tone: Tone;
}

const LOOK: Record<string, EventLook> = {
  login: { label: 'Login', icon: LogIn, tone: 'accent' },
  login_failed: { label: 'Failed login', icon: ShieldAlert, tone: 'danger' },
  logout: { label: 'Logout', icon: LogOut, tone: 'muted' },
  otp_requested: { label: 'OTP requested', icon: MessageSquareText, tone: 'accent' },
  otp_resent: { label: 'OTP resent', icon: MessageSquareText, tone: 'accent' },
  otp_failed: { label: 'OTP verification failed', icon: ShieldAlert, tone: 'danger' },
  email_verified: { label: 'Email verified', icon: MailCheck, tone: 'success' },
  password_changed: { label: 'Password changed', icon: KeyRound, tone: 'warning' },
  password_reset_requested: { label: 'Password reset requested', icon: KeyRound, tone: 'warning' },
  password_reset: { label: 'Password reset completed', icon: ShieldCheck, tone: 'success' },
  onboarding_started: { label: 'Onboarding started', icon: Rocket, tone: 'accent' },
  plan_selected: { label: 'Plan selected', icon: CreditCard, tone: 'accent' },
  onboarding_completed: { label: 'Onboarding completed', icon: BadgeCheck, tone: 'success' },
  subscription_updated: { label: 'Subscription changed', icon: CreditCard, tone: 'warning' },
  profile_updated: { label: 'Profile updated', icon: UserRound, tone: 'muted' },
  avatar_updated: { label: 'Avatar updated', icon: UserRound, tone: 'muted' },
  user_activated: { label: 'Account activated', icon: UserCheck, tone: 'success' },
  user_deactivated: { label: 'Account suspended', icon: UserX, tone: 'danger' },
  user_deleted: { label: 'Account deleted', icon: Trash2, tone: 'danger' },
  folder_created: { label: 'Folder created', icon: FolderClosed, tone: 'muted' },
  folder_renamed: { label: 'Folder renamed', icon: PencilLine, tone: 'muted' },
  folder_updated: { label: 'Folder updated', icon: PencilLine, tone: 'muted' },
  folder_deleted: { label: 'Folder deleted', icon: Trash2, tone: 'muted' },
  folder_restored: { label: 'Folder restored', icon: RotateCcw, tone: 'muted' },
  folder_permanently_deleted: { label: 'Folder permanently deleted', icon: Trash2, tone: 'muted' },
  media_uploaded: { label: 'File uploaded', icon: Upload, tone: 'muted' },
  media_renamed: { label: 'File renamed', icon: PencilLine, tone: 'muted' },
  media_updated: { label: 'File updated', icon: PencilLine, tone: 'muted' },
  media_moved: { label: 'File moved', icon: FolderClosed, tone: 'muted' },
  media_deleted: { label: 'File deleted', icon: Trash2, tone: 'muted' },
  media_restored: { label: 'File restored', icon: RotateCcw, tone: 'muted' },
  media_permanently_deleted: { label: 'File permanently deleted', icon: Trash2, tone: 'muted' },
  review_submitted: { label: 'Review submitted', icon: Star, tone: 'warning' },
  review_updated: { label: 'Review updated', icon: Star, tone: 'warning' },
  review_approved: { label: 'Review approved', icon: Star, tone: 'success' },
  review_rejected: { label: 'Review rejected', icon: Star, tone: 'danger' },
  review_published: { label: 'Review published', icon: Star, tone: 'success' },
  review_unpublished: { label: 'Review unpublished', icon: Star, tone: 'muted' },
  review_deleted: { label: 'Review deleted', icon: Trash2, tone: 'danger' },
};

const UPLOAD_ICON: Record<string, LucideIcon> = { image: ImageIcon, video: Video, document: FileText };

export const TONE_COLOR: Record<Tone, string> = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--muted)',
};

/** Label, icon and colour for one entry. */
export function describeEvent(entry: Pick<AdminActivityEntry, 'action' | 'authProvider' | 'purpose' | 'status' | 'fileType'>): EventLook {
  const base = LOOK[entry.action] ?? { label: entry.action.replace(/_/g, ' '), icon: Activity, tone: 'muted' as Tone };
  switch (entry.action) {
    case 'signup': {
      const by = entry.authProvider ? PROVIDER_LABEL[entry.authProvider] : null;
      return { label: by ? `${by} signup` : 'Account created', icon: entry.authProvider === 'mobile' ? Smartphone : UserPlus, tone: 'success' };
    }
    case 'login':
      return { ...base, label: entry.authProvider ? `Login · ${PROVIDER_LABEL[entry.authProvider]}` : 'Login' };
    case 'otp_verified':
      return entry.purpose === 'password_reset'
        ? { label: 'Reset code verified', icon: ShieldCheck, tone: 'success' }
        : { label: 'Mobile verified', icon: Smartphone, tone: 'success' };
    case 'password_changed':
      return entry.status === 'failure' ? { ...base, label: 'Password change failed', tone: 'danger', icon: ShieldAlert } : base;
    case 'media_uploaded':
      return { ...base, icon: (entry.fileType && UPLOAD_ICON[entry.fileType]) || Upload };
    default:
      return base;
  }
}

/** Human wording for a failure reason the server recorded. */
export const REASON_LABEL: Record<string, string> = {
  wrong_password: 'Wrong password',
  no_account: 'No such account',
  suspended: 'Account suspended',
  incorrect: 'Wrong code',
  expired: 'Code expired',
  locked: 'Too many attempts',
  invalid: 'Invalid code',
  invalid_token: 'Invalid Google token',
  nonce_mismatch: 'Google check failed',
  'unverified-email': 'Unverified Google email',
  'admin-account': 'Admin via Google refused',
  conflict: 'Linked to another Google account',
  inactive: 'Account suspended',
};
