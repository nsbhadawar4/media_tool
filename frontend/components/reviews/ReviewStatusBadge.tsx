import { CheckCircle2, Clock3, EyeOff, Globe, Lock, XCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import type { ReviewStatus } from '@/lib/api/reviews';

type Visibility = 'pending' | 'published' | 'unpublished' | 'rejected';

export function visibilityOf(status: ReviewStatus, isPublic: boolean): Visibility {
  if (status === 'approved') return isPublic ? 'published' : 'unpublished';
  return status;
}

const STYLES: Record<Visibility, { label: string; icon: typeof Clock3; className: string }> = {
  pending: { label: 'Pending Review', icon: Clock3, className: 'border-amber-400/30 bg-amber-400/10 text-amber-500' },
  published: { label: 'Published', icon: CheckCircle2, className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-500' },
  unpublished: { label: 'Approved but unpublished', icon: EyeOff, className: 'border-sky-400/30 bg-sky-500/10 text-sky-400' },
  rejected: { label: 'Not Published', icon: XCircle, className: 'border-rose-400/30 bg-rose-500/10 text-rose-400' },
};

/** Status with an icon and words, never colour alone. */
export function ReviewStatusBadge({ status, isPublic, short = false, className }: { status: ReviewStatus; isPublic: boolean; short?: boolean; className?: string }) {
  const style = STYLES[visibilityOf(status, isPublic)];
  const Icon = style.icon;
  const label = short ? { pending: 'Pending', published: 'Published', unpublished: 'Unpublished', rejected: 'Rejected' }[visibilityOf(status, isPublic)] : style.label;
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', style.className, className)}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

/** What the reviewer is told about their own review — plain, and nothing internal. */
export const OWN_STATUS_MESSAGE: Record<Visibility, string> = {
  pending: 'Your feedback is waiting for approval.',
  published: 'This review is currently visible publicly.',
  unpublished: 'Approved but currently unpublished.',
  rejected: 'Your review was not approved, so it is not published.',
};

const MODERATION: Record<ReviewStatus, { label: string; icon: typeof Clock3; className: string }> = {
  pending: { label: 'Pending', icon: Clock3, className: 'border-amber-400/30 bg-amber-400/10 text-amber-500' },
  approved: { label: 'Approved', icon: CheckCircle2, className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-500' },
  rejected: { label: 'Rejected', icon: XCircle, className: 'border-rose-400/30 bg-rose-500/10 text-rose-400' },
};

/** Admin view: the moderation decision on its own (visibility is a separate badge). */
export function ModerationBadge({ status, className }: { status: ReviewStatus; className?: string }) {
  const style = MODERATION[status];
  const Icon = style.icon;
  return (
    <span key={status} className={cn('rv-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold', style.className, className)}>
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {style.label}
    </span>
  );
}

/** Admin view: whether visitors can see it. Public means approved AND published, nothing else. */
export function VisibilityBadge({ status, isPublic, className }: { status: ReviewStatus; isPublic: boolean; className?: string }) {
  const visible = status === 'approved' && isPublic;
  const Icon = visible ? Globe : Lock;
  return (
    <span
      key={String(visible)}
      className={cn(
        'rv-badge inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold',
        visible ? 'border-sky-400/30 bg-sky-500/10 text-sky-400' : 'border-border-strong bg-surface-hover text-muted',
        className,
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {visible ? 'Public' : 'Private'}
    </span>
  );
}
