'use client';

import { Search } from 'lucide-react';
import type { FolderSortOption } from '@/types/api';

const SORT_OPTIONS: Array<{ label: string; value: FolderSortOption }> = [
  { label: 'Name A-Z', value: 'name_asc' },
  { label: 'Name Z-A', value: 'name_desc' },
  { label: 'Newest', value: 'newest' },
  { label: 'Oldest', value: 'oldest' },
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
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="whitespace-nowrap text-xs text-muted">
          {count} {count === 1 ? 'folder' : 'folders'}
        </span>
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as FolderSortOption)}
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
