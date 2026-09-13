import { Schema, model, type Document, type Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IAdmin extends Document {
  _id: Types.ObjectId;
  email: string;
  name: string;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
}

const adminSchema = new Schema<IAdmin>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
  },
  { timestamps: true },
);

adminSchema.methods.comparePassword = function comparePassword(
  this: IAdmin & { passwordHash: string },
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.passwordHash);
};

// Never leak the hash even if a query forgets to deselect it.
adminSchema.set('toJSON', {
  transform: (_doc, ret) => {
    const { passwordHash: _passwordHash, ...rest } = ret as unknown as Record<string, unknown>;
    return rest;
  },
});

export const Admin = model<IAdmin>('Admin', adminSchema);
