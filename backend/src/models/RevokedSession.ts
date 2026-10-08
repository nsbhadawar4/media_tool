import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * Sessions that were ended before their token expired — today, by logging out.
 *
 * Session tokens are stateless JWTs, so "log out" can only clear the cookie in the browser
 * that asked; a copy of the token taken earlier would stay valid until it expired. Recording
 * the token's session id here lets requireAuth refuse it everywhere. Each entry deletes itself
 * (TTL index) once the token it describes would have expired anyway, so the collection only
 * ever holds sessions that could still be replayed.
 */
export interface IRevokedSession extends Document {
  sid: string;
  userId: Types.ObjectId;
  expiresAt: Date;
}

const revokedSessionSchema = new Schema<IRevokedSession>(
  {
    sid: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

revokedSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedSession = model<IRevokedSession>('RevokedSession', revokedSessionSchema);
