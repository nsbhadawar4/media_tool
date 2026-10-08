import { Schema, model, Types, type Document } from 'mongoose';
import {
  ACTIVITY_ACTIONS,
  ACTIVITY_STATUSES,
  ACTIVITY_TARGET_TYPES,
  type ActivityAction,
  type ActivityStatus,
  type ActivityTargetType,
} from '../config/constants';
import { AUTH_PROVIDERS, type AuthProvider } from './User';

export interface IActivityLog extends Document {
  _id: Types.ObjectId;
  action: ActivityAction;
  targetType: ActivityTargetType;
  targetId?: Types.ObjectId | null;
  targetName?: string | null;
  message: string;
  performedBy?: Types.ObjectId | null;
  performedByEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
  /** Absent on entries written before the field existed: read as success. */
  status?: ActivityStatus;
  /** How the account signs in, for sign-up / sign-in events. */
  authProvider?: AuthProvider | null;
  /**
   * The account the event is *about* — its timeline in the admin panel. Usually the actor; for
   * an administrator's action on an account, that account; for a failed sign-in, the account
   * that was targeted (internal only — never shown to the person signing in).
   */
  subjectUserId?: Types.ObjectId | null;
  /** The email or E.164 number an auth event named, so pre-account events (codes) join a timeline. */
  subjectIdentifier?: string | null;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    // Indexed with createdAt below (the compound index also serves action-only lookups).
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true },
    targetType: { type: String, enum: ACTIVITY_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    targetName: { type: String, default: null },
    message: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    performedByEmail: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed },
    status: { type: String, enum: ACTIVITY_STATUSES, default: 'success' },
    authProvider: { type: String, enum: [...AUTH_PROVIDERS, null], default: null },
    subjectUserId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    subjectIdentifier: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The audit log's own order (newest/oldest, _id breaking ties) — so paging it never sorts in memory.
activityLogSchema.index({ createdAt: -1, _id: -1 });
// Per-account lookups: a user's own activity feed, and "last active" in the admin panel.
activityLogSchema.index({ performedBy: 1, createdAt: -1 });
// A user's timeline in the admin panel, and filtering the audit log by outcome.
activityLogSchema.index({ subjectUserId: 1, createdAt: -1 });
// Every branch of a user's timeline query ($or of these four) needs its own index, or MongoDB
// scans the whole collection for it — a partial index wouldn't do, as the planner can't prove an
// $in of strings matches its filter.
activityLogSchema.index({ subjectIdentifier: 1, createdAt: -1 });
activityLogSchema.index({ targetId: 1, createdAt: -1 });
activityLogSchema.index({ status: 1, createdAt: -1 });
activityLogSchema.index({ action: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema);
