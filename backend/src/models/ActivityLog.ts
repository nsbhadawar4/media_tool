import { Schema, model, Types, type Document } from 'mongoose';
import { ACTIVITY_ACTIONS, ACTIVITY_TARGET_TYPES, type ActivityAction, type ActivityTargetType } from '../config/constants';

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
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    action: { type: String, enum: ACTIVITY_ACTIONS, required: true, index: true },
    targetType: { type: String, enum: ACTIVITY_TARGET_TYPES, required: true },
    targetId: { type: Schema.Types.ObjectId, default: null },
    targetName: { type: String, default: null },
    message: { type: String, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
    performedByEmail: { type: String, default: null },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

activityLogSchema.index({ createdAt: -1 });

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema);
