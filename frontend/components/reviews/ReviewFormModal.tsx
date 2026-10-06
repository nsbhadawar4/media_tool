'use client';

import { useId, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Star } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/lib/toast/ToastContext';
import { ApiError } from '@/lib/api/client';
import {
  REVIEW_CATEGORY_LABEL,
  REVIEW_TEXT_MAX,
  REVIEW_TEXT_MIN,
  reviewsApi,
  type OwnReview,
  type ReviewCategory,
} from '@/lib/api/reviews';
import { cn } from '@/utils/cn';
import { StarRatingInput } from './ReviewStars';

export const MY_REVIEW_KEY = ['reviews', 'me'] as const;

const CATEGORY_OPTIONS = (Object.keys(REVIEW_CATEGORY_LABEL) as ReviewCategory[]).map((value) => ({ value, label: REVIEW_CATEGORY_LABEL[value] }));

/** Turns any API failure into one plain sentence for the form. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'Could not reach the server. Check your connection and try again.';
    if (error.status === 401) return 'Your session has ended. Please sign in again.';
    if (error.status === 429) return error.message;
    if (error.status >= 500) return 'Something went wrong on our side. Please try again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

/**
 * "Share Your Experience": a new review, or an edit of the user's own. Validation mirrors the
 * server's (1–5 stars, 10–500 characters after trimming), so the user hears about a problem
 * before sending, and the server still checks everything.
 */
export function ReviewFormModal({ isOpen, onClose, existing }: { isOpen: boolean; onClose: () => void; existing: OwnReview | null }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const textId = useId();
  const helpId = useId();
  const ratingErrorId = useId();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [text, setText] = useState(existing?.reviewText ?? '');
  const [category, setCategory] = useState<ReviewCategory>(existing?.category ?? 'overall');
  const [touched, setTouched] = useState(false);
  const [done, setDone] = useState<'created' | 'updated' | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const trimmed = text.trim();
  const ratingError = rating < 1 ? 'Please choose a rating.' : null;
  const textError = trimmed.length < REVIEW_TEXT_MIN ? `Please write at least ${REVIEW_TEXT_MIN} characters.` : trimmed.length > REVIEW_TEXT_MAX ? `Please keep it under ${REVIEW_TEXT_MAX} characters.` : null;

  const mutation = useMutation({
    mutationFn: () => {
      const input = { rating, reviewText: trimmed, category };
      return existing ? reviewsApi.update(input) : reviewsApi.create(input);
    },
    onSuccess: (result) => {
      queryClient.setQueryData<OwnReview | null>(MY_REVIEW_KEY, result.data);
      setDone(existing ? 'updated' : 'created');
      toast.success(existing ? 'Review updated and sent for approval.' : 'Review submitted successfully.');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        // Submitted from another tab or device: load it, so the next save edits instead.
        void queryClient.invalidateQueries({ queryKey: MY_REVIEW_KEY });
        setServerError('You already submitted a review. Close this and choose Edit Review to change it.');
        return;
      }
      setServerError(messageFor(error));
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setServerError(null);
    if (ratingError || textError) return;
    mutation.mutate();
  };

  if (done) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} size="sm" hideCloseButton>
        <div className="rv-success flex flex-col items-center py-2 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-500">
            <CheckCircle2 aria-hidden className="h-7 w-7" />
          </span>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
            Thank you for your feedback!
            <Star aria-hidden className="h-5 w-5 fill-amber-400 text-amber-400" />
          </h2>
          <p className="mt-1.5 text-sm text-muted">
            {done === 'updated' ? 'Your updated review has been submitted for approval.' : 'Your review has been submitted and is waiting for approval.'}
          </p>
          <Button className="mt-6 w-full" onClick={onClose} autoFocus>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  const showErrors = touched;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={existing ? 'Edit Your Review' : 'Share Your Experience'} size="md">
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="rounded-2xl border border-border bg-surface-hover/40 px-4 py-4 text-center">
          <p className="mb-2 text-sm font-medium text-foreground-soft">How would you rate Media Tool?</p>
          <StarRatingInput value={rating} onChange={setRating} invalid={showErrors && Boolean(ratingError)} describedBy={showErrors && ratingError ? ratingErrorId : undefined} />
          {showErrors && ratingError && (
            <p id={ratingErrorId} role="alert" className="mt-1 text-xs font-medium text-danger">
              {ratingError}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={textId} className="mb-1.5 block text-sm font-medium text-foreground">
            Tell us about your experience
          </label>
          <textarea
            id={textId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => text && setTouched(true)}
            rows={5}
            maxLength={REVIEW_TEXT_MAX + 50}
            placeholder="What do you like? What could be better?"
            aria-invalid={(showErrors && Boolean(textError)) || undefined}
            aria-describedby={helpId}
            className={cn(
              'w-full resize-y rounded-xl border bg-surface-elevated px-3.5 py-3 text-sm leading-relaxed text-foreground outline-none transition placeholder:text-muted/70 focus-glow',
              showErrors && textError ? 'border-danger/60' : 'border-border hover:border-border-strong',
            )}
          />
          <div id={helpId} className="mt-1.5 flex items-start justify-between gap-3 text-xs">
            <span className={cn(showErrors && textError ? 'font-medium text-danger' : 'text-muted')} role={showErrors && textError ? 'alert' : undefined}>
              {showErrors && textError ? textError : `At least ${REVIEW_TEXT_MIN} characters.`}
            </span>
            <span className={cn('shrink-0 tabular-nums', trimmed.length > REVIEW_TEXT_MAX ? 'font-semibold text-danger' : 'text-muted')}>
              {trimmed.length} / {REVIEW_TEXT_MAX}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-medium text-foreground">
            Category <span className="font-normal text-muted">(optional)</span>
          </p>
          <Select aria-label="Category" options={CATEGORY_OPTIONS} value={category} onChange={(e) => setCategory(e.target.value as ReviewCategory)} className="h-10 w-full" />
        </div>

        {existing && existing.status !== 'pending' && (
          <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs text-foreground-soft">Saving changes sends your review back for approval before it can be shown again.</p>
        )}

        {serverError && (
          <p role="alert" className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {serverError}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {existing ? 'Save & Resubmit' : 'Submit Review'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
