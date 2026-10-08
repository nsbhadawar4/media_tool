import { Schema, model, Types, type Document } from 'mongoose';
import { CONTENT_TYPES, DIFFICULTIES, GAME_TYPES, type ContentType, type Difficulty, type GameType } from '../config/constants';

/**
 * One entry of the admin-managed content catalog: a home-page section, a Kid Games class or
 * subject, the link saying a class offers a subject (class_subject), a Kid Game, or an arcade game.
 *
 * The learning hierarchy is Class → Subject (via class_subject) → Course → Game.
 *
 * Gameplay itself is code; this is what an administrator controls about it — the title and
 * description shown, whether it is listed (isVisible) and usable at all (isEnabled), its position,
 * and archiving. Entries from code are seeded once (source 'code'); an administrator may add more
 * (source 'admin'), which stay unlisted to users until code implements them.
 */
export interface IContentItem extends Document {
  _id: Types.ObjectId;
  type: ContentType;
  /** Stable code identifier: section id, class slug, subject id, Kid Game id or game slug. */
  key: string;
  title: string;
  description: string;
  /** Classes: their level. Kid Games: the class they belong to. */
  classLevel: number | null;
  /** Kid Games and class ↔ subject links: the subject key. */
  subject: string | null;
  /** An image shown with the entry (http(s) only). */
  thumbnailUrl: string | null;
  /** Subjects: a short mark shown on their card, e.g. "A B C". */
  glyph: string | null;
  /** Kid Games: how hard, and which game mechanic plays it. */
  difficulty: Difficulty | null;
  gameType: GameType | null;
  /** Kid Games: the course it belongs to, if any (same class and subject). */
  courseId: Types.ObjectId | null;
  /** Position among its siblings (Kid Games: within class + subject). */
  order: number;
  isEnabled: boolean;
  isVisible: boolean;
  source: 'code' | 'admin';
  /** Soft delete: archived entries are gone for users and restorable by an administrator. */
  archivedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const contentItemSchema = new Schema<IContentItem>(
  {
    type: { type: String, enum: CONTENT_TYPES, required: true },
    key: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    classLevel: { type: Number, default: null, min: 1, max: 12 },
    subject: { type: String, default: null },
    thumbnailUrl: { type: String, default: null },
    glyph: { type: String, default: null, maxlength: 12 },
    difficulty: { type: String, enum: [...DIFFICULTIES, null], default: null },
    gameType: { type: String, enum: [...GAME_TYPES, null], default: null },
    courseId: { type: Schema.Types.ObjectId, ref: 'Course', default: null },
    order: { type: Number, required: true },
    isEnabled: { type: Boolean, default: true },
    isVisible: { type: Boolean, default: true },
    source: { type: String, enum: ['code', 'admin'], default: 'admin' },
    archivedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// One entry per type + key (also what makes seeding idempotent).
contentItemSchema.index({ type: 1, key: 1 }, { unique: true });
// The admin lists and the public catalog: by type, then sibling group and position.
contentItemSchema.index({ type: 1, classLevel: 1, subject: 1, order: 1 });
// A course's games.
contentItemSchema.index({ courseId: 1 }, { partialFilterExpression: { courseId: { $type: 'objectId' } } });

export const ContentItem = model<IContentItem>('ContentItem', contentItemSchema);
