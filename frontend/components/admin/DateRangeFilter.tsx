'use client';

import { Select } from '@/components/ui/Select';

export type DatePreset = 'all' | 'today' | '7d' | '30d' | 'custom';

export interface DateRange {
  preset: DatePreset;
  /** yyyy-mm-dd, for the custom range. */
  fromDay: string;
  toDay: string;
}

export const ALL_TIME: DateRange = { preset: 'all', fromDay: '', toDay: '' };

const PRESETS = [
  { label: 'All time', value: 'all' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Custom range', value: 'custom' },
];

/**
 * The range as ISO bounds in the admin's own timezone: "today" starts at their local midnight,
 * and a custom range covers whole local days.
 */
export function rangeToBounds(range: DateRange): { from?: string; to?: string } {
  const startOfDay = (d: Date) => {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  };
  const now = new Date();
  switch (range.preset) {
    case 'today':
      return { from: startOfDay(now).toISOString() };
    case '7d':
      return { from: new Date(now.getTime() - 7 * 86_400_000).toISOString() };
    case '30d':
      return { from: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
    case 'custom': {
      const from = range.fromDay ? new Date(`${range.fromDay}T00:00:00`) : undefined;
      const to = range.toDay ? new Date(`${range.toDay}T23:59:59.999`) : undefined;
      return { from: from?.toISOString(), to: to?.toISOString() };
    }
    default:
      return {};
  }
}

const dateInput =
  'h-10 rounded-xl border border-border bg-surface px-2.5 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20';

/** Preset picker; "Custom range" reveals two date fields. */
export function DateRangeFilter({ value, onChange, label = 'Date' }: { value: DateRange; onChange: (range: DateRange) => void; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        options={PRESETS}
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as DatePreset })}
        aria-label={`${label} range`}
      />
      {value.preset === 'custom' && (
        <div className="animate-fade-in flex items-center gap-1.5">
          <input
            type="date"
            value={value.fromDay}
            max={value.toDay || undefined}
            onChange={(e) => onChange({ ...value, fromDay: e.target.value })}
            aria-label={`${label} from`}
            className={dateInput}
          />
          <span className="text-xs text-subtle">to</span>
          <input
            type="date"
            value={value.toDay}
            min={value.fromDay || undefined}
            onChange={(e) => onChange({ ...value, toDay: e.target.value })}
            aria-label={`${label} to`}
            className={dateInput}
          />
        </div>
      )}
    </div>
  );
}
