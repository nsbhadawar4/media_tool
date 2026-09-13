import { useCallback, useRef, useState } from 'react';
import { uploadFile } from '@/lib/api/media';
import { ApiError } from '@/lib/api/client';
import type { Media } from '@/types/api';

export interface UploadQueueItem {
  id: string;
  fileName: string;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

interface UseUploadQueueOptions {
  onFileUploaded?: (media: Media) => void;
  onAllSettled?: () => void;
}

export function useUploadQueue({ onFileUploaded, onAllSettled }: UseUploadQueueOptions = {}) {
  const [items, setItems] = useState<UploadQueueItem[]>([]);
  const pendingCount = useRef(0);

  const updateItem = useCallback((id: string, patch: Partial<UploadQueueItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const addFiles = useCallback(
    (files: File[], folderId: string | null) => {
      if (files.length === 0) return;

      const newItems: UploadQueueItem[] = files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        fileName: file.name,
        progress: 0,
        status: 'uploading',
      }));
      setItems((prev) => [...prev, ...newItems]);
      pendingCount.current += files.length;

      files.forEach((file, i) => {
        const item = newItems[i]!;
        uploadFile(file, folderId, (percent) => updateItem(item.id, { progress: percent }))
          .then((media) => {
            updateItem(item.id, { status: 'done', progress: 100 });
            onFileUploaded?.(media);
          })
          .catch((err) => {
            updateItem(item.id, {
              status: 'error',
              error: err instanceof ApiError ? err.message : 'Upload failed',
            });
          })
          .finally(() => {
            pendingCount.current -= 1;
            if (pendingCount.current === 0) onAllSettled?.();
          });
      });
    },
    [updateItem, onFileUploaded, onAllSettled],
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status === 'uploading'));
  }, []);

  return { items, addFiles, dismiss, clearCompleted };
}

export type UploadQueue = ReturnType<typeof useUploadQueue>;
