'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { Media } from '@/types/api';

interface ImageViewerModalProps {
  media: Media;
  index: number;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const ZOOM_LEVELS = [1, 1.5, 2, 2.75];

export function ImageViewerModal({ media, index, total, onClose, onNext, onPrev }: ImageViewerModalProps) {
  // Rendered with `key={media.id}` by the caller, so this remounts (and zoom resets to 0)
  // whenever the displayed image changes — no effect needed to sync it.
  const [zoomStep, setZoomStep] = useState(0);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onNext, onPrev]);

  if (typeof document === 'undefined') return null;

  const zoom = ZOOM_LEVELS[zoomStep] ?? 1;
  const canZoomIn = zoomStep < ZOOM_LEVELS.length - 1;
  const canZoomOut = zoomStep > 0;

  return createPortal(
    <div className="animate-fade-in fixed inset-0 z-[60] flex flex-col bg-black/95">
      <div className="flex items-center justify-between px-4 py-3 text-white sm:px-6">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{media.originalName}</p>
          {total > 0 && (
            <p className="text-xs text-white/60">
              {index + 1} / {total}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoomStep((z) => Math.max(0, z - 1))}
            disabled={!canZoomOut}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomStep((z) => Math.min(ZOOM_LEVELS.length - 1, z + 1))}
            disabled={!canZoomIn}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-4.5 w-4.5" />
          </button>
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

      <div className="relative flex flex-1 items-center justify-center overflow-auto px-4 pb-6">
        {total > 1 && (
          <button
            type="button"
            onClick={onPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 sm:left-4"
            aria-label="Previous image"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.viewUrl}
          alt={media.originalName}
          className="max-h-full max-w-full select-none rounded-lg object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom})` }}
          draggable={false}
        />

        {total > 1 && (
          <button
            type="button"
            onClick={onNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white transition hover:bg-black/60 sm:right-4"
            aria-label="Next image"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
