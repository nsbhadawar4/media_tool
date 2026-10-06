'use client';

import { AdminReviewsView } from '@/components/reviews/admin/AdminReviewsView';

/** /admin/reviews: behind the admin layout's guard here and requireAdmin on every API call. */
export default function AdminReviewsPage() {
  return <AdminReviewsView />;
}
