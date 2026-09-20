'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderInput, FolderOpen, PencilLine, Trash2, Upload } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { FolderIcon } from './FolderIcon';
import type { Folder } from '@/types/api';

interface FolderCardProps {
  folder: Folder;
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  /**
   * Adds "Upload files" to the menu, targeting this folder. Omitted on pages that have no
   * upload queue mounted — offering the action there would open a picker that goes nowhere.
   */
  onUpload?: (folder: Folder) => void;
}

export function FolderCard({ folder, onRename, onMove, onDelete, onUpload }: FolderCardProps) {
  const router = useRouter();
  const cover = typeof folder.coverImage === 'object' ? folder.coverImage : null;
  const href = `/folders/${folder._id}`;
  const itemLabel = `${folder.itemCount} ${folder.itemCount === 1 ? 'item' : 'items'}`;

  return (
    <div className="app-pressable group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md">
      {/*
        The card's primary action is a real link covering the card rather than an onClick on
        the wrapper: that gets the folder into the keyboard order, gives it middle-click and
        "open in new tab", and lets it be read as a link. The actions menu sits above it in
        the stacking order instead of inside it, since a button nested in a link is invalid
        markup that also swallows the button's own clicks.
      */}
      <Link
        href={href}
        aria-label={`Open folder ${folder.name}, ${itemLabel}`}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-linear-to-b from-surface-hover to-surface">
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.thumbnailUrl ?? cover.viewUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
            {/* A cover photo alone looks like a file, so the tile keeps a folder cue. */}
            <span className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/45 backdrop-blur-sm">
              <FolderIcon className="h-4 w-4" />
            </span>
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/*
              Sized as a share of the tile rather than a fixed pixel box, so the folder keeps
              the same presence whether the grid is two columns wide on a phone or six on a
              desktop. A fixed height would also letterbox it: the mark is 48x40, so a square
              `h-14 w-14` box drew a 56x47 folder and padded the rest, leaving it adrift in
              the middle of the tile.
            */}
            <FolderIcon
              hasContents={folder.itemCount > 0}
              className="h-auto w-[62%] transition-transform duration-200 group-hover:scale-105"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground" title={folder.name}>
            {folder.name}
          </p>
          <p className="truncate text-xs tabular-nums text-muted">{itemLabel}</p>
        </div>
        {/* Docked in the footer rather than floated over the tile: it stays legible over any
            cover photo, and reaches touch users without depending on a hover state. */}
        <div className="relative z-20 shrink-0">
          <DropdownMenu
            triggerLabel={`Actions for folder ${folder.name}`}
            items={[
              { label: 'Open', icon: <FolderOpen className="h-4 w-4" />, onClick: () => router.push(href) },
              ...(onUpload
                ? [{ label: 'Upload files', icon: <Upload className="h-4 w-4" />, onClick: () => onUpload(folder) }]
                : []),
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
  );
}
