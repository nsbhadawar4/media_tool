'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { FolderGrid } from '@/components/folders/FolderGrid';
import { FolderToolbar } from '@/components/folders/FolderToolbar';
import { FolderCrudModals } from '@/components/folders/FolderCrudModals';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useDebounce } from '@/hooks/useDebounce';
import { foldersApi } from '@/lib/api/folders';
import type { FolderSortOption } from '@/types/api';

export default function FoldersPage() {
  const crud = useFolderCrud(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FolderSortOption>('name_asc');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['folders', 'root', debouncedSearch, sort],
    queryFn: () => foldersApi.list({ parentFolder: null, search: debouncedSearch || undefined, sort }),
  });

  const folders = data?.data.folders ?? [];

  return (
    <div>
      <PageHeader
        title="Folders"
        description="Organize your library the way you like — folders can be nested as deep as you need."
        actions={
          <Button onClick={() => crud.setIsCreateOpen(true)}>
            <FolderPlus className="h-4 w-4" />
            New folder
          </Button>
        }
      />

      <FolderToolbar
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        count={folders.length}
        searchPlaceholder="Search all folders…"
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : (
        <FolderGrid
          folders={folders}
          onRename={crud.setFolderToRename}
          onMove={crud.setFolderToMove}
          onDelete={crud.setFolderToDelete}
          emptyMessage={
            debouncedSearch
              ? `No folders match "${debouncedSearch}".`
              : 'Create your first folder to start organizing photos, videos and documents.'
          }
        />
      )}

      <FolderCrudModals crud={crud} />
    </div>
  );
}
