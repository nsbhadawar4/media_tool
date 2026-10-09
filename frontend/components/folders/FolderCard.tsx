'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { FolderInput, FolderOpen, PencilLine, Trash2, Upload } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { FolderIcon } from './FolderIcon';
import { formatRelativeTime } from '@/utils/format';
import { cn } from '@/utils/cn';
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
  /** Position in the grid, for the staggered entrance. */
  index?: number;
}

export function FolderCard({ folder, onRename, onMove, onDelete, onUpload, index = 0 }: FolderCardProps) {
  const router = useNavigationRouter();
  const cover = typeof folder.coverImage === 'object' ? folder.coverImage : null;
  const href = `/folders/${folder._id}`;
  const itemLabel = `${folder.itemCount} ${folder.itemCount === 1 ? 'item' : 'items'}`;

  return (
    <div
      style={{ '--i': index } as CSSProperties}
      className="card-interactive anim-rise-scale group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-surface"
    >
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

      <div className="relative aspect-[4/3] w-full overflow-hidden bg-linear-to-br from-surface-hover to-surface">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover.thumbnailUrl ?? cover.viewUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {/*
              Sized as a share of the tile rather than a fixed pixel box, so the folder keeps
              the same presence whether the grid is two columns wide on a phone or six on a
              desktop.
            */}
            <FolderIcon
              hasContents={folder.itemCount > 0}
              className="h-auto w-[52%] drop-shadow-[0_10px_18px_rgba(0,0,0,0.35)] transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:scale-110"
            />
          </div>
        )}

        {/* Bottom scrim: keeps the badge legible on any photo, and deepens on hover. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/60 via-black/5 to-transparent opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-accent/0 transition-colors duration-300 group-hover:bg-accent/8"
        />

        {/* The folder cue. On a cover photo it is the only thing saying "folder"; it drifts
            up a little on hover. */}
        {cover && (
          <span className="pointer-events-none absolute bottom-3 left-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/40 backdrop-blur-md transition-transform duration-300 ease-out group-hover:-translate-y-1">
            <FolderIcon className="h-4 w-4" />
          </span>
        )}

        {/* Revealed on hover with a pointer; always visible on touch, which has no hover. */}
        <div
          className={cn(
            'absolute right-2.5 top-2.5 z-20 transition-all duration-200',
            'opacity-100 lg:translate-y-1 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:focus-within:translate-y-0 lg:focus-within:opacity-100',
          )}
        >
          <DropdownMenu
            triggerClassName="border border-white/10 bg-black/45 text-white backdrop-blur-md hover:bg-black/70 hover:text-white"
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

      <div className="border-t border-border px-3.5 py-3">
        <p className="truncate text-sm font-semibold tracking-tight text-foreground" title={folder.name}>
          {folder.name}
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs tabular-nums text-muted">
          <span>{itemLabel}</span>
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <span className="truncate text-subtle" title="Last updated">{formatRelativeTime(folder.updatedAt)}</span>
        </p>
      </div>
    </div>
  );
}
