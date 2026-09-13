'use client';

import { useQuery } from '@tanstack/react-query';
import { FolderPlus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { FolderGrid } from '@/components/folders/FolderGrid';
import { FolderCrudModals } from '@/components/folders/FolderCrudModals';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { foldersApi } from '@/lib/api/folders';

export default function FoldersPage() {
  const crud = useFolderCrud(null);

  const { data, isLoading } = useQuery({
    queryKey: ['folders', 'root'],
    queryFn: () => foldersApi.list({ parentFolder: null }),
  });

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

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-surface-hover" />
          ))}
        </div>
      ) : (
        <FolderGrid
          folders={data?.data.folders ?? []}
          onRename={crud.setFolderToRename}
          onMove={crud.setFolderToMove}
          onDelete={crud.setFolderToDelete}
          emptyMessage="Create your first folder to start organizing photos, videos and documents."
        />
      )}

      <FolderCrudModals crud={crud} />
    </div>
  );
}
