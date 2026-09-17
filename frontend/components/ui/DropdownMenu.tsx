'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface DropdownMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface DropdownMenuProps {
  items: DropdownMenuItem[];
  align?: 'left' | 'right';
  trigger?: ReactNode;
  triggerClassName?: string;
}

const MENU_WIDTH = 176;
const VIEWPORT_MARGIN = 8;

/**
 * Actions menu anchored to its trigger.
 *
 * The menu is rendered in a portal with fixed positioning rather than absolutely inside
 * the trigger's parent. Both card types that use it clip their contents (`overflow-hidden`
 * for their rounded corners and cover images), which cut an absolutely-positioned menu in
 * half. A portal escapes any ancestor clipping, and fixed coordinates let the menu flip
 * when it would otherwise open off the bottom or side of the screen.
 */
export function DropdownMenu({ items, align = 'right', trigger, triggerClassName }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Measured before paint so the menu never appears at the wrong spot for a frame.
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = items.length * 36 + 8;

    const wouldOverflowBottom = rect.bottom + menuHeight + VIEWPORT_MARGIN > window.innerHeight;
    const top = wouldOverflowBottom ? rect.top - menuHeight - 6 : rect.bottom + 6;

    const preferredLeft = align === 'right' ? rect.right - MENU_WIDTH : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferredLeft),
      window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN,
    );

    setPosition({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [isOpen, align, items.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % items.length);
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index - 1 + items.length) % items.length);
      }
    };

    // The menu is positioned from a rect measured once, so it must not linger after the
    // page moves underneath it.
    const handleReflow = () => close();

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    window.addEventListener('resize', handleReflow);
    window.addEventListener('scroll', handleReflow, true);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
      window.removeEventListener('resize', handleReflow);
      window.removeEventListener('scroll', handleReflow, true);
    };
  }, [isOpen, close, items.length]);

  useEffect(() => {
    if (activeIndex < 0 || !menuRef.current) return;
    menuRef.current.querySelectorAll<HTMLElement>('[role="menuitem"]')[activeIndex]?.focus();
  }, [activeIndex]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
          setIsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground',
          triggerClassName,
        )}
        aria-label="More actions"
      >
        {trigger ?? <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="animate-scale-in fixed z-70 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={(event) => {
                  event.stopPropagation();
                  close();
                  item.onClick();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover focus:bg-surface-hover focus:outline-none',
                  item.danger ? 'text-danger' : 'text-foreground',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
