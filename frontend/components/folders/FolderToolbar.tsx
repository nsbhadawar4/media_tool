'use client';

import { Select } from '@/components/ui/Select';
import { SearchInput } from '@/components/ui/SearchInput';
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
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SearchInput value={search} onChange={onSearchChange} placeholder={searchPlaceholder} />

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
