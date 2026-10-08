import { Schema, model } from 'mongoose';
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';

/**
 * One rate-limit window: `_id` is "<limiter>:<key>", e.g. "login-ip:203.0.113.9".
 * Rows remove themselves when their window ends (TTL index).
 */
interface IRateLimitWindow {
  _id: string;
  count: number;
  resetAt: Date;
}

const rateLimitWindowSchema = new Schema<IRateLimitWindow>(
  {
    _id: { type: String, required: true },
    count: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'ratelimits' },
);
rateLimitWindowSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimitWindow = model<IRateLimitWindow>('RateLimitWindow', rateLimitWindowSchema);

const isDuplicateKey = (err: unknown) => typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/**
 * express-rate-limit's counters, kept in MongoDB instead of process memory.
 *
 * In memory, every serverless instance (and every cold start) has its own counters, so a limit
 * of 10 becomes 10 per instance — and an attacker's requests spread across instances barely
 * register. Here every instance counts against the same window. Used for the authentication
 * limiters, where the count is the protection; the high-volume general API limiter stays in
 * memory, where approximate is fine.
 */
export class MongoRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = `${prefix}:`;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string): string {
    return `${this.prefix}${key}`;
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    const doc = await RateLimitWindow.findOne({ _id: this.id(key), resetAt: { $gt: new Date() } }).lean();
    return doc ? { totalHits: doc.count, resetTime: doc.resetAt } : undefined;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const _id = this.id(key);
    for (let attempt = 0; attempt < 3; attempt++) {
      const now = new Date();
      // A live window: count this hit in it.
      const live = await RateLimitWindow.findOneAndUpdate({ _id, resetAt: { $gt: now } }, { $inc: { count: 1 } }, { new: true }).lean();
      if (live) return { totalHits: live.count, resetTime: live.resetAt };
      // None, or it has ended: start a new one. If another instance starts it at the same
      // moment, the insert collides on _id and the loop counts against theirs instead.
      try {
        const started = await RateLimitWindow.findOneAndUpdate(
          { _id, resetAt: { $lte: now } },
          { $set: { count: 1, resetAt: new Date(now.getTime() + this.windowMs) } },
          { new: true, upsert: true },
        ).lean();
        return { totalHits: started!.count, resetTime: started!.resetAt };
      } catch (err) {
        if (!isDuplicateKey(err)) throw err;
      }
    }
    throw new Error('Rate limit window could not be updated');
  }

  /**
   * Un-counts a request that turned out not to count (a successful sign-in, with
   * skipSuccessfulRequests). express-rate-limit calls this after the response has gone and
   * doesn't wait for it, so it must never reject: a failure here would be an unhandled
   * rejection, and costs nothing worse than one extra count in the window.
   */
  async decrement(key: string): Promise<void> {
    try {
      await RateLimitWindow.updateOne({ _id: this.id(key), resetAt: { $gt: new Date() }, count: { $gt: 0 } }, { $inc: { count: -1 } });
    } catch {
      // See above.
    }
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitWindow.deleteOne({ _id: this.id(key) });
  }
}
