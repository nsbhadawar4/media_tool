'use client';

import { useState } from 'react';
import { FileWarning, Play } from 'lucide-react';
import { extensionOf, iconForDocument, toneForDocument } from '@/utils/fileIcons';
import { cn } from '@/utils/cn';
import type { Media } from '@/types/api';

/**
 * The image (or placeholder) filling a gallery tile.
 *
 * Prefers the server-derived thumbnail and only falls back to the full-size original when
 * there isn't one — loading originals into a grid would pull hundreds of megabytes for a
 * single folder of photos. Videos have no fallback: their thumbnail comes from a poster
 * frame captured at upload time, so without it they get a typed placeholder.
 */
export function MediaThumbnail({ media, className }: { media: Media; className?: string }) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  const source =
    media.fileType === 'image'
      ? (media.thumbnailUrl ?? media.viewUrl)
      : media.fileType === 'video'
        ? media.thumbnailUrl
        : null;

  if (!source || status === 'error') {
    return <ThumbnailPlaceholder media={media} isBroken={status === 'error'} className={className} />;
  }

  return (
    <div className={cn('relative h-full w-full overflow-hidden bg-surface-hover', className)}>
      {status === 'loading' && <div className="absolute inset-0 animate-pulse bg-surface-hover" />}
      {/* Next's <Image> would need every signed, token-bearing media URL whitelisted as a
          remote pattern for no benefit — these are already resized and access-controlled. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={source}
        alt={media.originalName}
        loading="lazy"
        decoding="async"
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-300',
          status === 'loaded' ? 'opacity-100' : 'opacity-0',
        )}
        draggable={false}
      />
    </div>
  );
}

/** Shown for documents, undecodable videos, and anything whose thumbnail failed to load. */
function ThumbnailPlaceholder({
  media,
  isBroken,
  className,
}: {
  media: Media;
  isBroken: boolean;
  className?: string;
}) {
  const extension = extensionOf(media.originalName);

  if (media.fileType === 'video') {
    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center bg-linear-to-br from-slate-700 to-slate-950',
          className,
        )}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm">
          <Play className="ml-0.5 h-5 w-5 fill-current" />
        </div>
      </div>
    );
  }

  const Icon = isBroken ? FileWarning : iconForDocument(media.mimeType);
  const tone = isBroken ? 'bg-danger/10 text-danger' : toneForDocument(media.mimeType).badge;

  return (
    <div className={cn('flex h-full w-full items-center justify-center bg-surface-hover', className)}>
      {/*
        The icon and its extension label are one object, centred as a unit. Centring them
        as two stacked children instead leaves the icon sitting visibly above the middle
        of the tile, because the label below it takes up half the optical weight.
      */}
      <div className={cn('flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3.5', tone)}>
        {/* Icon comes from a fixed set of stable Lucide components, not created per render. */}
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Icon className="h-9 w-9" strokeWidth={1.5} />
        {/*
          A warning mark on its own reads as "something about this file", which is not the
          same as "these bytes are gone". Uploads can no longer produce this state, but
          media stored before that was true still can, and so can a file removed from
          storage behind the app's back — in both cases the only useful thing to say is
          that the file is not there, in words.
        */}
        {isBroken ? (
          <span className="max-w-full text-center text-[10px] font-semibold uppercase leading-tight tracking-wider">
            File unavailable
          </span>
        ) : (
          extension && (
            <span className="text-[10px] font-semibold uppercase leading-none tracking-wider">
              {extension}
            </span>
          )
        )}
      </div>
    </div>
  );
}
