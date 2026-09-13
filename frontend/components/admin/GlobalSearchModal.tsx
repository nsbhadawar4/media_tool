'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FolderClosed, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { searchApi } from '@/lib/api/search';
import { useDebounce } from '@/hooks/useDebounce';
import { iconForFileType } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/format';
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
  { label: 'Largest', value: 'size_desc' },
  { label: 'Smallest', value: 'size_asc' },
];

export function GlobalSearchModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [fileType, setFileType] = useState<FileType | undefined>(undefined);
  const [sort, setSort] = useState<SortOption>('newest');
  const debouncedQuery = useDebounce(query, 300);

  // State starts fresh on its own: the caller renders this keyed to the open/close
  // transition, so a new instance (with default state) mounts each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debouncedQuery, fileType, sort],
    queryFn: () => searchApi.run({ q: debouncedQuery, fileType, sort, limit: 30 }),
    enabled: isOpen,
  });

  const folders = data?.data.folders ?? [];
  const media = data?.data.media ?? [];
  const hasResults = folders.length > 0 || media.length > 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" hideCloseButton>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search folders, photos, videos, documents…"
          className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setFileType(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              fileType === f.value ? 'bg-accent text-accent-foreground' : 'bg-surface-hover text-muted hover:text-foreground'
            }`}
          >
            {f.label}
          </button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortOption)}
          className="ml-auto rounded-full border border-border bg-surface px-3 py-1 text-xs text-foreground outline-none"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 max-h-[55vh] min-h-[10rem] overflow-y-auto">
        {isFetching && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {!isFetching && !hasResults && (
          <p className="py-10 text-center text-sm text-muted">
            {query ? 'No matches found.' : 'Start typing to search your library.'}
          </p>
        )}

        {!isFetching && folders.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">Folders</p>
            <div className="space-y-1">
              {folders.map((folder) => (
                <button
                  key={folder._id}
                  type="button"
                  onClick={() => {
                    onClose();
                    router.push(`/admin/folders/${folder._id}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-hover"
                >
                  <FolderClosed className="h-4 w-4 shrink-0 text-accent" />
                  <span className="flex-1 truncate text-foreground">{folder.name}</span>
                  <span className="shrink-0 text-xs text-muted">{folder.itemCount} items</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!isFetching && media.length > 0 && (
          <div>
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted">Files</p>
            <div className="space-y-1">
              {media.map((item) => {
                const Icon = iconForFileType(item.fileType, item.mimeType);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push(item.folderId ? `/admin/folders/${item.folderId}` : '/admin/media');
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-surface-hover"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted" />
                    <span className="flex-1 truncate text-foreground">{item.originalName}</span>
                    <span className="shrink-0 text-xs text-muted">{formatBytes(item.size)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
