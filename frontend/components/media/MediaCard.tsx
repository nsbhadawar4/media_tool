'use client';

import type { MouseEvent } from 'react';
import { Check, Download, Eye, FolderInput, ImagePlus, PencilLine, Play, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { Badge } from '@/components/ui/Badge';
import { MediaThumbnail } from './MediaThumbnail';
import { formatBytes, formatDateShort, formatDuration } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Media } from '@/types/api';

interface MediaCardProps {
  media: Media;
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  /** Only passed when browsing a specific folder — lets an image be set as that folder's cover. */
  onSetCover?: (media: Media) => void;
  isSelected?: boolean;
  /** `extendRange` is true for a shift-click, which selects everything back to the last click. */
  onToggleSelect?: (id: string, extendRange: boolean) => void;
  /** True once anything is selected: checkboxes stay visible and a plain click selects rather than previews. */
  isSelectionActive?: boolean;
}

const TYPE_BADGE_VARIANT = {
  image: 'accent',
  video: 'warning',
  document: 'default',
} as const;

export function MediaCard({
  media,
  onPreview,
  onRename,
  onMove,
  onDelete,
  onSetCover,
  isSelected = false,
  onToggleSelect,
  isSelectionActive = false,
}: MediaCardProps) {
  const isSelectable = Boolean(onToggleSelect);
  const duration = formatDuration(media.duration);

  // Once a selection exists, clicking a tile extends it instead of opening a preview —
  // the same behaviour as a desktop file manager. Ctrl/Cmd or Shift starts one.
  const handleTileClick = (event: MouseEvent<HTMLButtonElement>) => {
    const wantsSelection = event.shiftKey || event.metaKey || event.ctrlKey;
    if (isSelectable && (isSelectionActive || wantsSelection)) {
      onToggleSelect!(media.id, event.shiftKey);
      return;
    }
    onPreview(media);
  };

  return (
    <div
      className={cn(
        'app-pressable group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-sm transition duration-200',
        isSelected
          ? 'border-accent ring-2 ring-accent/30'
          : 'border-border hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md',
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-surface-hover">
        <MediaThumbnail media={media} />

        {/*
          The tile's primary action covers the whole image as its own layer rather than
          wrapping it. The checkbox and the actions menu are interactive too, and nesting
          buttons inside a button is invalid markup that also leaves them unreachable by
          keyboard — so they sit above this layer instead.
        */}
        <button
          type="button"
          onClick={handleTileClick}
          aria-label={isSelectionActive ? `Select ${media.originalName}` : `Preview ${media.originalName}`}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        />

        {/* Darkens the tile on hover so overlaid controls stay legible over any image. */}
        <span
          className={cn(
            'pointer-events-none absolute inset-0 z-20 bg-linear-to-b from-black/40 via-transparent to-black/30 opacity-0 transition-opacity duration-200 group-hover:opacity-100',
            isSelected && 'opacity-100',
          )}
        />

        {media.fileType === 'video' && (
          <>
            <span className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white opacity-100 backdrop-blur-sm transition duration-200 lg:opacity-0 lg:group-hover:scale-110 lg:group-hover:opacity-100">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </span>
            {duration && (
              <span className="pointer-events-none absolute bottom-2 right-2 z-20 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                {duration}
              </span>
            )}
          </>
        )}

        {isSelectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${media.originalName}`}
            onClick={(event) => onToggleSelect!(media.id, event.shiftKey)}
            className={cn(
              'absolute left-2 top-2 z-30 flex h-6 w-6 items-center justify-center rounded-md border-2 transition duration-150',
              isSelected
                ? 'border-accent bg-accent text-accent-foreground'
                // Sits over anything from a dark photo to a near-white document placeholder,
                // so it carries its own contrast rather than relying on the hover scrim.
                : 'border-white bg-black/55 text-transparent shadow-[0_0_0_1px_rgba(0,0,0,0.3)] backdrop-blur-sm hover:bg-black/70',
              // Hover-reveal only where there is a pointer; on touch it must stay visible
              // or selection mode cannot be entered at all.
              isSelected || isSelectionActive
                ? 'opacity-100'
                : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
            )}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        )}

        <div
          className={cn(
            'absolute right-2 top-2 z-30 transition-opacity duration-150',
            // Hidden mid-selection: per-item actions do not apply when acting on a group.
            isSelectionActive
              ? 'pointer-events-none opacity-0'
              : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100',
          )}
        >
          <DropdownMenu
            triggerClassName="bg-black/45 text-white backdrop-blur-sm hover:bg-black/70 hover:text-white"
            items={[
              { label: 'Preview', icon: <Eye className="h-4 w-4" />, onClick: () => onPreview(media) },
              {
                label: 'Download',
                icon: <Download className="h-4 w-4" />,
                onClick: () => window.open(media.downloadUrl, '_blank'),
              },
              { label: 'Rename', icon: <PencilLine className="h-4 w-4" />, onClick: () => onRename(media) },
              { label: 'Move', icon: <FolderInput className="h-4 w-4" />, onClick: () => onMove(media) },
              ...(onSetCover && media.fileType === 'image'
                ? [
                    {
                      label: 'Set as folder cover',
                      icon: <ImagePlus className="h-4 w-4" />,
                      onClick: () => onSetCover(media),
                    },
                  ]
                : []),
              {
                label: 'Delete',
                icon: <Trash2 className="h-4 w-4" />,
                onClick: () => onDelete(media),
                danger: true,
              },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <p className="truncate text-sm font-medium text-foreground" title={media.originalName}>
          {media.originalName}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={TYPE_BADGE_VARIANT[media.fileType]}>{media.fileType}</Badge>
          <span className="text-xs tabular-nums text-muted">{formatBytes(media.size)}</span>
        </div>
        <p className="text-xs text-muted">{formatDateShort(media.createdAt)}</p>
      </div>
    </div>
  );
}
