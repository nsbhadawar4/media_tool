'use client';

import { FolderModal } from './FolderModal';
import { FolderPickerModal } from '@/components/modals/FolderPickerModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { FolderCrud } from '@/hooks/useFolderCrud';

export function FolderCrudModals({ crud }: { crud: FolderCrud }) {
  return (
    <>
      <FolderModal
        key={crud.isCreateOpen ? 'create-open' : 'create-closed'}
        isOpen={crud.isCreateOpen}
        onClose={() => crud.setIsCreateOpen(false)}
        onSubmit={crud.handleCreate}
      />

      <FolderModal
        key={crud.folderToRename?._id ?? 'rename-none'}
        isOpen={Boolean(crud.folderToRename)}
        onClose={() => crud.setFolderToRename(null)}
        onSubmit={(input) => crud.handleRename(input.name)}
        folder={crud.folderToRename}
      />

      <FolderPickerModal
        isOpen={Boolean(crud.folderToMove)}
        onClose={() => crud.setFolderToMove(null)}
        onSelect={crud.handleMove}
        title={`Move "${crud.folderToMove?.name ?? ''}"`}
        excludeFolderId={crud.folderToMove?._id}
      />

      <ConfirmDialog
        isOpen={Boolean(crud.folderToDelete)}
        onClose={() => crud.setFolderToDelete(null)}
        onConfirm={crud.handleDelete}
        title="Move folder to trash?"
        description={`"${crud.folderToDelete?.name ?? ''}" and everything inside it will be moved to trash.`}
        confirmLabel="Move to trash"
        isLoading={crud.isDeleting}
      />
    </>
  );
}
