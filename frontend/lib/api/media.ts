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

export const mediaApi = {
  list: (params: ListMediaParams = {}) => api.get<Media[]>('/api/media', { ...params }),
  get: (id: string) => api.get<Media>(`/api/media/${id}`),
  rename: (id: string, originalName: string) => api.patch<Media>(`/api/media/${id}`, { originalName }),
  move: (id: string, folderId: string | null) => api.post<Media>(`/api/media/${id}/move`, { folderId }),
  remove: (id: string) => api.delete<Media>(`/api/media/${id}`),
  restore: (id: string) => api.post<Media>(`/api/media/${id}/restore`),
};

/**
 * Uploads files with per-file progress via XHR (fetch has no upload progress event).
 * Uploads sequentially, one request per file, so a single failure never blocks the rest
 * and the caller gets a clean per-file progress callback.
 */
export function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: (percent: number) => void,
): Promise<Media> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('files', file);
    if (folderId) formData.append('folderId', folderId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/api/media/upload`);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
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

    xhr.onerror = () => reject(new ApiError('Network error during upload', 0));
    xhr.send(formData);
  });
}
