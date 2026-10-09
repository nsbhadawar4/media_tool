'use client';

import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
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
      <SearchInput value={search} onChange={onSearchChange} placeholder="Search files…" className="lg:max-w-xs" />

      <div className="flex flex-wrap items-center gap-2">
        {showTypeFilter && onFileTypeChange && (
          <div className="app-no-scrollbar flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-surface p-1">
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
                  'inline-flex min-h-10 shrink-0 items-center rounded-lg px-3 py-1.5 text-[13px] font-medium transition duration-150 lg:min-h-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50',
                  fileType === filter.value
                    ? 'bg-surface-hover text-foreground shadow-card'
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
