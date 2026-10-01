'use client';

import type { ReactNode } from 'react';
import { FileText, ImageOff, SearchX } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { DocumentCard } from './DocumentCard';
import { MediaRow } from './MediaRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MediaSelection } from '@/hooks/useMediaSelection';
import type { Media } from '@/types/api';

export type MediaView = 'grid' | 'list';

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
  /** 'list' renders rows; 'grid' renders cards. */
  view?: MediaView;
  /** A documents-only page gets paper-style cards instead of square photo tiles. */
  documentsOnly?: boolean;
  /** True when the empty result is the answer to a search rather than an empty library. */
  isSearching?: boolean;
  onClearSearch?: () => void;
}

/**
 * Shared by the grid and its loading skeleton so the two line up exactly.
 *
 * `app-content-enter` is on the grid alone, not the skeleton: it is the arrival of the
 * real content that would otherwise be a hard cut, and fading the skeleton in as well
 * would only delay the thing being waited for.
 */
export const MEDIA_GRID_CLASSES =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

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
  view = 'grid',
  documentsOnly = false,
  isSearching = false,
  onClearSearch,
}: MediaGridProps) {
  if (media.length === 0) {
    if (isSearching) {
      return (
        <EmptyState
          icon={SearchX}
          title="No results"
          description={emptyMessage ?? 'Nothing matches your search. Try a different name.'}
          action={
            onClearSearch && (
              <button
                type="button"
                onClick={onClearSearch}
                className="rounded-xl border border-border bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-surface-hover"
              >
                Clear search
              </button>
            )
          }
        />
      );
    }
    return (
      <EmptyState
        icon={documentsOnly ? FileText : ImageOff}
        title={documentsOnly ? 'No documents yet' : 'No files here yet'}
        description={emptyMessage ?? 'Upload photos, videos or documents to get started.'}
        action={emptyAction}
      />
    );
  }

  const isSelectionActive = (selection?.selectedCount ?? 0) > 0;

  const shared = (item: Media) => ({
    media: item,
    onPreview,
    onRename,
    onMove,
    onDelete,
    isSelected: selection?.isSelected(item.id) ?? false,
    onToggleSelect: selection?.toggle,
    isSelectionActive,
  });

  if (view === 'list') {
    return (
      <div className="app-content-enter overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
        {media.map((item) => (
          <MediaRow key={item.id} {...shared(item)} onSetCover={onSetCover} />
        ))}
      </div>
    );
  }

  return (
    <div className={`${MEDIA_GRID_CLASSES} app-content-enter`}>
      {media.map((item) =>
        documentsOnly ? (
          <DocumentCard key={item.id} {...shared(item)} />
        ) : (
          <MediaCard key={item.id} {...shared(item)} onSetCover={onSetCover} />
        ),
      )}
    </div>
  );
}

/** Placeholder tiles shown while the first page loads, matching the real grid's geometry. */
export function MediaGridSkeleton({ count = 12, view = 'grid' }: { count?: number; view?: MediaView }) {
  if (view === 'list') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-surface" role="status" aria-label="Loading files">
        {Array.from({ length: Math.min(count, 8) }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
            <Skeleton className="h-5 w-5 rounded-md" />
            <Skeleton className="h-11 w-11 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="hidden h-3 w-16 sm:block" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className={MEDIA_GRID_CLASSES} role="status" aria-label="Loading files">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <Skeleton className="aspect-square w-full rounded-none" />
          <div className="flex flex-col gap-2 px-3.5 py-3">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
