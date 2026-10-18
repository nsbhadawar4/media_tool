import { Schema, model, Types, type Document } from 'mongoose';

/**
 * A course: an administrator-authored sequence of lessons, optionally tied to a Kid Games class
 * and subject. Unlike the code catalog, courses are entirely data — what is written here is what
 * users read on /courses.
 *
 * Lesson bodies are plain text (rendered as text, never HTML), and a lesson link can only be an
 * http(s) URL (validated on the way in).
 */
export const QUESTION_TYPES = ['mcq', 'true-false', 'fill-blank', 'short-answer', 'match', 'word-problem'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * One question. In a lesson (questions and practice) the answer is part of what learners study and
 * is shown to them on request; in a chapter's quiz it is kept on the server, which marks the quiz.
 */
export interface ICourseQuestion {
  type?: QuestionType | null;
  prompt: string;
  options: string[];
  answer: string;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  explanation?: string;
}

/**
 * A lesson: its explanation (body), examples, key points, questions with answers and extra
 * practice. Lessons written before these fields existed have a body only (and read as such).
 */
export interface ICourseLesson {
  _id: Types.ObjectId;
  title: string;
  body: string;
  url: string | null;
  examples: string[];
  keyPoints: string[];
  questions: ICourseQuestion[];
  practice: ICourseQuestion[];
  estimatedMinutes: number | null;
}

/** Who wrote a chapter (or last generated a course): an AI provider, the template generator, or a person. */
export interface IContentSource {
  kind: 'ai' | 'template' | 'manual';
  provider: string | null;
  model: string | null;
  at: Date | null;
}

/** A class ↔ subject link's course details (see ContentItem.course). */
export interface ICourseInfo {
  title: string;
  objectives: string[];
  language: 'english' | 'hindi' | 'bilingual' | 'hinglish' | null;
  level: 'beginner' | 'basic' | 'intermediate' | 'advanced' | null;
  source: IContentSource | null;
}

export interface ICourseActivity {
  type: 'multiple-choice' | 'fill-blank' | 'match-pair' | 'number-problems';
  title: string;
  instructions: string;
  questions: ICourseQuestion[];
}

/** A free educational resource, by reference only: never the work itself. */
export interface IFreeResource {
  title: string;
  author: string | null;
  source: string;
  url: string;
  type: 'book' | 'image' | 'link';
  license: string;
  thumbnailUrl: string | null;
}

export interface ICourse extends Document {
  _id: Types.ObjectId;
  title: string;
  slug: string;
  summary: string;
  /** A chapter's closing summary (what it covered); empty for chapters written before it existed. */
  recap: string;
  classLevel: number | null;
  subject: string | null;
  thumbnailUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  /** e.g. "6–8 years". */
  ageGroup: string | null;
  learningObjective: string;
  lessons: Types.DocumentArray<ICourseLesson & Types.Subdocument>;
  /** Chapters from the Course & Class Generator: what learners can do after it. */
  objectives: string[];
  estimatedMinutes: number | null;
  activities: ICourseActivity[];
  quiz: ICourseQuestion[];
  resources: IFreeResource[];
  /** Made by the generator (replaced when the subject is generated again); false for hand-written courses. */
  generated: boolean;
  /**
   * Generated but not published yet: hidden from everyone but administrators (who preview it).
   * Publishing the class swaps a subject's drafts in for its earlier generated chapters, which are
   * archived — so generating never changes what learners see until an administrator publishes.
   */
  draft: boolean;
  /**
   * A draft from a new version of the course: publishing it archives the subject's earlier generated
   * chapters. False for a single chapter added as a draft, which is published on its own.
   * (Drafts saved before this field existed read as true, as they were made that way.)
   */
  supersedes: boolean;
  source: IContentSource | null;
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
  archivedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const questionSchema = new Schema<ICourseQuestion>(
  {
    type: { type: String, enum: [...QUESTION_TYPES, null], default: null },
    prompt: { type: String, required: true, trim: true, maxlength: 500 },
    options: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
    answer: { type: String, default: '', trim: true, maxlength: 300 },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', null], default: null },
    explanation: { type: String, default: '', trim: true, maxlength: 500 },
  },
  { _id: false },
);

const lessonSchema = new Schema<ICourseLesson>({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  body: { type: String, default: '', maxlength: 10_000 },
  url: { type: String, default: null },
  examples: { type: [{ type: String, trim: true, maxlength: 500 }], default: [] },
  keyPoints: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
  questions: { type: [questionSchema], default: [] },
  practice: { type: [questionSchema], default: [] },
  estimatedMinutes: { type: Number, default: null, min: 0, max: 1000 },
});

export const sourceSchema = new Schema<IContentSource>(
  {
    kind: { type: String, enum: ['ai', 'template', 'manual'], required: true },
    provider: { type: String, default: null },
    model: { type: String, default: null },
    at: { type: Date, default: null },
  },
  { _id: false },
);

const activitySchema = new Schema<ICourseActivity>(
  {
    type: { type: String, enum: ['multiple-choice', 'fill-blank', 'match-pair', 'number-problems'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    instructions: { type: String, default: '', trim: true, maxlength: 500 },
    questions: { type: [questionSchema], default: [] },
  },
  { _id: false },
);

export const resourceSchema = new Schema<IFreeResource>(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    author: { type: String, default: null, trim: true, maxlength: 120 },
    source: { type: String, required: true, trim: true, maxlength: 60 },
    url: { type: String, required: true, trim: true, maxlength: 2000 },
    type: { type: String, enum: ['book', 'image', 'link'], default: 'link' },
    license: { type: String, default: '', trim: true, maxlength: 200 },
    thumbnailUrl: { type: String, default: null, trim: true, maxlength: 2000 },
  },
  { _id: false },
);

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    summary: { type: String, default: '', trim: true, maxlength: 500 },
    recap: { type: String, default: '', trim: true, maxlength: 1500 },
    classLevel: { type: Number, default: null, min: 1, max: 12 },
    subject: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard', null], default: null },
    ageGroup: { type: String, default: null, trim: true, maxlength: 40 },
    learningObjective: { type: String, default: '', trim: true, maxlength: 1000 },
    lessons: { type: [lessonSchema], default: [] },
    objectives: { type: [{ type: String, trim: true, maxlength: 300 }], default: [] },
    estimatedMinutes: { type: Number, default: null, min: 0, max: 100000 },
    activities: { type: [activitySchema], default: [] },
    quiz: { type: [questionSchema], default: [] },
    resources: { type: [resourceSchema], default: [] },
    generated: { type: Boolean, default: false },
    draft: { type: Boolean, default: false },
    supersedes: { type: Boolean, default: true },
    source: { type: sourceSchema, default: null },
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
