import { Schema, model, Types, type Document } from 'mongoose';
import { REVIEW_CATEGORIES, REVIEW_STATUSES, REVIEW_TEXT_MAX, type ReviewCategory, type ReviewStatus } from '../config/constants';

/**
 * One review per account, moderated before anyone else can see it.
 *
 * Visibility is two fields on purpose: `status` is the moderation decision and `isPublic` is
 * whether an approved review is currently shown. Public = approved AND isPublic, and that
 * condition is applied in the database query (see reviewService.PUBLIC_FILTER), never in a
 * browser. Who moderated, and why a review was rejected, stay internal.
 */
export interface IReview extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rating: number;
  reviewText: string;
  category: ReviewCategory;
  status: ReviewStatus;
  isPublic: boolean;
  approvedAt: Date | null;
  approvedBy: Types.ObjectId | null;
  rejectedAt: Date | null;
  rejectedBy: Types.ObjectId | null;
  /** Internal note for administrators. Never sent to the reviewer or the public. */
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    // unique: the "one review per account" rule holds even if two submissions race.
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: { validator: Number.isInteger, message: 'Rating must be a whole number' },
    },
    reviewText: { type: String, required: true, trim: true, maxlength: REVIEW_TEXT_MAX },
    category: { type: String, enum: REVIEW_CATEGORIES, default: 'overall' },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending' },
    isPublic: { type: Boolean, default: false },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: null, maxlength: 300 },
  },
  { timestamps: true },
);

// The public list: approved + public, newest approval first.
reviewSchema.index({ status: 1, isPublic: 1, approvedAt: -1 });
// The admin list: by status, newest first.
reviewSchema.index({ status: 1, createdAt: -1 });

export const Review = model<IReview>('Review', reviewSchema);
