import { forwardRef, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Array<{ label: string; value: string }>;
  /** Visually-hidden label. Every select needs one; there is no visible <label> in the toolbars. */
  'aria-label': string;
}

/**
 * Native <select> with the platform chrome removed.
 *
 * Safari and iOS render the default control at a fixed height with their own arrow and
 * inner padding, so an unstyled select is noticeably taller and differently shaped than
 * the inputs beside it. `appearance-none` plus an explicit chevron makes it match across
 * browsers while keeping the native picker — which is the right control on touch.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, className, ...props }, ref) => (
    <div className="relative inline-flex">
      <select
        ref={ref}
        className={cn(
          'focus-ring-custom h-9 w-full appearance-none rounded-xl border border-border bg-surface py-0 pl-3 pr-8 text-xs font-medium text-foreground outline-none transition',
          'hover:border-accent/40 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/20',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
    </div>
  ),
);
Select.displayName = 'Select';
