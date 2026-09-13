'use client';

import { ImageOff } from 'lucide-react';
import { MediaCard } from './MediaCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Media } from '@/types/api';

interface MediaGridProps {
  media: Media[];
  onPreview: (media: Media) => void;
  onRename: (media: Media) => void;
  onMove: (media: Media) => void;
  onDelete: (media: Media) => void;
  emptyMessage?: string;
}

export function MediaGrid({ media, onPreview, onRename, onMove, onDelete, emptyMessage }: MediaGridProps) {
  if (media.length === 0) {
    return (
      <EmptyState
        icon={ImageOff}
        title="No files here yet"
        description={emptyMessage ?? 'Upload photos, videos or documents to get started.'}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {media.map((item) => (
        <MediaCard
          key={item.id}
          media={item}
          onPreview={onPreview}
          onRename={onRename}
          onMove={onMove}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
