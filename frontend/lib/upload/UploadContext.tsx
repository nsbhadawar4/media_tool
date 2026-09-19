'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast/ToastContext';
import { useUploadQueue, type UploadQueue } from '@/hooks/useUploadQueue';
import { UploadProgressPanel } from '@/components/media/UploadProgressPanel';
import { acceptFor } from '@/utils/uploadAccept';

interface UploadContextValue {
  /** Queues files for `folderId`; null uploads to the library root. */
  addFiles: UploadQueue['addFiles'];
  /** Opens the shared file picker with `folderId` as the destination. */
  requestUpload: (folderId: string | null) => void;
  /** Lifts the progress panel clear of the bulk-selection bar, which docks to the same edge. */
  setPanelRaised: (raised: boolean) => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

/**
 * One upload queue, one progress panel, one file picker for the whole signed-in app.
 *
 * Every page used to build its own queue, which was fine only as long as no two of them
 * could be on screen together. They can now: a folder page shows both its own files and a
 * grid of subfolder cards that each offer an upload, and two panels dock to the same corner
 * of the viewport — the second would sit exactly on top of the first. Sharing one queue also
 * means an upload started on one page keeps reporting after navigating to another.
 *
 * Files go to POST /api/media exactly as before, with the destination folder in the body;
 * the server still decides what the signed-in account is allowed to write to.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [isPanelRaised, setIsPanelRaised] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  // A ref, not state: it is only read back inside the change handler, and re-rendering the
  // app the moment someone opens a file dialog would be pure waste.
  const targetFolderId = useRef<string | null>(null);

  const queue = useUploadQueue({
    onFileUploaded: () => {
      queryClient.invalidateQueries({ queryKey: ['media'] });
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['folder'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onAllSettled: () => toast.success('Upload complete'),
  });

  const { addFiles } = queue;

  const requestUpload = useCallback((folderId: string | null) => {
    targetFolderId.current = folderId;
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) addFiles(files, targetFolderId.current);
      // Clearing the value lets the same file be picked again straight afterwards, which
      // otherwise fires no change event at all.
      event.target.value = '';
    },
    [addFiles],
  );

  const value = useMemo(
    () => ({ addFiles, requestUpload, setPanelRaised: setIsPanelRaised }),
    [addFiles, requestUpload],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      {/* Reached only through the actions that open it, never by tabbing. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptFor()}
        onChange={handleInputChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      <UploadProgressPanel queue={queue} isRaised={isPanelRaised} />
    </UploadContext.Provider>
  );
}

export function useUploads(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) throw new Error('useUploads must be used inside an UploadProvider');
  return context;
}
