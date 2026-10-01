import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: names the control for screen readers and doubles as its tooltip. */
  label: string;
  children: ReactNode;
  variant?: 'ghost' | 'outline';
}

/** Square icon control, 40px on touch and 36px with a pointer. The tooltip is CSS-only. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, variant = 'ghost', className, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      data-tooltip={label}
      className={cn(
        'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition duration-150 hover:bg-surface-hover hover:text-foreground active:scale-95 disabled:pointer-events-none disabled:opacity-50 lg:h-9 lg:w-9',
        variant === 'outline' && 'border border-border bg-surface-elevated hover:border-border-strong',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
