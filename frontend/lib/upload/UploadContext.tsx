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
import { acceptFor, checkBatch, type UploadCategory } from '@/utils/uploadAccept';

interface UploadContextValue {
  /** Queues files for `folderId`; null uploads to the library root. */
  addFiles: UploadQueue['addFiles'];
  /**
   * Opens the shared file picker with `folderId` as the destination, optionally limited
   * to one kind of file. The limit is checked again when the selection comes back, and
   * again by the server — see utils/uploadAccept.
   */
  requestUpload: (folderId: string | null, uploadType?: UploadCategory) => void;
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
  // Refs, not state: they are only read back inside the change handler, and re-rendering
  // the app the moment someone opens a file dialog would be pure waste.
  const targetFolderId = useRef<string | null>(null);
  const targetUploadType = useRef<UploadCategory | undefined>(undefined);

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

  const requestUpload = useCallback((folderId: string | null, uploadType?: UploadCategory) => {
    targetFolderId.current = folderId;
    targetUploadType.current = uploadType;
    if (inputRef.current) inputRef.current.accept = acceptFor(uploadType);
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      const uploadType = targetUploadType.current;

      // The whole selection stands or falls together — see checkBatch for why partial
      // uploads are worse than none.
      const verdict = checkBatch(files, uploadType);
      if (!verdict.ok) {
        toast.error(verdict.message!);
      } else if (files.length > 0) {
        addFiles(files, targetFolderId.current, uploadType);
      }
      // Clearing the value lets the same file be picked again straight afterwards, which
      // otherwise fires no change event at all.
      event.target.value = '';
    },
    [addFiles, toast],
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
