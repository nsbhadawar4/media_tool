'use client';

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { formatBytes } from '@/utils/format';
import { cn } from '@/utils/cn';
import type { Media } from '@/types/api';

interface ImageViewerModalProps {
  media: Media;
  index: number;
  total: number;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  /** Neighbouring images, fetched invisibly so next/prev feels instant. */
  preloadUrls?: string[];
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const ZOOM_STEP = 0.5;

export function ImageViewerModal({
  media,
  index,
  total,
  onClose,
  onNext,
  onPrev,
  preloadUrls = [],
}: ImageViewerModalProps) {
  // Rendered with `key={media.id}` by the caller, so this remounts (and zoom/offset reset)
  // whenever the displayed image changes — no effect needed to sync them.
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  // Pan bookkeeping lives in refs: it updates on every mousemove and must not re-render.
  const dragState = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isZoomed = zoom > MIN_ZOOM;

  const zoomTo = useCallback((next: number) => {
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2))));
    setZoom(clamped);
    // Re-centre when returning to fit, otherwise the image can be panned off-screen.
    if (clamped === MIN_ZOOM) setOffset({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => zoomTo(zoom + ZOOM_STEP), [zoom, zoomTo]);
  const zoomOut = useCallback(() => zoomTo(zoom - ZOOM_STEP), [zoom, zoomTo]);
  const resetZoom = useCallback(() => zoomTo(MIN_ZOOM), [zoomTo]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'Escape':
          onClose();
          break;
        case 'ArrowRight':
          onNext();
          break;
        case 'ArrowLeft':
          onPrev();
          break;
        case '+':
        case '=':
          zoomIn();
          break;
        case '-':
          zoomOut();
          break;
        case '0':
          resetZoom();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onNext, onPrev, zoomIn, zoomOut, resetZoom]);

  // Dragging continues even when the pointer leaves the image, so these listen on the window.
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (event: globalThis.MouseEvent) => {
      const drag = dragState.current;
      if (!drag) return;
      setOffset({
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      });
    };
    const handleUp = () => {
      dragState.current = null;
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging]);

  const startDrag = (event: ReactMouseEvent) => {
    if (!isZoomed) return;
    event.preventDefault();
    dragState.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    setIsDragging(true);
  };

  // Wheel/trackpad zoom. Registered manually because React's synthetic wheel handler is
  // passive, and a passive listener cannot preventDefault the page scroll behind the modal.
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      setZoom((current) => {
        const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current - event.deltaY * 0.0025 * current));
        if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 });
        return next;
      });
    };

    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="app-safe-bottom animate-fade-in fixed inset-0 z-60 flex flex-col bg-black/95">
      <header className="flex items-center justify-between gap-4 px-4 py-3 text-white sm:px-6">
        <div className="min-w-0 text-sm">
          <p className="truncate font-medium">{media.originalName}</p>
          <p className="text-xs text-white/60">
            {total > 0 && (
              <span className="tabular-nums">
                {index + 1} / {total}
              </span>
            )}
            <span className="mx-1.5">·</span>
            {formatBytes(media.size)}
            {media.width && media.height && (
              <>
                <span className="mx-1.5">·</span>
                <span className="tabular-nums">
                  {media.width} × {media.height}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ViewerButton onClick={zoomOut} disabled={zoom <= MIN_ZOOM} label="Zoom out">
            <ZoomOut className="h-4.5 w-4.5" />
          </ViewerButton>
          <button
            type="button"
            onClick={resetZoom}
            disabled={!isZoomed}
            className="min-w-13 rounded-lg px-1.5 py-2 text-xs font-medium tabular-nums text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <ViewerButton onClick={zoomIn} disabled={zoom >= MAX_ZOOM} label="Zoom in">
            <ZoomIn className="h-4.5 w-4.5" />
          </ViewerButton>

          <span className="mx-1 h-5 w-px bg-white/20" />

          <ViewerButton onClick={() => window.open(media.viewUrl, '_blank')} label="Open original in a new tab">
            <Maximize2 className="h-4.5 w-4.5" />
          </ViewerButton>
          <a
            href={media.downloadUrl}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Download"
          >
            <Download className="h-4.5 w-4.5" />
          </a>
          <ViewerButton onClick={onClose} label="Close">
            <X className="h-4.5 w-4.5" />
          </ViewerButton>
        </div>
      </header>

      <div ref={stageRef} className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
        {total > 1 && (
          <NavButton side="left" onClick={onPrev} label="Previous image">
            <ChevronLeft className="h-5 w-5" />
          </NavButton>
        )}

        {!isLoaded && (
          <div className="absolute h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
        )}

        {/* Signed, access-controlled media URLs; next/image would add nothing but a
            remote-pattern allowlist to maintain. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={media.viewUrl}
          alt={media.originalName}
          onLoad={() => setIsLoaded(true)}
          onMouseDown={startDrag}
          onDoubleClick={() => (isZoomed ? resetZoom() : zoomTo(2))}
          className={cn(
            'max-h-full max-w-full select-none rounded-lg object-contain',
            // Transitions are disabled mid-drag so panning tracks the cursor exactly.
            isDragging ? 'transition-none' : 'transition-transform duration-200',
            isLoaded ? 'opacity-100' : 'opacity-0',
            isZoomed ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in',
          )}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
          draggable={false}
        />

        {total > 1 && (
          <NavButton side="right" onClick={onNext} label="Next image">
            <ChevronRight className="h-5 w-5" />
          </NavButton>
        )}
      </div>

      {/* Warms the browser cache for the adjacent images so arrow-key browsing is instant. */}
      <div className="hidden" aria-hidden>
        {preloadUrls.map((url) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={url} src={url} alt="" />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function ViewerButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function NavButton({
  side,
  onClick,
  label,
  children,
}: {
  side: 'left' | 'right';
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-2.5 text-white backdrop-blur-sm transition hover:bg-black/70',
        side === 'left' ? 'left-2 sm:left-4' : 'right-2 sm:right-4',
      )}
    >
      {children}
    </button>
  );
}
