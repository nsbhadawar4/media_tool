'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  hideCloseButton?: boolean;
}

const SIZE_CLASSES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ isOpen, onClose, title, children, size = 'md', hideCloseButton }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    // Whatever had focus before the dialog opened gets it back on close, so keyboard
    // users are returned to the control they activated rather than the top of the page.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const dialog = dialogRef.current;
    // Prefer an element that asked for focus (autoFocus), else the first focusable one,
    // else the dialog itself so the screen reader lands inside it.
    const initial =
      dialog?.querySelector<HTMLElement>('[autofocus]') ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE) ??
      dialog;
    initial?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      // Without this, Tab walks straight out of the dialog and into the page behind it,
      // which is still visible but inert — focus appears to vanish.
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  // ConfirmDialog and friends pass neither a title nor a close button, so no header row
  // renders and the body has to supply the full top padding itself.
  const hasHeader = Boolean(title) || !hideCloseButton;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="animate-fade-in absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          'animate-scale-in focus-ring-custom relative flex w-full flex-col rounded-2xl border border-border bg-surface shadow-2xl outline-none',
          // Long content scrolls inside the dialog instead of running off the screen.
          'max-h-[calc(100dvh-2rem)]',
          SIZE_CLASSES[size],
        )}
      >
        {hasHeader && (
          <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-2 pt-6">
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
        <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 pb-6', hasHeader ? 'pt-2' : 'pt-6')}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
