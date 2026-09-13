'use client';

import { Search } from 'lucide-react';
import type { FileType, SortOption } from '@/types/api';

const TYPE_FILTERS: Array<{ label: string; value: FileType | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'document' },
];

const SORT_OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
  { label: 'Name A-Z', value: 'name_asc' },
  { label: 'Name Z-A', value: 'name_desc' },
  { label: 'Largest first', value: 'size_desc' },
  { label: 'Smallest first', value: 'size_asc' },
];

interface MediaFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortOption;
  onSortChange: (value: SortOption) => void;
  fileType?: FileType;
  onFileTypeChange?: (value: FileType | undefined) => void;
  showTypeFilter?: boolean;
}

export function MediaFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  fileType,
  onFileTypeChange,
  showTypeFilter = true,
}: MediaFiltersProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search files…"
          className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showTypeFilter && onFileTypeChange && (
          <div className="flex flex-wrap items-center gap-1.5">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => onFileTypeChange(f.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  fileType === f.value ? 'bg-accent text-accent-foreground' : 'bg-surface-hover text-muted hover:text-foreground'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground outline-none transition focus:border-accent"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
