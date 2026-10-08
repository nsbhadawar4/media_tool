import { Schema, model, Types, type Document } from 'mongoose';

/**
 * A course: an administrator-authored sequence of lessons, optionally tied to a Kid Games class
 * and subject. Unlike the code catalog, courses are entirely data — what is written here is what
 * users read on /courses.
 *
 * Lesson bodies are plain text (rendered as text, never HTML), and a lesson link can only be an
 * http(s) URL (validated on the way in).
 */
export interface ICourseLesson {
  _id: Types.ObjectId;
  title: string;
  body: string;
  url: string | null;
}

export interface ICourse extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  summary: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  /** e.g. "6–8 years". */
  ageGroup: string | null;
  learningObjective: string;
  lessons: Types.DocumentArray<ICourseLesson & Types.Subdocument>;
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
  archivedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const lessonSchema = new Schema<ICourseLesson>({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, default: '', maxlength: 10_000 },
  url: { type: String, default: null },
});

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    summary: { type: String, default: '', trim: true, maxlength: 500 },
    classLevel: { type: Number, default: null, min: 1, max: 12 },
    subject: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', null], default: null },
    ageGroup: { type: String, default: null, trim: true, maxlength: 40 },
    learningObjective: { type: String, default: '', trim: true, maxlength: 1000 },
    lessons: { type: [lessonSchema], default: [] },
    order: { type: Number, required: true },
    isEnabled: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

courseSchema.index({ slug: 1 }, { unique: true });
courseSchema.index({ archivedAt: 1, order: 1 });
courseSchema.index({ classLevel: 1, subject: 1, order: 1 });

export const Course = model<ICourse>('Course', courseSchema);
