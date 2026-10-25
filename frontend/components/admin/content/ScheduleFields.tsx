'use client';

import { useId, useMemo } from 'react';
import { MONTHS, academicYearChoices } from '@/lib/content/academicCalendar';
import { cn } from '@/utils/cn';

const fieldClass =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong disabled:opacity-50';

export interface ScheduleValue {
  academicYear: string;
  /** "" = no month (the whole year). */
  month: string;
}

/**
 * Where in the academic calendar a course is taught: the year ("2026-27"), then a month in it (April
 * first). A month can only be chosen once there is a year — the server refuses the other way round —
 * and clearing the year clears the month. Choosing neither leaves the course "needing a schedule".
 */
export function ScheduleFields({
  value,
  onChange,
  errors = {},
  inUse = [],
  compact = false,
}: {
  value: ScheduleValue;
  onChange: (next: ScheduleValue) => void;
  errors?: { academicYear?: string; month?: string };
  /** Years already on courses, so an older or later year still shows in the list. */
  inUse?: Array<string | null | undefined>;
  compact?: boolean;
}) {
  const id = useId();
  const years = useMemo(() => academicYearChoices(new Date(), [...inUse, value.academicYear]), [inUse, value.academicYear]);
  return (
    <div className={cn('grid gap-4', compact ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2')}>
      <div>
        <label htmlFor={`${id}-year`} className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
          Academic year
        </label>
        <select id={`${id}-year`} value={value.academicYear} onChange={(e) => onChange({ academicYear: e.target.value, month: e.target.value ? value.month : '' })} className={fieldClass} aria-invalid={Boolean(errors.academicYear)}>
          <option value="">Not scheduled</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        {errors.academicYear && <p className="mt-1 text-xs text-danger">{errors.academicYear}</p>}
      </div>
      <div>
        <label htmlFor={`${id}-month`} className="mb-1.5 block text-[13px] font-medium text-foreground-soft">
          Month
        </label>
        <select id={`${id}-month`} value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })} disabled={!value.academicYear} className={fieldClass} aria-invalid={Boolean(errors.month)}>
          <option value="">{value.academicYear ? 'Whole year' : 'Choose a year first'}</option>
          {MONTHS.map((m) => (
            <option key={m.n} value={m.n}>
              {m.long}
            </option>
          ))}
        </select>
        {errors.month && <p className="mt-1 text-xs text-danger">{errors.month}</p>}
      </div>
    </div>
  );
}

/** The value stored on a course, as the form holds it. */
export const scheduleToValue = (c?: { academicYear?: string | null; month?: number | null } | null): ScheduleValue => ({ academicYear: c?.academicYear ?? '', month: c?.month ? String(c.month) : '' });

/** The form's value as the API takes it: both null when unscheduled. */
export const valueToSchedule = (v: ScheduleValue): { academicYear: string | null; month: number | null } => ({ academicYear: v.academicYear || null, month: v.academicYear && v.month ? Number(v.month) : null });
