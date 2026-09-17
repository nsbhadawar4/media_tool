'use client';

import { useRouter } from 'next/navigation';
import { FolderClosed, PencilLine, FolderInput, Trash2, Image as ImageIcon } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import type { Folder } from '@/types/api';

interface FolderCardProps {
  folder: Folder;
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}

export function FolderCard({ folder, onRename, onMove, onDelete }: FolderCardProps) {
  const router = useRouter();
  const cover = typeof folder.coverImage === 'object' ? folder.coverImage : null;

  return (
    <div
      onClick={() => router.push(`/admin/folders/${folder._id}`)}
      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
    >
      {/*
        Square tile, matching MediaCard. `overflow-hidden` plus an absolutely positioned
        image is what keeps the aspect ratio: a tall cover left in the normal flow can
        out-grow an `aspect-ratio` box, because a flex item's `min-height: auto` lets its
        content push the box taller than the ratio asked for.
      */}
      <div className="relative aspect-square w-full overflow-hidden bg-surface-hover">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.thumbnailUrl ?? cover.viewUrl}
            alt={folder.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FolderClosed className="h-12 w-12 text-accent/60" />
          </div>
        )}
        {/* Visible on touch, hover-revealed where there is a pointer. */}
        <div className="absolute right-2 top-2 opacity-100 transition-opacity duration-150 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu
              triggerClassName="bg-black/40 text-white hover:bg-black/60 hover:text-white"
              items={[
                { label: 'Rename', icon: <PencilLine className="h-4 w-4" />, onClick: () => onRename(folder) },
                { label: 'Move', icon: <FolderInput className="h-4 w-4" />, onClick: () => onMove(folder) },
                {
                  label: 'Delete',
                  icon: <Trash2 className="h-4 w-4" />,
                  onClick: () => onDelete(folder),
                  danger: true,
                },
              ]}
            />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 px-3.5 py-3">
        <FolderClosed className="h-4 w-4 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{folder.name}</p>
          <p className="flex items-center gap-1 text-xs text-muted">
            <ImageIcon className="h-3 w-3" />
            {folder.itemCount} {folder.itemCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      </div>
    </div>
  );
}
