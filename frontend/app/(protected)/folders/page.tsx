'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { FolderGrid, FolderGridSkeleton } from '@/components/folders/FolderGrid';
import { FolderToolbar } from '@/components/folders/FolderToolbar';
import { ErrorState } from '@/components/ui/ErrorState';
import { FolderCrudModals } from '@/components/folders/FolderCrudModals';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useDebounce } from '@/hooks/useDebounce';
import { useUploads } from '@/lib/upload/UploadContext';
import { foldersApi } from '@/lib/api/folders';
import type { FolderSortOption } from '@/types/api';

export default function FoldersPage() {
  const crud = useFolderCrud(null);
  const { requestUpload } = useUploads();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<FolderSortOption>('name_asc');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading, isError, error, refetch } = useQuery({
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

      {/* An error must not fall through to the empty state, which would claim the
          library is empty when it simply could not be read. */}
      {isError ? (
        <ErrorState error={error} onRetry={() => refetch()} subject="folders" />
      ) : isLoading ? (
        <FolderGridSkeleton />
      ) : (
        <FolderGrid
          folders={folders}
          onRename={crud.setFolderToRename}
          onMove={crud.setFolderToMove}
          onDelete={crud.setFolderToDelete}
          onUpload={(folder) => requestUpload(folder._id)}
          emptyMessage={
            debouncedSearch
              ? `No folders match "${debouncedSearch}".`
              : 'Create your first folder to start organizing photos, videos and documents.'
          }
          // A search that found nothing is not an empty library, so it gets no
          // "create a folder" prompt — clearing the search is the way out of it.
          emptyAction={
            debouncedSearch ? undefined : (
              <Button onClick={() => crud.setIsCreateOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                Create folder
              </Button>
            )
          }
        />
      )}

      <FolderCrudModals crud={crud} />
    </div>
  );
}
