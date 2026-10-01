'use client';

import { cn } from '@/utils/cn';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Names the switch for screen readers; there is rarely a visible label inside the control. */
  label: string;
  disabled?: boolean;
}

/** On/off switch. The knob slides with a slight spring and the track fills with the accent. */
export function Toggle({ checked, onChange, label, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-300 disabled:opacity-50',
        checked ? 'border-accent/60 bg-accent' : 'border-border-strong bg-surface-hover',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block h-[18px] w-[18px] rounded-full bg-white shadow-md transition-transform duration-300 ease-(--ease-spring)',
          checked ? 'translate-x-[22px]' : 'translate-x-[3px]',
        )}
      />
    </button>
  );
}
