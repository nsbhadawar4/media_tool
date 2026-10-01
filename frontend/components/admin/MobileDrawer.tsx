'use client';

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogBehavior } from '@/hooks/useDialogBehavior';
import { usePresence } from '@/hooks/usePresence';
import { SidebarContent } from './Sidebar';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  variant?: 'user' | 'admin';
}

/**
 * The sidebar as an off-canvas drawer, for screens narrower than `lg`.
 *
 * The overlay fades in, the panel slides from the left edge, and both play a matching exit
 * before unmounting. Focus is trapped inside while it is open and Escape closes it.
 */
export function MobileDrawer({ isOpen, onClose, variant = 'user' }: MobileDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogBehavior(isOpen, panelRef, onClose);
  const { mounted, state } = usePresence(isOpen, 240);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-60 lg:hidden">
      <div
        data-state={state}
        className="pres-backdrop absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        data-state={state}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
        tabIndex={-1}
        className="pres-drawer focus-ring-custom absolute inset-y-0 left-0 flex w-[84vw] max-w-72 flex-col border-r border-border-strong bg-sidebar-bg shadow-pop outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation"
          className="absolute right-3 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-xl text-sidebar-foreground transition hover:rotate-90 hover:bg-sidebar-hover hover:text-sidebar-active"
        >
          <X className="h-5 w-5" />
        </button>
        <SidebarContent variant={variant} onNavigate={onClose} />
      </div>
    </div>,
    document.body,
  );
}
