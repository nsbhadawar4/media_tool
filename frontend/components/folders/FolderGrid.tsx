'use client';

import { FolderClosed } from 'lucide-react';
import { FolderCard } from './FolderCard';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Folder } from '@/types/api';

interface FolderGridProps {
  folders: Folder[];
  onRename: (folder: Folder) => void;
  onMove: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  emptyMessage?: string;
}

export function FolderGrid({ folders, onRename, onMove, onDelete, emptyMessage }: FolderGridProps) {
  if (folders.length === 0) {
    return (
      <EmptyState
        icon={FolderClosed}
        title="No folders yet"
        description={emptyMessage ?? 'Create a folder to start organizing your library.'}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {folders.map((folder) => (
        <FolderCard key={folder._id} folder={folder} onRename={onRename} onMove={onMove} onDelete={onDelete} />
      ))}
    </div>
  );
}
