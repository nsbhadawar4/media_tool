'use client';

import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, Trash2, XCircle } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/lib/toast/ToastContext';
import { ApiError } from '@/lib/api/client';
import { REVIEW_CATEGORY_LABEL, RATING_LABEL, adminReviewsApi, type AdminReview } from '@/lib/api/reviews';
import { formatDate } from '@/utils/format';
import { ModerationBadge, VisibilityBadge } from '../ReviewStatusBadge';
import { StarDisplay } from '../ReviewStars';

export type ModerationAction = 'approve' | 'reject' | 'unpublish' | 'publish' | 'delete';

/** The actions a review offers in its current state (the server enforces the same rules). */
export function actionsFor(review: Pick<AdminReview, 'status' | 'isPublic'>): ModerationAction[] {
  if (review.status === 'pending') return ['reject', 'approve'];
  if (review.status === 'rejected') return ['approve'];
  return review.isPublic ? ['reject', 'unpublish'] : ['reject', 'publish'];
}

export const ACTION_LABEL: Record<ModerationAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  unpublish: 'Unpublish',
  publish: 'Publish',
  delete: 'Delete',
};

export const ACTION_ICON = { approve: CheckCircle2, reject: XCircle, unpublish: EyeOff, publish: Eye, delete: Trash2 } as const;

const SUCCESS: Record<ModerationAction, string> = {
  approve: 'Review approved and published successfully.',
  reject: 'Review rejected.',
  unpublish: 'Review unpublished.',
  publish: 'Review published successfully.',
  delete: 'Review deleted.',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Could not reach the server.';
    if (error.status === 403) return 'You do not have permission to do that.';
    if (error.status === 404) return 'That review no longer exists.';
    if (error.status >= 500) return 'Something went wrong. Please try again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Runs a moderation action, then refreshes every review query (list, stats, pending badge, public). */
export function useModeration(onDone?: (action: ModerationAction, review: AdminReview) => void) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, review, reason }: { action: ModerationAction; review: AdminReview; reason?: string }) => {
      switch (action) {
        case 'approve':
          return adminReviewsApi.approve(review.id);
        case 'reject':
          return adminReviewsApi.reject(review.id, reason);
        case 'unpublish':
          return adminReviewsApi.unpublish(review.id);
        case 'publish':
          return adminReviewsApi.publish(review.id);
        case 'delete':
          return adminReviewsApi.remove(review.id);
      }
    },
    onSuccess: (_data, { action, review }) => {
      toast.success(SUCCESS[action]);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['reviews', 'public'] });
      onDone?.(action, review);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

const CONFIRM: Record<Exclude<ModerationAction, 'reject'>, { title: string; description: string; confirm: string; danger: boolean }> = {
  approve: {
    title: 'Approve and publish this review?',
    description: 'Once approved, this review will become visible in the public Reviews section.',
    confirm: 'Approve & Publish',
    danger: false,
  },
  publish: {
    title: 'Publish this approved review?',
    description: 'It will be visible in the public Reviews section again. It stays approved.',
    confirm: 'Publish',
    danger: false,
  },
  unpublish: {
    title: 'Unpublish this review?',
    description: 'The review will remain approved but will no longer be visible publicly.',
    confirm: 'Unpublish',
    danger: true,
  },
  delete: {
    title: 'Delete this review permanently?',
    description: 'The review is removed from the database and cannot be recovered. To hide it, use Reject or Unpublish instead.',
    confirm: 'Delete',
    danger: true,
  },
};

/** The confirmation for whichever action is pending. Reject asks for an optional internal reason. */
export function ModerationDialog({
  pending,
  onClose,
  onConfirm,
  isLoading,
}: {
  pending: { action: ModerationAction; review: AdminReview } | null;
  onClose: () => void;
  onConfirm: (reason?: string) => void;
  isLoading: boolean;
}) {
  if (pending?.action === 'reject') {
    return <RejectDialog key={pending.review.id} onClose={onClose} onConfirm={onConfirm} isLoading={isLoading} />;
  }
  const copy = pending ? CONFIRM[pending.action as Exclude<ModerationAction, 'reject'>] : null;
  return (
    <ConfirmDialog
      isOpen={Boolean(pending)}
      onClose={onClose}
      onConfirm={() => onConfirm()}
      title={copy?.title ?? ''}
      description={copy?.description ?? ''}
      confirmLabel={copy?.confirm}
      isDangerous={copy?.danger ?? false}
      isLoading={isLoading}
    />
  );
}

