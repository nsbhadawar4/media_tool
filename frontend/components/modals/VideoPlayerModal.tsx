'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import type { Media } from '@/types/api';

export function VideoPlayerModal({ media, onClose }: { media: Media; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <p className="min-w-0 truncate text-sm font-medium">{media.originalName}</p>
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
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-6">
        {/* Native HTML5 controls give play/pause, seek, volume and fullscreen for free. */}
        <video
          src={media.viewUrl}
          controls
          autoPlay
          className="max-h-full max-w-full rounded-lg outline-none"
        >
          Your browser does not support video playback.
        </video>
      </div>
    </div>,
    document.body,
  );
}
