'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { iconForDocument } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/format';
import type { Media } from '@/types/api';

export function DocumentViewerModal({ media, onClose }: { media: Media; onClose: () => void }) {
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

  const isPdf = media.mimeType === 'application/pdf';
  const Icon = iconForDocument(media.mimeType);

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-black/80">
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
        {isPdf ? (
          <iframe
            src={media.viewUrl}
            title={media.originalName}
            className="h-full w-full max-w-4xl rounded-lg bg-white"
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface px-10 py-12 text-center">
            {/* Icon is picked from a fixed set of stable Lucide components, not created per render. */}
            {/* eslint-disable-next-line react-hooks/static-components */}
            <Icon className="h-14 w-14 text-muted" />
            <div>
              <p className="text-sm font-medium text-foreground">{media.originalName}</p>
              <p className="mt-1 text-xs text-muted">{formatBytes(media.size)}</p>
            </div>
            <a
              href={media.downloadUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
