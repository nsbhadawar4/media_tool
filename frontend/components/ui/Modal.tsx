'use client';

import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogBehavior } from '@/hooks/useDialogBehavior';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
}

/*
 * Width caps apply from `lg` up only. Below that the dialog is a bottom sheet pinned to
 * both edges, and a `max-w-sm` cap there would leave a few stray pixels of backdrop down
 * each side of a phone screen.
 */
const SIZE_CLASSES = {
  sm: 'lg:max-w-sm',
  md: 'lg:max-w-md',
  lg: 'lg:max-w-2xl',
  xl: 'lg:max-w-4xl',
};

export function Modal({ isOpen, onClose, title, children, size = 'md', hideCloseButton }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogBehavior(isOpen, dialogRef, onClose);

  if (!isOpen || typeof document === 'undefined') return null;

  // ConfirmDialog and friends pass neither a title nor a close button, so no header row
  // renders and the body has to supply the full top padding itself.
  const hasHeader = Boolean(title) || !hideCloseButton;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 lg:items-center lg:p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'app-modal-anim focus-ring-custom relative flex w-full flex-col border-border bg-surface shadow-2xl outline-none',
          // A sheet is attached to the bottom edge, so it is rounded and bordered along its
          // top only; the centred dialog keeps all four sides.
          'rounded-t-3xl border-t lg:rounded-2xl lg:border',
          // Long content scrolls inside the dialog instead of running off the screen. The
          // sheet stops short of the top so the page behind stays visible as context.
          'max-h-[88dvh] lg:max-h-[calc(100dvh-2rem)]',
          // Clears the home indicator when the sheet is flush with the bottom of the screen.
          'pb-[env(safe-area-inset-bottom,0px)] lg:pb-0',
          SIZE_CLASSES[size],
        )}
      >
        {/* Grab handle. Purely an affordance — the backdrop, Escape and the close button
            are what actually dismiss this; forms are not drag-dismissible, because losing a
            half-typed folder name to a stray swipe is not a trade worth making. */}
        <div className="flex shrink-0 justify-center pt-2.5 lg:hidden" aria-hidden>
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        {hasHeader && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-2 pt-3 lg:pt-6">
            {title && (
              <h2 id={titleId} className="text-base font-semibold text-foreground">
                {title}
              </h2>
            )}
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                className="ml-auto rounded-lg p-1.5 text-muted transition hover:bg-surface-hover hover:text-foreground"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        <div
          className={cn(
            'app-scroll min-h-0 flex-1 overflow-y-auto px-6 pb-6',
            hasHeader ? 'pt-2' : 'pt-4 lg:pt-6',
          )}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
