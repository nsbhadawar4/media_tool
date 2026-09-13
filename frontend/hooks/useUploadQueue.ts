import { useCallback, useRef, useState } from 'react';
import { uploadFile, UploadCancelledError } from '@/lib/api/media';
import { ApiError } from '@/lib/api/client';
import type { Media } from '@/types/api';

export interface UploadQueueItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  /** The browser-reported MIME type, e.g. "image/png" — used to pick a queue-row icon/thumbnail. */
  mimeType: string;
  folderId: string | null;
  progress: number;
  status: 'uploading' | 'done' | 'error' | 'cancelled';
  error?: string;
}

interface UseUploadQueueOptions {
  onFileUploaded?: (media: Media) => void;
  onAllSettled?: () => void;
}

export function useUploadQueue({ onFileUploaded, onAllSettled }: UseUploadQueueOptions = {}) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const pendingCount = useRef(0);
  const controllers = useRef(new Map<string, AbortController>());

  const updateItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const runUpload = useCallback(
    (id: string, file: File, folderId: string | null) => {
      const controller = new AbortController();
      controllers.current.set(id, controller);
      pendingCount.current += 1;

      uploadFile(file, folderId, (percent) => updateItem(id, { progress: percent }), controller.signal)
        .then((media) => {
          updateItem(id, { status: 'done', progress: 100 });
          onFileUploaded?.(media);
        })
        .catch((err) => {
          if (err instanceof UploadCancelledError) {
            updateItem(id, { status: 'cancelled' });
          } else {
            updateItem(id, {
              status: 'error',
              error: err instanceof ApiError ? err.message : 'Upload failed',
            });
          }
        })
        .finally(() => {
          controllers.current.delete(id);
          pendingCount.current -= 1;
          if (pendingCount.current === 0) onAllSettled?.();
        });
    },
    [updateItem, onFileUploaded, onAllSettled],
  );

  const addFiles = useCallback(
    (files: File[], folderId: string | null) => {
      if (files.length === 0) return;

      const newItems: UploadQueueItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        folderId,
        progress: 0,
        status: 'uploading',
      }));
      setItems((prev) => [...prev, ...newItems]);

      newItems.forEach((item) => runUpload(item.id, item.file, item.folderId));
    },
    [runUpload],
  );

  /** Aborts an in-flight upload and marks it cancelled (stays in the queue so it can still be retried). */
  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  /** Re-attempts a failed or cancelled upload using the same original File. */
  const retry = useCallback(
    (id: string) => {
      setItems((prev) => {
        const item = prev.find((i) => i.id === id);
        if (item) runUpload(id, item.file, item.folderId);
        return prev.map((i) => (i.id === id ? { ...i, status: 'uploading', progress: 0, error: undefined } : i));
      });
    },
    [runUpload],
  );

  const dismiss = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status === 'uploading'));
  }, []);

  return { items, addFiles, cancel, retry, dismiss, clearCompleted };
}

export type UploadQueue = ReturnType<typeof useUploadQueue>;
