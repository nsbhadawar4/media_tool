'use client';

import { Download, FolderInput, ImagePlus, PencilLine, Play, Trash2 } from 'lucide-react';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { Badge } from '@/components/ui/Badge';
import { iconForDocument } from '@/utils/fileIcons';
import { formatBytes, formatDateShort } from '@/utils/format';
import type { Media } from '@/types/api';

interface MediaCardProps {
  media: Media;
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  /** Only passed when browsing a specific folder — lets an image be set as that folder's cover. */
  onSetCover?: (media: Media) => void;
}

const TYPE_BADGE_VARIANT = {
  image: 'accent',
  video: 'warning',
  document: 'default',
} as const;

export function MediaCard({ media, onPreview, onRename, onMove, onDelete, onSetCover }: MediaCardProps) {
  const DocIcon = iconForDocument(media.mimeType);

  return (
    <div className="group animate-fade-in flex flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <button
        type="button"
        onClick={() => onPreview(media)}
        className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-surface-hover"
      >
        {media.fileType === 'image' && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={media.viewUrl} alt={media.originalName} loading="lazy" className="h-full w-full object-cover" />
        )}

        {media.fileType === 'video' && (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-950">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition group-hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </div>
          </div>
        )}

        {media.fileType === 'document' && (
          <div className="flex flex-col items-center gap-2 text-muted">
            {/* DocIcon is picked from a fixed set of stable Lucide components, not created per render. */}
            {/* eslint-disable-next-line react-hooks/static-components */}
            <DocIcon className="h-10 w-10" />
          </div>
        )}

        <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100">
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu
              triggerClassName="bg-black/40 text-white hover:bg-black/60 hover:text-white"
              items={[
                { label: 'Preview', icon: <Play className="h-4 w-4" />, onClick: () => onPreview(media) },
                {
                  label: 'Download',
                  icon: <Download className="h-4 w-4" />,
                  onClick: () => window.open(media.downloadUrl, '_blank'),
                },
                { label: 'Rename', icon: <PencilLine className="h-4 w-4" />, onClick: () => onRename(media) },
                { label: 'Move', icon: <FolderInput className="h-4 w-4" />, onClick: () => onMove(media) },
                ...(onSetCover && media.fileType === 'image'
                  ? [{ label: 'Set as folder cover', icon: <ImagePlus className="h-4 w-4" />, onClick: () => onSetCover(media) }]
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
      </button>

      <div className="flex flex-col gap-1.5 px-3.5 py-3">
        <p className="truncate text-sm font-medium text-foreground" title={media.originalName}>
          {media.originalName}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Badge variant={TYPE_BADGE_VARIANT[media.fileType]}>{media.fileType}</Badge>
          <span className="text-xs text-muted">{formatBytes(media.size)}</span>
        </div>
        <p className="text-xs text-muted">{formatDateShort(media.createdAt)}</p>
      </div>
    </div>
  );
}
