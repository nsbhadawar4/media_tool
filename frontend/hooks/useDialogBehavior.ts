import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Everything a modal surface owes a keyboard or screen-reader user: focus moves inside on
 * open, Tab cannot walk out of it, Escape closes, the page behind stops scrolling, and
 * focus returns to whatever opened it.
 *
 * Shared by the centred dialog and the bottom sheet so the two cannot drift apart — a sheet
 * that traps focus slightly differently from the dialog is the kind of difference nobody
 * notices until it strands someone.
 */
export function useDialogBehavior(
  isOpen: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return;

    // Whatever had focus before this opened gets it back on close, so keyboard users are
    // returned to the control they activated rather than the top of the page.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const container = containerRef.current;
    // Prefer an element that asked for focus (autoFocus), else the first focusable one,
    // else the container itself so the screen reader lands inside it.
    const initial =
      container?.querySelector<HTMLElement>('[autofocus]') ??
      container?.querySelector<HTMLElement>(FOCUSABLE) ??
      container;
    initial?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !container) return;

      // Without this, Tab walks straight out and into the page behind, which is still
      // visible but inert — focus appears to vanish.
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
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
  }, [isOpen, containerRef, onClose]);
}
