'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderPlus, MoreHorizontal, PencilLine, FolderInput, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { DropdownMenu } from '@/components/ui/DropdownMenu';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { FolderModal } from '@/components/folders/FolderModal';
import { FolderPickerModal } from '@/components/modals/FolderPickerModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Breadcrumbs } from '@/components/folders/Breadcrumbs';
import { FolderGrid } from '@/components/folders/FolderGrid';
import { FolderCrudModals } from '@/components/folders/FolderCrudModals';
import { MediaLibraryView } from '@/components/media/MediaLibraryView';
import { useFolderCrud } from '@/hooks/useFolderCrud';
import { useToast } from '@/lib/toast/ToastContext';
import { foldersApi } from '@/lib/api/folders';
import { ApiError } from '@/lib/api/client';

export default function FolderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();

  const subfolderCrud = useFolderCrud(id);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isMoveOpen, setIsMoveOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['folder', id],
    queryFn: () => foldersApi.get(id),
  });

  if (isLoading) return <FullPageSpinner />;
  if (!data) {
    return <p className="text-sm text-muted">Folder not found.</p>;
  }

  const { folder, subfolders, breadcrumbs } = data.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['folder'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleEdit = async (input: { name: string; description?: string }) => {
    try {
      await foldersApi.update(folder._id, input);
      toast.success('Folder updated');
      invalidate();
    } catch (err) {
      throw new Error(err instanceof ApiError ? err.message : 'Failed to update folder');
    }
  };

  const handleMove = async (targetParentId: string | null) => {
    try {
      await foldersApi.update(folder._id, { parentFolder: targetParentId });
      toast.success('Folder moved');
      invalidate();
      router.push(targetParentId ? `/admin/folders/${targetParentId}` : '/admin/folders');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to move folder');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await foldersApi.remove(folder._id);
      toast.success('Folder moved to trash');
      invalidate();
      router.push(folder.parentFolder ? `/admin/folders/${folder.parentFolder}` : '/admin/folders');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete folder');
      setIsDeleting(false);
    }
  };

  return (
    <div>
      <Breadcrumbs items={breadcrumbs} currentName={folder.name} />

      <PageHeader
        title={folder.name}
        description={folder.description || `${folder.itemCount} item${folder.itemCount === 1 ? '' : 's'}`}
        actions={
          <>
            <Button onClick={() => subfolderCrud.setIsCreateOpen(true)}>
              <FolderPlus className="h-4 w-4" />
              New subfolder
            </Button>
            <DropdownMenu
              trigger={<MoreHorizontal className="h-4 w-4" />}
              triggerClassName="border border-border bg-surface hover:bg-surface-hover"
              items={[
                { label: 'Rename folder', icon: <PencilLine className="h-4 w-4" />, onClick: () => setIsEditOpen(true) },
                { label: 'Move folder', icon: <FolderInput className="h-4 w-4" />, onClick: () => setIsMoveOpen(true) },
                {
                  label: 'Delete folder',
                  icon: <Trash2 className="h-4 w-4" />,
                  onClick: () => setIsDeleteOpen(true),
                  danger: true,
                },
              ]}
            />
          </>
        }
      />

      {subfolders.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Subfolders</h2>
          <FolderGrid
            folders={subfolders}
            onRename={subfolderCrud.setFolderToRename}
            onMove={subfolderCrud.setFolderToMove}
            onDelete={subfolderCrud.setFolderToDelete}
          />
        </div>
      )}

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Files</h2>
        <MediaLibraryView folderId={folder._id} emptyMessage="Upload photos, videos or documents into this folder." />
      </div>

      <FolderCrudModals crud={subfolderCrud} />

      <FolderModal
        key={isEditOpen ? `edit-${folder._id}` : 'edit-closed'}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSubmit={handleEdit}
        folder={folder}
      />
      <FolderPickerModal
        isOpen={isMoveOpen}
        onClose={() => setIsMoveOpen(false)}
        onSelect={handleMove}
        title={`Move "${folder.name}"`}
        excludeFolderId={folder._id}
      />
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Move folder to trash?"
        description={`"${folder.name}" and everything inside it will be moved to trash.`}
        confirmLabel="Move to trash"
        isLoading={isDeleting}
      />
    </div>
  );
}
