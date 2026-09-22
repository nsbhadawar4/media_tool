'use client';

import { Search, X } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import { cn } from '@/utils/cn';
import type { FileType, SortOption } from '@/types/api';

const TYPE_FILTERS: Array<{ label: string; value: FileType | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Images', value: 'image' },
  { label: 'Videos', value: 'video' },
  { label: 'Documents', value: 'document' },
];

const SORT_OPTIONS: Array<{ label: string; value: SortOption }> = [
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
  { label: 'Name A–Z', value: 'name_asc' },
  { label: 'Name Z–A', value: 'name_desc' },
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
  /**
   * The types this view may show at all. The buttons narrow within it and can never widen
   * past it — a "Documents" button on a page that holds photos and videos would return an
   * empty grid and read as a bug.
   */
  availableFileTypes?: readonly FileType[];
  showTypeFilter?: boolean;
}

export function MediaFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  fileType,
  availableFileTypes,
  onFileTypeChange,
  showTypeFilter = true,
}: MediaFiltersProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative w-full lg:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search files…"
          aria-label="Search files"
          className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-9 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        {search && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted transition hover:bg-surface-hover hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showTypeFilter && onFileTypeChange && (
          <div className="app-no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl bg-surface-hover p-1">
            {TYPE_FILTERS.filter(
            (filter) =>
              filter.value === undefined ||
              !availableFileTypes ||
              availableFileTypes.includes(filter.value),
          ).map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={() => onFileTypeChange(filter.value)}
                aria-pressed={fileType === filter.value}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  fileType === filter.value
                    ? 'bg-surface text-foreground shadow-sm'
                    : 'text-muted hover:text-foreground',
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        )}

        <Select
          aria-label="Sort files"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          options={SORT_OPTIONS}
        />
      </div>
    </div>
  );
}
