'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { BottomSheet, SheetItem } from './BottomSheet';
import { useIsMobile } from '@/hooks/useMediaQuery';
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
  /**
   * Names the trigger for screen readers. Worth setting wherever a page has several of
   * these, so they don't all announce as an identical "More actions".
   */
  triggerLabel?: string;
  /** 'auto' drops the square icon-button sizing for a trigger that carries its own content. */
  triggerSize?: 'icon' | 'auto';
  /** Non-interactive block above the items — an account summary, say. */
  header?: ReactNode;
  /** Widen the menu when the labels need it. Ignored on the mobile action sheet. */
  width?: number;
  /** Heading for the mobile action sheet; the desktop popover has no title row. */
  sheetTitle?: string;
}

const MENU_WIDTH = 176;
const VIEWPORT_MARGIN = 8;
const ITEM_HEIGHT = 36;
/** Rough, like the item height above — only used to decide which way the menu opens. */
const HEADER_HEIGHT = 56;

/*
 * Size classes live apart from the rest so a caller's `triggerClassName` never has to fight
 * them. `cn` is clsx, not tailwind-merge, so two conflicting utilities both survive and
 * whichever Tailwind happens to emit later wins — see Card for the same trap.
 */
const TRIGGER_BASE =
  'flex items-center justify-center text-muted transition hover:bg-surface-hover hover:text-foreground';
const TRIGGER_SIZE_CLASSES = {
  // Larger on touch, where a 32px target in a card footer is a miss waiting to happen;
  // back to the original 32px from `lg` up, where there is a cursor.
  icon: 'h-10 w-10 rounded-xl lg:h-8 lg:w-8 lg:rounded-lg',
  auto: 'rounded-xl',
} as const;

/**
 * Actions menu anchored to its trigger.
 *
 * The menu is rendered in a portal with fixed positioning rather than absolutely inside
 * the trigger's parent. Both card types that use it clip their contents (`overflow-hidden`
 * for their rounded corners and cover images), which cut an absolutely-positioned menu in
 * half. A portal escapes any ancestor clipping, and fixed coordinates let the menu flip
 * when it would otherwise open off the bottom or side of the screen.
 */
export function DropdownMenu({
  items,
  align = 'right',
  trigger,
  triggerClassName,
  triggerLabel,
  triggerSize = 'icon',
  header,
  width,
  sheetTitle,
}: DropdownMenuProps) {
  // A popover anchored to a 40px button is a desktop idiom; on a phone the same choices
  // belong on a sheet at the bottom edge, where a thumb actually reaches.
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuWidth = width ?? MENU_WIDTH;
  const hasHeader = Boolean(header);

  const close = useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  // Measured before paint so the menu never appears at the wrong spot for a frame.
  useLayoutEffect(() => {
    if (!isOpen || isMobile || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuHeight = items.length * ITEM_HEIGHT + 8 + (hasHeader ? HEADER_HEIGHT : 0);

    const wouldOverflowBottom = rect.bottom + menuHeight + VIEWPORT_MARGIN > window.innerHeight;
    const top = wouldOverflowBottom ? rect.top - menuHeight - 6 : rect.bottom + 6;

    const preferredLeft = align === 'right' ? rect.right - menuWidth : rect.left;
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, preferredLeft),
      window.innerWidth - menuWidth - VIEWPORT_MARGIN,
    );

    setPosition({ top: Math.max(VIEWPORT_MARGIN, top), left });
  }, [isOpen, isMobile, align, items.length, menuWidth, hasHeader]);

  useEffect(() => {
    // The sheet brings its own dismissal, focus trap and scroll lock.
    if (!isOpen || isMobile) return;

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
  }, [isOpen, isMobile, close, items.length]);

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
        className={cn(TRIGGER_BASE, TRIGGER_SIZE_CLASSES[triggerSize], triggerClassName)}
        aria-label={triggerLabel ?? 'More actions'}
      >
        {trigger ?? <MoreVertical className="h-4 w-4" />}
      </button>

      {isMobile ? (
        <BottomSheet isOpen={isOpen} onClose={close} title={sheetTitle}>
          {header}
          <div role="menu" aria-orientation="vertical" className="pt-1">
            {items.map((item) => (
              <SheetItem
                key={item.label}
                icon={item.icon}
                label={item.label}
                danger={item.danger}
                onClick={() => {
                  close();
                  item.onClick();
                }}
              />
            ))}
          </div>
        </BottomSheet>
      ) : null}

      {!isMobile &&
        isOpen &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-orientation="vertical"
            style={{ top: position.top, left: position.left, width: menuWidth }}
            // A header brings its own bottom border, so it must sit flush against the top
            // edge rather than floating on the list's padding.
            className={cn(
              'animate-scale-in fixed z-70 overflow-hidden rounded-xl border border-border bg-surface shadow-xl',
              hasHeader ? 'pb-1' : 'py-1',
            )}
          >
            {header}
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
