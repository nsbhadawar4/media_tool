import { Schema, model, Types, type Document } from 'mongoose';

/**
 * A course being generated (Admin → AI Course Generator): the brief, the outline and every chapter
 * written so far, kept as they arrive. Generation goes one step per request — the outline, then the
 * next missing chapter — so it fits short serverless requests; a rate limit or a failure pauses it
 * and it resumes from the first missing chapter, even after the page was closed. Chapters already
 * written are never written again, and each chapter slot can only be filled once, so retries can't
 * duplicate anything. Nothing here is public: the administrator reviews the result and saves it as
 * a course (then the job is complete).
 */
export type GenerationJobStatus = 'running' | 'paused' | 'ready' | 'complete' | 'discarded';

export interface IGenerationRetry {
  /** "outline" or "chapter:5" (0-based). */
  step: string;
  /** Rate-limited attempts so far at this step. */
  attempts: number;
  /** Not before then. */
  nextAt: Date;
}

export interface ICourseGenerationJob extends Document {
  _id: Types.ObjectId;
  classLevel: number;
  subjectKey: string;
  brief: Record<string, unknown>;
  engine: 'ai' | 'template';
  mode: 'new' | 'new-version';
  outline: Record<string, unknown> | null;
  chapters: Array<Record<string, unknown>>;
  by: { kind: string; provider: string | null; model: string | null } | null;
  status: GenerationJobStatus;
  retry: IGenerationRetry | null;
  /** Why it is paused (a safe message; never a key or raw provider reply). */
  lastError: { message: string; code: string | null; rateLimited: boolean } | null;
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICourseGenerationJob>(
  {
    classLevel: { type: Number, required: true, min: 1, max: 12 },
    subjectKey: { type: String, required: true },
    brief: { type: Schema.Types.Mixed, required: true },
    engine: { type: String, enum: ['ai', 'template'], required: true },
    mode: { type: String, enum: ['new', 'new-version'], default: 'new' },
    outline: { type: Schema.Types.Mixed, default: null },
    // Generated chapters, in order (stored as written; checked when the course is saved).
    chapters: { type: Schema.Types.Mixed, default: () => [] },
    by: { type: Schema.Types.Mixed, default: null },
    status: { type: String, enum: ['running', 'paused', 'ready', 'complete', 'discarded'], default: 'running' },
    retry: {
      type: new Schema<IGenerationRetry>({ step: { type: String, required: true }, attempts: { type: Number, required: true, min: 0 }, nextAt: { type: Date, required: true } }, { _id: false }),
      default: null,
    },
    lastError: {
      type: new Schema({ message: { type: String, required: true }, code: { type: String, default: null }, rateLimited: { type: Boolean, default: false } }, { _id: false }),
      default: null,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);

schema.index({ classLevel: 1, subjectKey: 1, status: 1, updatedAt: -1 });

export const CourseGenerationJob = model<ICourseGenerationJob>('CourseGenerationJob', schema);
