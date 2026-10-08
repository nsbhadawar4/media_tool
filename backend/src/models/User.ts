import { Schema, model, type Document, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** How an account was created. Absent on accounts that predate it — see authProviderOf. */
export const AUTH_PROVIDERS = ['email', 'mobile', 'google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/** Plans a user can pick. Prices and features live in the frontend's plan config. */
export const PLANS = ['free', 'pro', 'premium'] as const;
export type Plan = (typeof PLANS)[number];

/**
 * State of the chosen plan. A paid plan is `pending` from the moment it is chosen and stays
 * so until a real, verified payment exists — nothing in the app can mark it `active` today.
 */
export const SUBSCRIPTION_STATUSES = ['active', 'pending', 'cancelled'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  /** Absent for accounts created by mobile-number signup. */
  email?: string | null;
  passwordHash: string;
  mobile?: string | null;
  /**
   * A phone number proved by OTP, in E.164 form (+919876543210). Unique where present, and the
   * identifier mobile-signup accounts sign in with. Separate from `mobile`, which is free text
   * the user typed and was never verified, so it can't identify anyone.
   */
  phoneE164?: string | null;
  phoneVerifiedAt?: Date | null;
  /** Google account id (the ID token's `sub`), once this account signs in with Google. */
  googleId?: string | null;
  authProvider?: AuthProvider;
  /**
   * True only for accounts that still have first-time onboarding to do (today: new Google
   * accounts). Missing on every older account, which reads as false — they never see it.
   */
  onboardingRequired?: boolean;
  onboardingCompletedAt?: Date | null;
  /** The plan the user chose (paid ones may still be awaiting payment — see subscriptionStatus). */
  plan?: Plan | null;
  planSelectedAt?: Date | null;
  subscriptionStatus?: SubscriptionStatus | null;
  /** When the plan became active. Null for a plan still awaiting payment. */
  subscriptionStartedAt?: Date | null;
  /** End of the paid period. Always null until payments exist; Free never expires. */
  subscriptionExpiresAt?: Date | null;
  /** Profile photo as a small data URL (see authController.uploadAvatar), or null for initials. */
  avatarUrl?: string | null;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  /** When the account last made an authenticated request — recorded at most every few minutes (requireAuth). */
  lastActiveAt?: Date | null;
  /** Hash of the current password-reset OTP, if one was requested and not yet used/expired. */
  passwordResetOtpHash?: string | null;
  passwordResetOtpExpiresAt?: Date | null;
  /** Wrong guesses against the current OTP; hitting the limit invalidates it — see passwordResetService. */
  passwordResetOtpAttempts?: number;
  /** When the last OTP was sent, so a resend can be cooled down without a second DB round trip. */
  passwordResetOtpLastSentAt?: Date | null;
  /** Start of the current 24-hour window for counting reset codes sent, and the count in it. */
  passwordResetSendWindowStartedAt?: Date | null;
  passwordResetSendCount?: number;
  /**
   * Hash of the short-lived authorization minted once an OTP is verified. resetPassword
   * requires this, never the OTP itself — see passwordResetService for why that's what
   * makes "no reset without a verified OTP" actually enforced server-side.
   */
  passwordResetAuthTokenHash?: string | null;
  passwordResetAuthExpiresAt?: Date | null;
  /**
   * Bumped whenever a password reset completes, and embedded in every session token
   * (see SessionTokenPayload). requireAuth rejects a token whose version doesn't match
   * this, so completing a reset signs every other device out — the one place in this app
   * a password change does that; see passwordResetService for why.
   */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    /**
     * Optional since mobile-number signup, which creates accounts without one. Uniqueness is a
     * partial index (below) — a plain unique index would count every missing email as the same
     * value and allow only one email-less account.
     */
    email: {
      type: String,
      lowercase: true,
      trim: true,
    },
    // `select: false` keeps the hash out of every query that does not explicitly ask for
    // it, so a forgotten `.select()` cannot leak it through an API response.
    passwordHash: { type: String, required: true, select: false },
    mobile: { type: String, trim: true, default: null },
    phoneE164: { type: String, trim: true },
    phoneVerifiedAt: { type: Date, default: null },
    googleId: { type: String },
    authProvider: { type: String, enum: AUTH_PROVIDERS },
    onboardingRequired: { type: Boolean },
    onboardingCompletedAt: { type: Date, default: null },
    plan: { type: String, enum: PLANS, default: null },
    planSelectedAt: { type: Date, default: null },
    subscriptionStatus: { type: String, enum: SUBSCRIPTION_STATUSES, default: null },
    subscriptionStartedAt: { type: Date, default: null },
    subscriptionExpiresAt: { type: Date, default: null },
    avatarUrl: { type: String, default: null },
    /**
     * Set server-side only. Signup always writes 'user' regardless of the request body —
     * see authController.signup — so there is no public path to an admin account.
     */
    role: { type: String, enum: USER_ROLES, default: 'user', index: true },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    lastActiveAt: { type: Date, default: null },
    // `select: false` alongside passwordHash: a forgotten `.select()` elsewhere must not
    // leak a live OTP hash or reset authorization through some other query's response.
    passwordResetOtpHash: { type: String, default: null, select: false, index: true },
    passwordResetOtpExpiresAt: { type: Date, default: null, select: false },
    passwordResetOtpAttempts: { type: Number, default: 0, select: false },
    passwordResetOtpLastSentAt: { type: Date, default: null, select: false },
    passwordResetSendWindowStartedAt: { type: Date, default: null, select: false },
    passwordResetSendCount: { type: Number, default: 0, select: false },
    passwordResetAuthTokenHash: { type: String, default: null, select: false, index: true },
    passwordResetAuthExpiresAt: { type: Date, default: null, select: false },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
);

/** Must match USER_EMAIL_INDEX in config/userIndexes.ts, which migrates older databases to it. */
userSchema.index(
  { email: 1 },
  { unique: true, name: 'email_unique_present', partialFilterExpression: { email: { $type: 'string' } } },
);
// Admin user lists sort by newest, and the "new users" figure filters by signup date.
userSchema.index({ createdAt: -1, _id: -1 });
// Admin user list: sorting by recent sign-in / activity, and the provider and plan filters.
userSchema.index({ lastActiveAt: -1, lastLoginAt: -1, _id: -1 });
userSchema.index({ lastLoginAt: -1, _id: -1 });
userSchema.index({ authProvider: 1, createdAt: -1 });
userSchema.index({ plan: 1, createdAt: -1 });
userSchema.index(
  { googleId: 1 },
  { unique: true, name: 'google_unique_present', partialFilterExpression: { googleId: { $type: 'string' } } },
);
userSchema.index(
  { phoneE164: 1 },
  { unique: true, name: 'phone_unique_present', partialFilterExpression: { phoneE164: { $type: 'string' } } },
);

userSchema.methods.comparePassword = function comparePassword(
  this: IUser & { passwordHash: string },
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Belt and braces alongside `select: false`: strip the hash even if a query loaded it.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { passwordHash: _passwordHash, ...rest } = ret as unknown as Record<string, unknown>;
    return rest;
  },
});

