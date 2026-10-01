import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/utils/cn';

/*
 * Small CSS-driven animation primitives. They cost no JavaScript at runtime (no animation
 * library), respect prefers-reduced-motion through the global rule in globals.css, and all
 * share the same easing and timing, which is what keeps the app's motion feeling like one
 * system rather than a set of unrelated effects.
 */

interface MotionProps {
  children: ReactNode;
  className?: string;
  /** Position in a staggered group; each step delays the entrance by ~55ms (capped). */
  index?: number;
  as?: ElementType;
}

function style(index: number): CSSProperties {
  return { ['--i' as string]: index } as CSSProperties;
}

/** Fades and lifts into place. */
export function FadeUp({ children, className, index = 0, as: Tag = 'div' }: MotionProps) {
  return (
    <Tag className={cn('anim-rise', className)} style={style(index)}>
      {children}
    </Tag>
  );
}

/** Fades, lifts and settles from a slightly smaller size — for cards. */
export function ScaleIn({ children, className, index = 0, as: Tag = 'div' }: MotionProps) {
  return (
    <Tag className={cn('anim-rise-scale', className)} style={style(index)}>
      {children}
    </Tag>
  );
}

/**
 * One item of a staggered group. Give each sibling its own `index`:
 *
 *   {items.map((item, i) => <StaggerItem key={item.id} index={i}>…</StaggerItem>)}
 */
export function StaggerItem({ children, className, index = 0, as: Tag = 'div' }: MotionProps) {
  return (
    <Tag className={cn('anim-rise-scale', className)} style={style(index)}>
      {children}
    </Tag>
  );
}
