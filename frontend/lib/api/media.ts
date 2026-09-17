import { api, API_BASE_URL, ApiError } from './client';
import type { FileType, Media, SortOption } from '@/types/api';

export interface ListMediaParams {
  folderId?: string;
  fileType?: FileType;
  search?: string;
  isDeleted?: boolean;
  sort?: SortOption;
  page?: number;
  limit?: number;
}

export interface UploadResult {
  uploaded: Media[];
  failed: Array<{ fileName: string; error: string }>;
}

/**
 * Bulk endpoints apply per item rather than all-or-nothing: `failed` lists the ids that
 * could not be processed (already trashed, deleted in another tab) while everything else
 * still goes through, so one stale selection entry can't block the rest.
 */
export interface BulkResult {
  succeeded: Media[];
  failed: Array<{ id: string; error: string }>;
}

export const mediaApi = {
  list: (params: ListMediaParams = {}) => api.get<Media[]>('/api/media', { ...params }),
  get: (id: string) => api.get<Media>(`/api/media/${id}`),
  rename: (id: string, originalName: string) => api.patch<Media>(`/api/media/${id}`, { originalName }),
  move: (id: string, folderId: string | null) => api.post<Media>(`/api/media/${id}/move`, { folderId }),
  remove: (id: string) => api.delete<Media>(`/api/media/${id}`),
  restore: (id: string) => api.post<Media>(`/api/media/${id}/restore`),
  bulkRemove: (ids: string[]) => api.post<BulkResult>('/api/media/bulk/delete', { ids }),
  bulkMove: (ids: string[], folderId: string | null) =>
    api.post<BulkResult>('/api/media/bulk/move', { ids, folderId }),
};

/** Thrown when a caller aborts an in-progress upload via its AbortSignal — distinct from a real failure. */
export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

export interface UploadExtras {
  /** Poster frame for a video, captured in the browser (see utils/videoPoster). */
  poster?: Blob | null;
  /** Video length in seconds, also read in the browser. */
  duration?: number | null;
}

/**
 * Uploads a single file with progress via XHR (fetch has no upload progress event).
 * The caller sends one file per request (see useUploadQueue), so a single failure never
 * blocks the rest and each file gets its own progress bar. Pass `signal` to allow
 * cancelling a specific in-flight upload from the UI.
 */
export function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  extras: UploadExtras = {},
): Promise<Media> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCancelledError());
      return;
    }

    const formData = new FormData();
    formData.append('files', file);
    if (folderId) formData.append('folderId', folderId);
    // The server only accepts a poster whose extension maps to a known image type.
    if (extras.poster) formData.append('poster', extras.poster, 'poster.jpg');
    if (extras.duration) formData.append('duration', String(extras.duration));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/media/upload`);
    xhr.withCredentials = true;

    const handleAbort = () => xhr.abort();
    signal?.addEventListener('abort', handleAbort);
    const cleanup = () => signal?.removeEventListener('abort', handleAbort);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onabort = () => {
      cleanup();
      reject(new UploadCancelledError());
    };

    xhr.onload = () => {
      cleanup();
      let payload: { success: boolean; data?: UploadResult; error?: { message: string } } | null = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        // ignore parse failure, handled below via status check
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload?.success && payload.data) {
        const { uploaded, failed } = payload.data;
        if (uploaded.length > 0) {
          onProgress(100);
          resolve(uploaded[0]!);
        } else {
          reject(new ApiError(failed[0]?.error ?? 'Upload failed', xhr.status));
        }
      } else {
        reject(new ApiError(payload?.error?.message ?? `Upload failed (${xhr.status})`, xhr.status));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new ApiError('Network error during upload', 0));
    };

    xhr.send(formData);
  });
}
