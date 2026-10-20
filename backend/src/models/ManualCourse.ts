import { Schema, model, Types, type Document } from 'mongoose';

/**
 * A course written entirely by hand in Admin → Manual Courses — its own collection, separate from
 * the generated courses (Course documents, written by the AI Course Generator or its editor), which
 * it never reads or changes. One document holds the whole course: chapters → lessons → questions, in
 * order (their position is their display order). Each part has a stable `uid` of its own, so the
 * builder can copy, paste, duplicate and reorder parts without ever reusing one.
 *
 * Learners see it only when it is published and visible, its class and subject are open to them, and
 * it is not in Trash — then on its class's subject page, with only its published chapters and lessons.
 */
export const MANUAL_QUESTION_TYPES = ['mcq', 'true-false', 'short-answer'] as const;
export type ManualQuestionType = (typeof MANUAL_QUESTION_TYPES)[number];
export type ManualStatus = 'draft' | 'published';

export interface IManualQuestion {
  uid: string;
  type: ManualQuestionType;
  prompt: string;
  /** mcq: up to four choices (A–D); empty for the other types. */
  options: string[];
  /** mcq: one of the options; true-false: "True" or "False"; short-answer: the expected answer. */
  answer: string;
  explanation: string;
}

export interface IManualLesson {
  uid: string;
  title: string;
  description: string;
  content: string;
  status: ManualStatus;
  questions: IManualQuestion[];
}

export interface IManualChapter {
  uid: string;
  title: string;
  description: string;
  status: ManualStatus;
  lessons: IManualLesson[];
}

export interface IManualCourse extends Document {
  _id: Types.ObjectId;
  /** Always "manual" — what tells these courses apart from the generated ones. */
  source: 'manual';
  classLevel: number;
  subjectKey: string;
  title: string;
  description: string;
  /** Its learner address: /classes/class-N/<subject>/manual/<slug>. */
  slug: string;
  status: ManualStatus;
  isVisible: boolean;
  chapters: IManualChapter[];
  /** Bumped on every save: a save based on an older revision is refused (no silent overwrite). */
  revision: number;
  publishedAt: Date | null;
  /** In Manual Courses → Trash since then (restorable), and by whom. */
  deletedAt: Date | null;
  deletedBy: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const uid = { type: String, required: true, match: /^[A-Za-z0-9_-]{6,64}$/ };
const status = { type: String, enum: ['draft', 'published'] as ManualStatus[], default: 'draft' as ManualStatus };

const questionSchema = new Schema<IManualQuestion>(
  {
    uid,
    type: { type: String, enum: MANUAL_QUESTION_TYPES, required: true },
    prompt: { type: String, default: '', maxlength: 2000 },
    options: { type: [{ type: String, maxlength: 300 }], default: [] },
    answer: { type: String, default: '', maxlength: 1000 },
    explanation: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const lessonSchema = new Schema<IManualLesson>(
  {
    uid,
    title: { type: String, default: '', maxlength: 160 },
    description: { type: String, default: '', maxlength: 1000 },
    content: { type: String, default: '', maxlength: 20000 },
    status,
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false },
);

const chapterSchema = new Schema<IManualChapter>(
  {
    uid,
    title: { type: String, default: '', maxlength: 160 },
    description: { type: String, default: '', maxlength: 1000 },
    status,
    lessons: { type: [lessonSchema], default: [] },
  },
  { _id: false },
);

const manualCourseSchema = new Schema<IManualCourse>(
  {
    source: { type: String, enum: ['manual'], default: 'manual', immutable: true },
    classLevel: { type: Number, required: true, min: 1, max: 12 },
    subjectKey: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, default: '', maxlength: 2000 },
    slug: { type: String, required: true },
    status,
    isVisible: { type: Boolean, default: true },
    chapters: { type: [chapterSchema], default: [] },
    revision: { type: Number, default: 1 },
    publishedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

manualCourseSchema.index({ slug: 1 }, { unique: true });
// The admin list (newest first, filters), and a subject's published courses for learners.
manualCourseSchema.index({ deletedAt: 1, updatedAt: -1 });
manualCourseSchema.index({ classLevel: 1, subjectKey: 1, status: 1, isVisible: 1, deletedAt: 1 });

export const ManualCourse = model<IManualCourse>('ManualCourse', manualCourseSchema);
