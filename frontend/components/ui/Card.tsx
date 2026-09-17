import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-border bg-surface shadow-sm', className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('border-b border-border px-5 py-4', className)}>{children}</div>;
}

/**
 * `padded={false}` rather than passing `p-0` through `className`: `cn` is clsx, not
 * tailwind-merge, so both classes survive and the one Tailwind happens to emit later
 * wins — `p-5` beats `p-0`, silently keeping the padding a caller asked to remove.
 */
export function CardBody({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={cn(padded && 'p-5', className)}>{children}</div>;
}