function RejectDialog({ onClose, onConfirm, isLoading }: { onClose: () => void; onConfirm: (reason?: string) => void; isLoading: boolean }) {
  const [reason, setReason] = useState('');
  const id = useId();
  return (
    <Modal isOpen onClose={onClose} size="sm" hideCloseButton>
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <XCircle aria-hidden className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold text-foreground">Reject this review?</h2>
        <p className="mt-1.5 text-sm text-muted">It will not be shown publicly. The reviewer only sees that it was not published.</p>
      </div>
      <label htmlFor={id} className="mt-5 block text-sm font-medium text-foreground">
        Internal note <span className="font-normal text-muted">(optional, never shown to anyone else)</span>
      </label>
      <textarea
        id={id}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        rows={3}
        className="mt-1.5 w-full resize-none rounded-xl border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground outline-none focus-glow"
        placeholder="e.g. Spam, off-topic"
      />
      <div className="mt-5 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant="danger" className="flex-1" onClick={() => onConfirm(reason.trim() || undefined)} isLoading={isLoading}>
          Reject
        </Button>
      </div>
    </Modal>
  );
}

/** Everything about one review, with the actions its state allows. */
export function ReviewDetailModal({
  review,
  onClose,
  onAction,
}: {
  review: AdminReview | null;
  onClose: () => void;
  onAction: (action: ModerationAction, review: AdminReview) => void;
}) {
  return (
    <Modal isOpen={Boolean(review)} onClose={onClose} title="Review details" size="lg">
      {review && (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-foreground">{review.user?.name ?? 'Deleted account'}</p>
              <p className="truncate text-sm text-muted">{review.user?.email ?? '—'}</p>
              {review.user && !review.user.isActive && <p className="mt-1 text-xs font-medium text-warning">This account is deactivated, so its review is not shown publicly.</p>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <ModerationBadge status={review.status} />
              <VisibilityBadge status={review.status} isPublic={review.isPublic} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <StarDisplay value={review.rating} size="md" />
            <span className="text-sm font-semibold text-amber-500">{RATING_LABEL[review.rating]}</span>
            <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-foreground-soft">{REVIEW_CATEGORY_LABEL[review.category]}</span>
          </div>

          <p className="max-h-72 overflow-y-auto whitespace-pre-line wrap-break-word rounded-2xl border border-border bg-surface-hover/40 p-4 text-sm leading-relaxed text-foreground">{review.reviewText}</p>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Submitted</dt>
              <dd className="text-foreground">{formatDate(review.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Last updated</dt>
              <dd className="text-foreground">{formatDate(review.updatedAt)}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Status</dt>
              <dd className="text-foreground capitalize">{review.status}</dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-muted">Visibility</dt>
              <dd className="text-foreground">{review.status === 'approved' && review.isPublic ? 'Public — visible to everyone' : 'Private'}</dd>
            </div>
            {review.approvedAt && (
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-muted">Approved</dt>
                <dd className="text-foreground">{formatDate(review.approvedAt)}</dd>
              </div>
            )}
            {review.rejectedAt && (
              <div className="flex justify-between gap-3 sm:block">
                <dt className="text-muted">Rejected</dt>
                <dd className="text-foreground">{formatDate(review.rejectedAt)}</dd>
              </div>
            )}
            {review.rejectionReason && (
              <div className="sm:col-span-2">
                <dt className="text-muted">Internal note</dt>
                <dd className="text-foreground">{review.rejectionReason}</dd>
              </div>
            )}
          </dl>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" className="text-danger hover:text-danger" onClick={() => onAction('delete', review)}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <div className="flex flex-col gap-2 sm:flex-row">
              {actionsFor(review).map((action) => {
                const Icon = ACTION_ICON[action];
                return (
                  <Button
                    key={action}
                    variant={action === 'approve' || action === 'publish' ? 'primary' : action === 'reject' ? 'danger' : 'secondary'}
                    onClick={() => onAction(action, review)}
                  >
                    <Icon className="h-4 w-4" />
                    {action === 'approve' ? 'Approve & Publish' : ACTION_LABEL[action]}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Approve or reject several pending reviews. Each one goes through the same single-review endpoint
 * (same authorisation, same state machine), so a bulk action can never do anything an individual
 * one could not. Failures are counted and reported, not hidden.
 */
export function useBulkModeration(onDone: () => void) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, ids }: { action: 'approve' | 'reject'; ids: string[] }) => {
      const results = await Promise.allSettled(ids.map((id) => (action === 'approve' ? adminReviewsApi.approve(id) : adminReviewsApi.reject(id))));
      return { action, ok: results.filter((r) => r.status === 'fulfilled').length, failed: results.filter((r) => r.status === 'rejected').length };
    },
    onSuccess: ({ action, ok, failed }) => {
      if (ok) toast.success(action === 'approve' ? `${ok} review${ok === 1 ? '' : 's'} approved and published.` : `${ok} review${ok === 1 ? '' : 's'} rejected.`);
      if (failed) toast.error(`${failed} review${failed === 1 ? '' : 's'} could not be updated. Please try again.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      void queryClient.invalidateQueries({ queryKey: ['reviews', 'public'] });
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
