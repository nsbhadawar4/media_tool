"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/** Side of the square crop window on screen, in CSS pixels. */
const VIEWPORT = 260;
/** Side of the exported image. The server shrinks it further; this just keeps it sharp. */
const OUTPUT = 512;
const MAX_ZOOM = 4;

interface AvatarCropperModalProps {
  /** The picked file; the modal is open exactly while this is set. */
  file: File | null;
  isSaving: boolean;
  onCancel: () => void;
  /** Receives the cropped square, already encoded as an image file. */
  onSave: (cropped: File) => void;
}

/**
 * Pan-and-zoom crop for a profile photo.
 *
 * The photo always covers the whole window (zoom 1 is "just fits"), and panning is clamped
 * so no empty edge can ever be included. The circle is a visual guide only — the export is
 * the full square, because the avatar is clipped to a circle wherever it is shown.
 */
export function AvatarCropperModal({
  file,
  isSaving,
  onCancel,
  onSave,
}: AvatarCropperModalProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState(false);
  const drag = useRef<{
    px: number;
    py: number;
    ox: number;
    oy: number;
  } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setLoadError(false);
    if (!file) {
      setSrc(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const baseScale = natural ? VIEWPORT / Math.min(natural.w, natural.h) : 1;
  const scale = baseScale * zoom;

  const clamp = (o: { x: number; y: number }, s: number) => {
    if (!natural) return o;
    const maxX = Math.max(0, (natural.w * s - VIEWPORT) / 2);
    const maxY = Math.max(0, (natural.h * s - VIEWPORT) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  };

  const changeZoom = (next: number) => {
    const z = Math.min(MAX_ZOOM, Math.max(1, next));
    setZoom(z);
    // Zooming out can pull an edge into view, so the pan is re-clamped at the new scale.
    setOffset((o) => clamp(o, baseScale * z));
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setOffset(
      clamp({ x: d.ox + e.clientX - d.px, y: d.oy + e.clientY - d.py }, scale),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const handleSave = () => {
    const img = imgRef.current;
    if (!img || !natural) return;

    // The window's centre sits on this point of the photo; the window spans VIEWPORT/scale
    // photo pixels either side of it.
    const size = VIEWPORT / scale;
    const sx = natural.w / 2 - offset.x / scale - size / 2;
    const sy = natural.h / 2 - offset.y / scale - size / 2;

    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT);

    canvas.toBlob(
      (blob) => {
        if (blob)
          onSave(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <Modal
      isOpen={file !== null}
      onClose={isSaving ? () => {} : onCancel}
      title="Crop your photo"
      size="sm"
    >
      <div className="flex flex-col items-center gap-5 px-5 pb-5">
        {loadError ? (
          <p className="rounded-xl bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
            That file could not be opened as an image.
          </p>
        ) : (
          <div
            className="relative touch-none select-none overflow-hidden rounded-2xl bg-black"
            style={{ width: VIEWPORT, height: VIEWPORT, cursor: "grab" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={(e) => changeZoom(zoom - e.deltaY * 0.002)}
          >
            {src && (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob URL
              <img
                ref={imgRef}
                src={src}
                alt=""
                draggable={false}
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                onError={() => setLoadError(true)}
                className="pointer-events-none absolute max-w-none"
                style={
                  natural
                    ? {
                        width: natural.w * scale,
                        height: natural.h * scale,
                        left: VIEWPORT / 2 - (natural.w * scale) / 2 + offset.x,
                        top: VIEWPORT / 2 - (natural.h * scale) / 2 + offset.y,
                      }
                    : { opacity: 0 }
                }
              />
            )}
            {/* Dims everything outside the circle so the final framing is obvious. */}
            <div
              className="pointer-events-none absolute inset-0 rounded-full"
              style={{
                boxShadow: "0 0 0 999px rgba(0,0,0,0.55)",
                outline: "2px solid rgba(255,255,255,0.7)",
                outlineOffset: -2,
              }}
            />
          </div>
        )}

        {!loadError && (
          <div className="flex w-full items-center gap-3 text-muted">
            <ZoomOut className="h-4 w-4 shrink-0" />
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(e) => changeZoom(Number(e.target.value))}
              aria-label="Zoom"
              className="h-1 w-full cursor-pointer accent-[var(--color-accent,#7c6cff)]"
            />
            <ZoomIn className="h-4 w-4 shrink-0" />
          </div>
        )}

        <p className="text-xs text-muted">
          Drag to reposition, scroll or use the slider to zoom.
        </p>

        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!natural || isSaving || loadError}
          >
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSaving ? "Saving…" : "Save photo"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
