'use client';

import { useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDialogBehavior } from '@/hooks/useDialogBehavior';
import { cn } from '@/utils/cn';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

/** How far the sheet has to be dragged before letting go dismisses it. */
const DISMISS_THRESHOLD_PX = 96;

/**
 * A panel that rises from the bottom edge, for the places a phone should not be showing a
 * centred dialog or a popover menu: action lists, secondary navigation, confirmations.
 *
 * It is dragged by its handle and header only, never by its body. A sheet whose scrollable
 * content also drags it is the classic broken implementation — every attempt to scroll the
 * list pulls the sheet down instead.
 */
export function BottomSheet({ isOpen, onClose, title, children, className }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // The gesture lives in state rather than a ref because the rendered transform and the
  // transition both depend on it — a ref would not re-render, so the sheet would not move.
  const [drag, setDrag] = useState<{ startY: number; offset: number } | null>(null);
  const isDragging = drag !== null;

  useDialogBehavior(isOpen, sheetRef, onClose);

  if (!isOpen || typeof document === 'undefined') return null;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    setDrag({ startY: event.clientY, offset: 0 });
    // Capture so the gesture keeps reporting even once the finger leaves the handle.
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    // Downwards only: dragging up would lift the sheet off the bottom edge and expose the
    // backdrop underneath it.
    setDrag((current) =>
      current ? { ...current, offset: Math.max(0, event.clientY - current.startY) } : current,
    );
  };

  const handlePointerUp = () => {
    if (!drag) return;
    if (drag.offset > DISMISS_THRESHOLD_PX) onClose();
    setDrag(null);
  };

  return createPortal(
    // Above the dropdown layer (z-70): a sheet can be opened from a menu.
    <div className="fixed inset-0 z-80 flex items-end justify-center">
      <div
        className="animate-fade-in absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        style={{ transform: drag && drag.offset > 0 ? `translateY(${drag.offset}px)` : undefined }}
        className={cn(
          'focus-ring-custom relative flex max-h-[85dvh] w-full flex-col rounded-t-3xl border-t border-border bg-surface shadow-2xl outline-none',
          // Keeps the last row clear of the home indicator.
          'pb-[env(safe-area-inset-bottom,0px)]',
          // The entry animation would fight the drag transform, and the snap-back needs a
          // transition that must not be running while the finger is still down.
          isDragging ? 'transition-none' : 'animate-sheet-up transition-transform duration-200',
          className,
        )}
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          // The browser must not claim the vertical gesture for scrolling before the
          // handler sees it.
          className="app-no-select shrink-0 cursor-grab touch-none active:cursor-grabbing"
        >
          <div className="flex justify-center pb-1 pt-2.5">
            <span className="h-1 w-9 rounded-full bg-border" aria-hidden />
          </div>
          {title && (
            <h2 id={titleId} className="px-5 pb-2 pt-1 text-sm font-semibold text-foreground">
              {title}
            </h2>
          )}
        </div>

        <div className="app-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** A row inside a sheet, sized for a thumb rather than a cursor. */
export function SheetItem({
  icon,
  label,
  onClick,
  danger,
  isActive,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  isActive?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3.5 rounded-xl px-4 py-3.5 text-left text-[15px] font-medium transition active:scale-[0.99]',
        danger ? 'text-danger active:bg-danger/10' : 'text-foreground active:bg-surface-hover',
        isActive && !danger && 'bg-accent/10 text-accent',
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{icon}</span>
      {label}
    </button>
  );
}
