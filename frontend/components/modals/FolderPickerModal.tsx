'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FolderClosed, Home } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { foldersApi } from '@/lib/api/folders';

interface FolderPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (folderId: string | null) => Promise<void>;
  title?: string;
  /** Hide this folder from the browsable list — used when moving a folder so it can't be dropped into itself. */
  excludeFolderId?: string;
}

export function FolderPickerModal({ isOpen, onClose, onSelect, title = 'Move to…', excludeFolderId }: FolderPickerModalProps) {
  const [currentParentId, setCurrentParentId] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ['folders-picker', currentParentId],
    queryFn: () => foldersApi.list({ parentFolder: currentParentId }),
    enabled: isOpen,
  });

  const folders = (data?.data.folders ?? []).filter((f) => f._id !== excludeFolderId);
  const breadcrumbs = data?.data.breadcrumbs ?? [];

  const handleClose = () => {
    setCurrentParentId(null);
    onClose();
  };

  const handleMoveHere = async () => {
    setIsMoving(true);
    try {
      await onSelect(currentParentId);
      handleClose();
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={title} size="sm">
      <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap pb-3 text-xs text-muted">
        <button
          type="button"
          onClick={() => setCurrentParentId(null)}
          className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-surface-hover hover:text-foreground"
        >
          <Home className="h-3.5 w-3.5" />
          Root
        </button>
        {breadcrumbs.map((crumb) => (
          <span key={crumb.id} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            <button
              type="button"
              onClick={() => setCurrentParentId(crumb.id)}
              className="rounded-lg px-1.5 py-1 transition hover:bg-surface-hover hover:text-foreground"
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </div>

      <div className="max-h-64 min-h-[8rem] overflow-y-auto rounded-xl border border-border">
        {isFetching && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
        {!isFetching && folders.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">No subfolders here.</p>
        )}
        {!isFetching &&
          folders.map((folder) => (
            <button
              key={folder._id}
              type="button"
              onClick={() => setCurrentParentId(folder._id)}
              className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2.5 text-left text-sm text-foreground transition last:border-b-0 hover:bg-surface-hover"
            >
              <FolderClosed className="h-4 w-4 shrink-0 text-accent" />
              <span className="flex-1 truncate">{folder.name}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
            </button>
          ))}
      </div>

      <Button className="mt-4 w-full" onClick={handleMoveHere} isLoading={isMoving}>
        Move here
      </Button>
    </Modal>
  );
}