/** The shape safe to send to any client. Never includes passwordHash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string | null;
  /** The verified phone number (E.164), for accounts that have one. */
  phone: string | null;
  authProvider: AuthProvider;
  /** Whether Google sign-in is linked. The Google id itself is never sent to clients. */
  googleLinked: boolean;
  /** A verified phone number exists (proved by OTP at mobile signup). Derived from phoneVerifiedAt. */
  mobileVerified: boolean;
  onboardingRequired: boolean;
  /** The inverse of onboardingRequired, for readability; accounts from before onboarding read as completed. */
  onboardingCompleted: boolean;
  /** What the user chose (null: never chose — accounts from before plans existed). */
  plan: Plan | null;
  subscriptionStatus: SubscriptionStatus | null;
  /** What they can actually use: the chosen plan only once it is active; Free otherwise. */
  effectivePlan: Plan;
  planSelectedAt: Date | null;
  mobile: string | null;
  avatarUrl: string | null;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
}

export function toPublicUser(user: IUser): PublicUser {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email ?? null,
    phone: user.phoneE164 ?? null,
    authProvider: authProviderOf(user),
    googleLinked: Boolean(user.googleId),
    mobileVerified: Boolean(user.phoneE164 && user.phoneVerifiedAt),
    onboardingRequired: user.role !== 'admin' && user.onboardingRequired === true,
    onboardingCompleted: !(user.role !== 'admin' && user.onboardingRequired === true),
    plan: user.plan ?? null,
    subscriptionStatus: user.subscriptionStatus ?? null,
    effectivePlan: user.plan && user.subscriptionStatus === 'active' ? user.plan : 'free',
    planSelectedAt: user.planSelectedAt ?? null,
    mobile: user.mobile ?? null,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/** The stored provider, or the one implied by an account that predates the field. */
export function authProviderOf(user: Pick<IUser, 'authProvider' | 'googleId' | 'email' | 'phoneE164'>): AuthProvider {
  if (user.authProvider) return user.authProvider;
  if (!user.email && user.phoneE164) return 'mobile';
  return 'email';
}

/** How an account is referred to in logs and admin lists: its email, or its phone number. */
export function accountLabel(user: Pick<IUser, 'email' | 'phoneE164'>): string {
  return user.email ?? user.phoneE164 ?? 'unknown account';
}

export const User = model<IUser>('User', userSchema);
