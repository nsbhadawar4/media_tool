import { api } from './client';

/** Shapes returned by /api/reviews and /api/admin/reviews (backend/src/services/reviewService.ts). */

export type ReviewStatus = 'pending' | 'approved' | 'rejected';
export type ReviewCategory = 'overall' | 'media' | 'documents' | 'games' | 'performance' | 'other';

export const REVIEW_TEXT_MIN = 10;
export const REVIEW_TEXT_MAX = 500;

export const REVIEW_CATEGORY_LABEL: Record<ReviewCategory, string> = {
  overall: 'Overall experience',
  media: 'Media',
  documents: 'Documents',
  games: 'Games',
  performance: 'Performance',
  other: 'Other',
};

export const RATING_LABEL: Record<number, string> = {
  1: 'Poor',
  2: 'Needs Improvement',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

/** The signed-in user's own review. */
export interface OwnReview {
  id: string;
  rating: number;
  reviewText: string;
  category: ReviewCategory;
  status: ReviewStatus;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewInput {
  rating: number;
  reviewText: string;
  category: ReviewCategory;
}

/** What anyone may see: no user id, no email, no moderation details. */
export interface PublicReview {
  id: string;
  displayName: string;
  verified: boolean;
  rating: number;
  reviewText: string;
  category: ReviewCategory;
  createdAt: string;
  approvedAt: string | null;
}

export interface PublicReviewStats {
  total: number;
  averageRating: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface AdminReview {
  id: string;
  rating: number;
  reviewText: string;
  category: ReviewCategory;
  status: ReviewStatus;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  user: { id: string; name: string; email: string; isActive: boolean } | null;
}

export interface AdminReviewStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  published: number;
  averageAll: number;
  averagePublic: number;
}

export type AdminReviewSort = 'newest' | 'oldest' | 'rating_desc' | 'rating_asc';

export interface AdminReviewQuery {
  status?: ReviewStatus;
  visibility?: 'public' | 'private';
  sort?: AdminReviewSort;
  rating?: number;
  category?: ReviewCategory;
  search?: string;
  page?: number;
  limit?: number;
}

export const reviewsApi = {
  mine: () => api.get<OwnReview | null>('/api/reviews/me'),
  create: (input: ReviewInput) => api.post<OwnReview>('/api/reviews', input),
  update: (input: ReviewInput) => api.put<OwnReview>('/api/reviews/me', input),
  publicList: (params: { sort?: 'newest' | 'rating'; limit?: number; page?: number } = {}) =>
    api.get<{ reviews: PublicReview[]; stats: PublicReviewStats }>('/api/reviews/public', { ...params }),
};

export const adminReviewsApi = {
  list: (params: AdminReviewQuery, signal?: AbortSignal) => api.get<AdminReview[]>('/api/admin/reviews', { ...params }, signal),
  stats: (signal?: AbortSignal) => api.get<AdminReviewStats>('/api/admin/reviews/stats', undefined, signal),
  get: (id: string) => api.get<AdminReview>(`/api/admin/reviews/${id}`),
  approve: (id: string) => api.patch<AdminReview>(`/api/admin/reviews/${id}/approve`),
  reject: (id: string, reason?: string) => api.patch<AdminReview>(`/api/admin/reviews/${id}/reject`, { reason: reason || undefined }),
  unpublish: (id: string) => api.patch<AdminReview>(`/api/admin/reviews/${id}/unpublish`),
  publish: (id: string) => api.patch<AdminReview>(`/api/admin/reviews/${id}/publish`),
  remove: (id: string) => api.delete<{ deleted: boolean }>(`/api/admin/reviews/${id}`),
};
