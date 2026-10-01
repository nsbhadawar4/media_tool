'use client';

import type { CSSProperties, MouseEvent } from 'react';
import { Check, Download, Eye, FolderInput, PencilLine, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { extensionOf, iconForDocument, toneForDocument } from '@/utils/fileIcons';
import { formatBytes, formatDateShort } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Media } from '@/types/api';

interface DocumentCardProps {
  media: Media;
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string, extendRange: boolean) => void;
  isSelectionActive?: boolean;
  /** Position in the grid, for the staggered entrance. */
  index?: number;
}

/**
 * A document as a paper-like card: a typed icon on a tinted page, with the extension spelled
 * out beneath. Deliberately not the square photo tile MediaCard uses, so the Documents page
 * does not read as a gallery of blank thumbnails.
 */
export function DocumentCard({
  media,
  onPreview,
  onRename,
  onMove,
  onDelete,
  isSelected = false,
  onToggleSelect,
  isSelectionActive = false,
  index = 0,
}: DocumentCardProps) {
  const isSelectable = Boolean(onToggleSelect);
  const tone = toneForDocument(media.mimeType);
  const Icon = iconForDocument(media.mimeType);
  const extension = extensionOf(media.originalName);

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
      style={{ '--i': index } as CSSProperties}
      className={cn(
        'anim-rise-scale card-interactive group relative flex flex-col overflow-hidden rounded-2xl border bg-surface',
        isSelected ? 'border-accent ring-2 ring-accent/30' : 'border-border',
      )}
    >
      <div className={cn('relative flex aspect-[4/3] items-center justify-center', tone.badge)}>
        {/* The "page": a lighter sheet with a folded corner, behind the type icon. */}
        <div className="relative flex h-[68%] w-[46%] items-center justify-center rounded-lg border border-current/15 bg-surface shadow-card transition-transform duration-200 group-hover:scale-[1.04]">
          <span
            aria-hidden
            className="absolute right-0 top-0 h-3 w-3 rounded-bl-md bg-current opacity-15"
          />
          {/* Icon comes from a fixed set of stable Lucide components, not created per render. */}
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icon className={cn('h-8 w-8', tone.icon)} strokeWidth={1.5} />
        </div>
        {extension && (
          <span className="absolute bottom-2 left-2 rounded-md bg-surface/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-foreground-soft">
            {extension}
          </span>
        )}

        <button
          type="button"
          onClick={handleClick}
          aria-label={isSelectionActive ? `Select ${media.originalName}` : `Preview ${media.originalName}`}
          className="absolute inset-0 z-10 h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
        />

        {isSelectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-label={`Select ${media.originalName}`}
            onClick={(event) => onToggleSelect!(media.id, event.shiftKey)}
            className={cn(
              'absolute left-2 top-2 z-20 flex h-6 w-6 items-center justify-center rounded-md border transition duration-150',
              isSelected
                ? 'border-accent bg-accent text-accent-foreground'
                : 'border-border-strong bg-surface/90 text-transparent hover:border-accent',
              isSelected || isSelectionActive
                ? 'opacity-100'
                : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100',
            )}
          >
            <Check className={cn('h-3.5 w-3.5 transition-transform duration-200 ease-[var(--ease-spring)]', isSelected ? 'scale-100' : 'scale-0')} strokeWidth={3} />
          </button>
        )}

        <div
          className={cn(
            'absolute right-2 top-2 z-20 transition-opacity duration-150',
            isSelectionActive
              ? 'pointer-events-none opacity-0'
              : 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100',
          )}
        >
          <DropdownMenu
            triggerClassName="bg-surface/90 backdrop-blur-sm"
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
              { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, onClick: () => onDelete(media), danger: true },
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border px-3.5 py-3">
        <p className="truncate text-sm font-medium text-foreground" title={media.originalName}>
          {media.originalName}
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <span className="tabular-nums">{formatBytes(media.size)}</span>
          <span aria-hidden>·</span>
          <span>{formatDateShort(media.createdAt)}</span>
        </p>
      </div>
    </div>
  );
}
