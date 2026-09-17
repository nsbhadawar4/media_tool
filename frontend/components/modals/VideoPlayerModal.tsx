'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { formatBytes, formatDuration } from '@/utils/format';
import type { Media } from '@/types/api';

export function VideoPlayerModal({ media, onClose }: { media: Media; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const duration = formatDuration(media.duration);

  return createPortal(
    <div className="app-safe-bottom animate-fade-in fixed inset-0 z-60 flex flex-col bg-black/95">
      <header className="flex items-center justify-between gap-4 px-4 py-3 text-white sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{media.originalName}</p>
          <p className="text-xs text-white/60">
            {formatBytes(media.size)}
            {duration && (
              <>
                <span className="mx-1.5">·</span>
                <span className="tabular-nums">{duration}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <a
            href={media.downloadUrl}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Download"
          >
            <Download className="h-4.5 w-4.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
        {/* Native HTML5 controls give play/pause, seek, volume and fullscreen for free.
            The API serves byte ranges, so seeking works without downloading the whole file. */}
        <video
          src={media.viewUrl}
          poster={media.thumbnailUrl ?? undefined}
          controls
          autoPlay
          playsInline
          className="max-h-full max-w-full rounded-lg outline-none"
        >
          Your browser does not support video playback.
        </video>
      </div>
    </div>,
    document.body,
  );
}
