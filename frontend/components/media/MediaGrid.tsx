'use client';

import type { ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { MediaSelection } from '@/hooks/useMediaSelection';
import type { Media } from '@/types/api';

interface MediaGridProps {
  media: Media[];
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  onSetCover?: (media: Media) => void;
  emptyMessage?: string;
  /** Call to action for the empty state — omit where there is nothing useful to offer. */
  emptyAction?: ReactNode;
  /** Omit to render a read-only grid with no checkboxes. */
  selection?: MediaSelection;
}

/**
 * Shared by the grid and its loading skeleton so the two line up exactly.
 *
 * `app-content-enter` is on the grid alone, not the skeleton: it is the arrival of the
 * real content that would otherwise be a hard cut, and fading the skeleton in as well
 * would only delay the thing being waited for.
 */
export const MEDIA_GRID_CLASSES =
  'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

export function MediaGrid({
  media,
  onPreview,
  onRename,
  onMove,
  onDelete,
  onSetCover,
  emptyMessage,
  emptyAction,
  selection,
}: MediaGridProps) {
  if (media.length === 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="No files here yet"
        description={emptyMessage ?? 'Upload photos, videos or documents to get started.'}
        action={emptyAction}
      />
    );
  }

  const isSelectionActive = (selection?.selectedCount ?? 0) > 0;

  return (
    <div className={`${MEDIA_GRID_CLASSES} app-content-enter`}>
      {media.map((item) => (
        <MediaCard
          key={item.id}
          media={item}
          onPreview={onPreview}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
          onSetCover={onSetCover}
          isSelected={selection?.isSelected(item.id) ?? false}
          onToggleSelect={selection?.toggle}
          isSelectionActive={isSelectionActive}
        />
      ))}
    </div>
  );
}

/** Placeholder tiles shown while the first page loads, matching the real grid's geometry. */
export function MediaGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={MEDIA_GRID_CLASSES}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="aspect-square w-full animate-pulse bg-surface-hover" />
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
