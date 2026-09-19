'use client';

import type { ReactNode } from 'react';
import { FolderClosed } from 'lucide-react';
import { FolderCard } from './FolderCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Folder } from '@/types/api';

interface FolderGridProps {
  folders: Folder[];
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onUpload?: (folder: Folder) => void;
  emptyMessage?: string;
  /** Call to action for the empty state — omit where there is nothing useful to offer. */
  emptyAction?: ReactNode;
}

/** Shared by the grid and its skeleton so the two line up exactly. */
export const FOLDER_GRID_CLASSES =
  'grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';

export function FolderGrid({
  folders,
  onRename,
  onMove,
  onDelete,
  onUpload,
  emptyMessage,
  emptyAction,
}: FolderGridProps) {
  if (folders.length === 0) {
    return (
      <EmptyState
        icon={FolderClosed}
        title="No folders yet"
        description={emptyMessage ?? 'Create a folder to start organizing your library.'}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={FOLDER_GRID_CLASSES}>
      {folders.map((folder) => (
        <FolderCard
          key={folder._id}
          folder={folder}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
          onUpload={onUpload}
        />
      ))}
    </div>
  );
}

export function FolderGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className={FOLDER_GRID_CLASSES}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-border bg-surface">
          <div className="aspect-[4/3] w-full animate-pulse bg-surface-hover" />
          <div className="flex flex-col gap-2 px-3 py-2.5">
            <div className="h-3 w-3/4 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-surface-hover" />
          </div>
        </div>
      ))}
    </div>
  );
}
