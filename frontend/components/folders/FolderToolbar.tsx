'use client';

import { Search, X } from 'lucide-react';
import { Select } from '@/components/ui/Select';
import type { FolderSortOption } from '@/types/api';

const SORT_OPTIONS = [
  { label: 'Name A–Z', value: 'name_asc' },
  { label: 'Name Z–A', value: 'name_desc' },
  { label: 'Newest first', value: 'newest' },
  { label: 'Oldest first', value: 'oldest' },
];

interface FolderToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: FolderSortOption;
  onSortChange: (value: FolderSortOption) => void;
  count: number;
  searchPlaceholder?: string;
}

export function FolderToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  count,
  searchPlaceholder = 'Search folders…',
}: FolderToolbarProps) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          type="text"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
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

      <div className="flex shrink-0 items-center gap-3">
        <span className="whitespace-nowrap text-xs text-muted">
          {count} {count === 1 ? 'folder' : 'folders'}
        </span>
        <Select
          aria-label="Sort folders"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as FolderSortOption)}
          options={SORT_OPTIONS}
        />
      </div>
    </div>
  );
}
