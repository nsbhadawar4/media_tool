export type FileType = 'image' | 'video' | 'document';

export type SortOption = 'newest' | 'oldest' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc';

export type FolderSortOption = 'name_asc' | 'name_desc' | 'newest' | 'oldest';

export type UserRole = 'user' | 'admin';

/** How an account signs up / in. */
export type AuthProvider = 'email' | 'mobile' | 'google';

export interface UserProfile {
  id: string;
  /** Null for accounts created by mobile-number signup. */
  email: string | null;
  /** The verified phone number (E.164), for accounts that have one. */
  phone: string | null;
  authProvider: AuthProvider;
  googleLinked: boolean;
  /** A phone number proved by OTP exists on the account. */
  mobileVerified: boolean;
  /** First-time onboarding (choosing a plan) still to do. Always false for admins. */
  onboardingRequired: boolean;
  onboardingCompleted: boolean;
  /** The plan chosen (null: never chose). A paid plan may still be awaiting payment. */
  plan: 'free' | 'pro' | 'premium' | null;
  subscriptionStatus: 'active' | 'pending' | 'cancelled' | null;
  /** What the account can actually use: Free unless the chosen plan is active. */
  effectivePlan: 'free' | 'pro' | 'premium';
  planSelectedAt: string | null;
  name: string;
  role: UserRole;
  /** Optional at signup, so null is a real answer rather than missing data. */
  mobile: string | null;
  /** Profile photo as a data URL; null means show initials. */
  avatarUrl?: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

/** Only what may change. Omitted fields are left alone; `mobile: null` clears it. */
export interface UpdateProfileInput {
  name?: string;
  email?: string;
  mobile?: string | null;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
  mobile?: string;
}

/** Step 1 of mobile signup. `country` is an ISO code (IN, US…); the backend normalises the number. */
export interface MobileSignupStartInput {
  name: string;
  country: string;
  mobile: string;
  password: string;
  confirmPassword: string;
}

/** What the code screen needs. `signupToken` ties the signup to this browser; keep it in memory only. */
export interface MobileSignupState {
  phone: string;
  maskedPhone: string;
  expiresInSeconds: number;
  resendInSeconds: number;
}
export interface MobileSignupStarted extends MobileSignupState {
  signupToken: string;
}

export interface MobileSignupVerifyInput {
  phone: string;
  signupToken: string;
  otp: string;
}

export interface MobileLoginInput {
  country: string;
  mobile: string;
  password: string;
  rememberMe?: boolean;
}

/** GET /api/auth/signup/mobile/config — false when no SMS provider can deliver codes (e.g. production without one). */
export interface MobileSignupConfig {
  enabled: boolean;
}

/** GET /api/auth/google/config — the client ID is public; the nonce is also set as an HTTP-only cookie. */
export interface GoogleConfig {
  enabled: boolean;
  clientId: string | null;
  nonce: string | null;
}

export interface GoogleSignInResult {
  user: UserProfile;
  created: boolean;
  /** True when linking turned off a password set before the email was proved (see backend). */
  passwordDisabled: boolean;
}

export interface ForgotPasswordInput {
  email: string;
}

export interface VerifyOtpInput {
  email: string;
  otp: string;
}

export interface VerifyOtpResult {
  verified: boolean;
  /** Authorization for the final step (resetPassword) — never the OTP itself. */
  resetToken: string;
}

export interface ResetPasswordInput {
  resetToken: string;
  newPassword: string;
  confirmPassword: string;
}

/** One row of the admin user list: the account plus how much it is storing. */
export interface AdminUserSummary extends UserProfile {
  folderCount: number;
  mediaCount: number;
  storageUsedBytes: number;
  /** Latest of the newest activity-log entry and the last sign-in; null if neither exists. */
  lastActiveAt: string | null;
}

/** GET /api/admin/users/stats. "Suspended" is an account with isActive=false. */
export interface AdminUserStats {
  total: number;
  active: number;
  suspended: number;
  newUsers: number;
  newUserWindowDays: number;
  /** Accounts by how they sign up/in. Accounts from before the field count as email. */
  byProvider: { email: number; mobile: number; google: number };
  /** Normal users by plan; one who hasn't chosen yet uses Free. */
  byPlan: { free: number; pro: number; premium: number };
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  totalFolders: number;
  totalMedia: number;
  storageUsedBytes: number;
  /** User-activity figures; "today" starts at the `todayStart` the request sent. */
  users: {
    todayStart: string;
    newToday: number;
    newThisWeek: number;
    activeToday: number;
    activeThisMonth: number;
    loginsToday: number;
    failedLoginsToday: number;
    newThisWeekByProvider: { email: number; mobile: number; google: number };
    byPlan: { free: number; pro: number; premium: number };
  };
}

export type ActivityCategory = 'auth' | 'signup' | 'security' | 'account' | 'onboarding' | 'content' | 'reviews';

/** One entry of GET /api/admin/activity — installation-wide, unlike ActivityLog below. */
export interface AdminActivityEntry {
  id: string;
  action: string;
  categories: ActivityCategory[];
  status: 'success' | 'failure';
  /** How the account signed up / in, for those events. */
  authProvider: AuthProvider | null;
  /** For code events: what the code was for. */
  purpose: 'mobile_signup' | 'password_reset' | null;
  /** For failures: why. */
  reason: string | null;
  targetType: 'folder' | 'media' | 'auth' | 'user' | 'review';
  targetId: string | null;
  targetName: string | null;
  message: string;
  performedBy: string | null;
  performedByEmail: string | null;
  /** For upload entries: the kind of file, or null if the file no longer exists. */
  fileType: FileType | null;
  /** The account the event concerns. */
  user: { id: string; name: string; label: string; role: 'user' | 'admin' } | null;
  /** What the event named when no account matched (a masked number, or an email). */
  subjectLabel: string | null;
  device: string | null;
  os: string | null;
  browser: string | null;
  /** Masked by the server ("203.0.113.•••"); the full address never reaches the browser. */
  ipMasked: string | null;
  createdAt: string;
}

export interface Folder {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  parentFolder: string | null;
  path: string[];
  coverImage?: Media | string | null;
  itemCount: number;
  isDeleted: boolean;
  deletedAt: string | null;
  /** Set when this folder was trashed only because an ancestor was — see the trash system. */
  deletedCascadeRoot?: string | null;
  /** Protected folders cannot be deleted through the UI or the API. */
  isProtected?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Media {
  id: string;
  folderId: string | null;
  originalName: string;
  mimeType: string;
  fileType: FileType;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedCascadeRoot?: string | null;
  viewUrl: string;
  downloadUrl: string;
  /** Small derived preview. Null when none could be generated — fall back to viewUrl or a placeholder. */
  thumbnailUrl: string | null;
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface ActivityLog {
  _id: string;
  action: string;
  targetType: 'folder' | 'media' | 'auth';
  targetId: string | null;
  targetName: string | null;
  message: string;
  performedByEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface DashboardStats {
  totalFolders: number;
  totalImages: number;
  totalVideos: number;
  totalDocuments: number;
  storageUsedBytes: number;
  trashItems: number;
}

export interface DashboardRecent {
  recentUploads: Media[];
  recentActivity: ActivityLog[];
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ApiFailure {
  success: false;
  error: { message: string; details?: unknown; code?: string };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
