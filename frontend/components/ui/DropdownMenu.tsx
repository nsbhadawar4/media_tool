'use client';

import { useRef, useState, type ReactNode } from 'react';
import { MoreVertical } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';
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

export function DropdownMenu({ items, align = 'right', trigger, triggerClassName }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground',
          triggerClassName,
        )}
        aria-label="More actions"
      >
        {trigger ?? <MoreVertical className="h-4 w-4" />}
      </button>

      {isOpen && (
        <div
          className={cn(
            'animate-scale-in absolute z-20 mt-1.5 min-w-[10rem] overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                item.onClick();
              }}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-surface-hover',
                item.danger ? 'text-danger' : 'text-foreground',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
