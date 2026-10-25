import { Schema, model, Types, type Document } from 'mongoose';

/**
 * A signed-in learner's progress in one chapter: which of its lessons they started and finished,
 * and their quiz results. One record per user per chapter; every query is filtered by the userId
 * from the session. Lessons are recorded by their id, so editing or reordering a chapter keeps
 * progress where it belongs. (Kid Games keeps its own, game-based progress — see KidGameProgress.)
 */
export interface ILessonProgress {
  lessonId: Types.ObjectId;
  startedAt: Date;
  completedAt: Date | null;
  /** Where the learner stopped inside the lesson (its step, 0-based): reopening resumes there. 0 once finished. */
  position?: number;
  /** Times the learner finished the lesson, and their best score (0–100) over those. */
  attempts?: number;
  score?: number | null;
  lastAccessedAt?: Date;
}

export interface ICourseProgress extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  chapterId: Types.ObjectId;
  classLevel: number;
  subject: string;
  lessons: ILessonProgress[];
  /** The lesson the learner touched last in this chapter, and when. */
  lastLessonId?: Types.ObjectId | null;
  lastAccessedAt?: Date;
  quiz: { best: number; last: number; attempts: number; total: number; at: Date } | null;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<ICourseProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    chapterId: { type: Schema.Types.ObjectId, ref: 'Course', required: true },
    classLevel: { type: Number, required: true, min: 1, max: 12 },
    subject: { type: String, required: true },
    lessons: {
      type: [new Schema<ILessonProgress>(
          {
            lessonId: { type: Schema.Types.ObjectId, required: true },
            startedAt: { type: Date, required: true },
            completedAt: { type: Date, default: null },
            position: { type: Number, min: 0, max: 500, default: 0 },
            attempts: { type: Number, min: 0, default: 0 },
            score: { type: Number, min: 0, max: 100, default: null },
            lastAccessedAt: { type: Date },
          },
          { _id: false },
        )],
      default: [],
    },
    lastLessonId: { type: Schema.Types.ObjectId, default: null },
    lastAccessedAt: { type: Date },
    quiz: {
      type: new Schema(
        { best: { type: Number, min: 0, max: 100 }, last: { type: Number, min: 0, max: 100 }, attempts: { type: Number, min: 0 }, total: { type: Number, min: 0 }, at: Date },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);

schema.index({ userId: 1, chapterId: 1 }, { unique: true });
schema.index({ userId: 1, classLevel: 1 });
// "Continue learning": a learner's most recently touched chapters.
schema.index({ userId: 1, updatedAt: -1 });
// Learner statistics per chapter (admin).
schema.index({ chapterId: 1 });

export const CourseProgress = model<ICourseProgress>('CourseProgress', schema);
