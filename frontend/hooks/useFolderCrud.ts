import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { foldersApi } from '@/lib/api/folders';
import { ApiError } from '@/lib/api/client';
import { useToast } from '@/lib/toast/ToastContext';
import type { Folder } from '@/types/api';

/**
 * Shared create/rename/move/delete state + handlers for a folder grid. One instance of
 * this hook backs the modals on both the root Folders page and each folder detail page.
 */
export function useFolderCrud(currentParentId: string | null) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState<Folder | null>(null);
  const [folderToMove, setFolderToMove] = useState<Folder | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['folder'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleCreate = async (input: { name: string; description?: string }) => {
    try {
      await foldersApi.create({ ...input, parentFolder: currentParentId });
      toast.success('Folder created');
      invalidate();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to create folder');
    }
  };

  const handleRename = async (name: string) => {
    if (!folderToRename) return;
    try {
      await foldersApi.update(folderToRename._id, { name });
      toast.success('Folder renamed');
      invalidate();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to rename folder');
    }
  };

  const handleMove = async (targetParentId: string | null) => {
    if (!folderToMove) return;
    try {
      await foldersApi.update(folderToMove._id, { parentFolder: targetParentId });
      toast.success('Folder moved');
      invalidate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move folder');
    }
  };

  const handleDelete = async () => {
    if (!folderToDelete) return;
    setIsDeleting(true);
    try {
      await foldersApi.remove(folderToDelete._id);
      toast.success('Folder moved to trash');
      invalidate();
      setFolderToDelete(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete folder');
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    isCreateOpen,
    setIsCreateOpen,
    folderToRename,
    setFolderToRename,
    folderToMove,
    setFolderToMove,
    folderToDelete,
    setFolderToDelete,
    isDeleting,
    handleCreate,
    handleRename,
    handleMove,
    handleDelete,
  };
}

export type FolderCrud = ReturnType<typeof useFolderCrud>;
