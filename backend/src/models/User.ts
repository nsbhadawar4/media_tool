import { Schema, model, type Document, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export const USER_ROLES = ['user', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  mobile?: string | null;
  role: UserRole;
  isActive: boolean;
  isEmailVerified: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  /** Hash of the current password-reset token, if a reset was requested and not yet used. */
  passwordResetTokenHash?: string | null;
  passwordResetExpiresAt?: Date | null;
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
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    // `select: false` keeps the hash out of every query that does not explicitly ask for
    // it, so a forgotten `.select()` cannot leak it through an API response.
    passwordHash: { type: String, required: true, select: false },
    mobile: { type: String, trim: true, default: null },
    /**
     * Set server-side only. Signup always writes 'user' regardless of the request body —
     * see authController.signup — so there is no public path to an admin account.
     */
    role: { type: String, enum: USER_ROLES, default: 'user', index: true },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    // `select: false` alongside passwordHash: a forgotten `.select()` elsewhere must not
    // leak a live reset token's hash through some other query's response.
    passwordResetTokenHash: { type: String, default: null, select: false, index: true },
    passwordResetExpiresAt: { type: Date, default: null, select: false },
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true },
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
  email: string;
  mobile: string | null;
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
    email: user.email,
    mobile: user.mobile ?? null,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

export const User = model<IUser>('User', userSchema);
