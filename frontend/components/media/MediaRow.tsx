'use client';

import type { MouseEvent } from 'react';
import { Check, Download, Eye, FolderInput, ImagePlus, PencilLine, Play, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { Badge } from '@/components/ui/Badge';
import { MediaThumbnail } from './MediaThumbnail';
import { extensionOf, iconForFileType, toneForMedia } from '@/utils/fileIcons';
import { formatBytes, formatDateShort, formatDuration } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Media } from '@/types/api';

interface MediaRowProps {
  media: Media;
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  onSetCover?: (media: Media) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string, extendRange: boolean) => void;
  isSelectionActive?: boolean;
}

/**
 * One file as a row: the list-view counterpart of MediaCard and DocumentCard.
 *
 * Images and videos lead with a real thumbnail; documents lead with a typed icon tile, so
 * the two never read as the same kind of object. Size and date drop out on narrow screens
 * rather than squeezing the name.
 */
export function MediaRow({
  media,
  onPreview,
  onRename,
  onMove,
  onDelete,
  onSetCover,
  isSelected = false,
  onToggleSelect,
  isSelectionActive = false,
}: MediaRowProps) {
  const isSelectable = Boolean(onToggleSelect);
  const tone = toneForMedia(media.fileType, media.mimeType);
  const Icon = iconForFileType(media.fileType, media.mimeType);
  const duration = formatDuration(media.duration);
  const extension = extensionOf(media.originalName);
  const hasThumbnail = media.fileType !== 'document';

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
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
        'group relative flex items-center gap-3 border-b border-border px-3 py-2.5 transition-colors duration-150 last:border-b-0 sm:px-4',
        isSelected ? 'bg-accent/8' : 'hover:bg-surface-hover/60',
      )}
    >
      {isSelectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={isSelected}
          aria-label={`Select ${media.originalName}`}
          onClick={(event) => onToggleSelect!(media.id, event.shiftKey)}
          className={cn(
            'relative z-20 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition duration-150',
            isSelected
              ? 'border-accent bg-accent text-accent-foreground'
              : 'border-border-strong text-transparent hover:border-accent',
          )}
        >
          <Check className={cn('h-3 w-3 transition-transform duration-200 ease-[var(--ease-spring)]', isSelected ? 'scale-100' : 'scale-0')} strokeWidth={3} />
        </button>
      )}

      <div
        className={cn(
          'relative h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border',
          !hasThumbnail && cn('flex items-center justify-center', tone.badge),
        )}
      >
        {hasThumbnail ? (
          <>
            <MediaThumbnail media={media} />
            {media.fileType === 'video' && (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="h-3.5 w-3.5 fill-white text-white" />
              </span>
            )}
          </>
        ) : (
          // eslint-disable-next-line react-hooks/static-components -- a fixed set of stable Lucide components
          <Icon className="h-5 w-5" strokeWidth={1.75} />
        )}
      </div>

      {/* The row's primary action covers the text block, so the actions menu stays a sibling. */}
      <button
        type="button"
        onClick={handleClick}
        aria-label={isSelectionActive ? `Select ${media.originalName}` : `Preview ${media.originalName}`}
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="block truncate text-sm font-medium text-foreground" title={media.originalName}>
          {media.originalName}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
          <span className="tabular-nums sm:hidden">{formatBytes(media.size)}</span>
          <span className="hidden sm:inline">{extension || media.fileType}</span>
          {duration && <span className="tabular-nums">· {duration}</span>}
        </span>
      </button>

      <Badge className={cn('hidden md:inline-flex', tone.badge)}>{media.fileType}</Badge>
      <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted sm:block">
        {formatBytes(media.size)}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-muted lg:block">
        {formatDateShort(media.createdAt)}
      </span>

      <div className={cn('relative z-20 shrink-0', isSelectionActive && 'pointer-events-none opacity-0')}>
        <DropdownMenu
          triggerLabel={`Actions for ${media.originalName}`}
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
            { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => onDelete(media), danger: true },
          ]}
        />
      </div>
    </div>
  );
}
