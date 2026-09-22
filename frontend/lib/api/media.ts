import { api, API_BASE_URL, ApiError } from './client';
import type { FileType, Media, SortOption } from '@/types/api';
import type { UploadCategory } from '@/utils/uploadAccept';

export interface ListMediaParams {
  folderId?: string;
  /**
   * One type, or several. An array is serialised as `image,video`, which is what the
   * endpoint expects — the Media page needs photos and videos in one query, and asking
   * for a single type meant it could only ask for neither.
   */
  fileType?: FileType | readonly FileType[];
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
  list: ({ fileType, ...params }: ListMediaParams = {}) =>
    api.get<Media[]>('/api/media', {
      ...params,
      // Joined here rather than by widening the query serialiser: a comma-separated list
      // is what this one parameter means, and nothing else should start stringifying
      // arrays into query strings by accident.
      // `Array.isArray` does not narrow a readonly array, so the string case leads.
      fileType: typeof fileType === 'string' ? fileType : fileType?.join(','),
    }),
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
  /**
   * Which upload this is, when the page it came from only takes one kind of file.
   *
   * Sent so the *server* can enforce it against the bytes it reads. The client checking
   * first is a convenience; this is what makes the rule real, because anything that can
   * post to one upload can post to any other.
   */
  uploadType?: UploadCategory;
}

/**
 * How the server wants this file delivered.
 *
 * `direct` hands back a presigned URL to PUT the bytes straight to object storage,
 * which is the only way a file larger than a few megabytes can be uploaded at all when
 * the API runs as a serverless function — request bodies there are capped well below
 * the size of an ordinary photo. `proxy` means the active storage provider cannot issue
 * such URLs (local development), so the file goes through the API as it always has.
 *
 * The server decides, not the client: one code path below covers both, so the local and
 * deployed upload flows stay the same code rather than diverging.
 */
type PresignResponse =
  | { mode: 'proxy' }
  | { mode: 'direct'; uploadUrl: string; contentType: string; uploadToken: string };

/** Progress is reported against the PUT, which is all but a rounding error of the work. */
const DIRECT_UPLOAD_PROGRESS_CEILING = 98;

/** Wraps an XHR in a promise, reporting upload progress and honouring an AbortSignal. */
function sendWithProgress(
  xhr: XMLHttpRequest,
  body: Document | XMLHttpRequestBodyInit,
  onProgress: (percent: number) => void,
  signal: AbortSignal | undefined,
  onLoad: (xhr: XMLHttpRequest) => void,
  reject: (reason: Error) => void,
): void {
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
    onLoad(xhr);
  };

  xhr.onerror = () => {
    cleanup();
    reject(new ApiError('Network error during upload', 0));
  };

  xhr.send(body);
}

/**
 * Uploads one file, letting the server choose whether the bytes travel through the API
 * or straight to object storage.
 *
 * The caller sends one file per call (see useUploadQueue), so a single failure never
 * blocks the rest and each file gets its own progress bar. Pass `signal` to cancel a
 * specific in-flight upload from the UI.
 */
export async function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
  extras: UploadExtras = {},
): Promise<Media> {
  if (signal?.aborted) throw new UploadCancelledError();

  const { data: plan } = await api.post<PresignResponse>('/api/media/presign', {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    folderId,
    uploadType: extras.uploadType,
  });

  if (plan.mode === 'proxy') {
    return uploadThroughApi(file, folderId, onProgress, signal, extras);
  }

  await putToStorage(plan, file, onProgress, signal);

  const { data: media } = await api.post<Media>('/api/media/commit', {
    uploadToken: plan.uploadToken,
    uploadType: extras.uploadType,
    duration: extras.duration ?? null,
  });

  /**
   * A video's thumbnail can only come from the poster the browser captured: there is no
   * ffmpeg on the server, and pulling the whole video back out of storage to derive a
   * still would cost far more than sending this few-kilobyte image. Failing to attach it
   * must not fail the upload — the file is already stored and recorded, and the gallery
   * renders a placeholder for media with no thumbnail.
   */
  if (extras.poster) {
    try {
      const form = new FormData();
      form.append('poster', extras.poster, 'poster.jpg');
      const { data: withThumbnail } = await api.postForm<Media>(
        `/api/media/${media.id}/thumbnail`,
        form,
      );
      onProgress(100);
      return withThumbnail;
    } catch {
      // Keep the successfully uploaded file; it simply has no thumbnail.
    }
  }

  onProgress(100);
  return media;
}

/** PUTs the raw file to the presigned storage URL, reporting progress as it goes. */
function putToStorage(
  plan: Extract<PresignResponse, { mode: 'direct' }>,
  file: File,
  onProgress: (percent: number) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', plan.uploadUrl);

    /**
     * Signed into the URL, so it has to match exactly or storage rejects the PUT. Note
     * this is the type the *server* resolved from the file extension, not file.type,
     * which browsers report inconsistently for .mkv and Office formats.
     */
    xhr.setRequestHeader('Content-Type', plan.contentType);

    // Deliberately not sent: this is a third-party origin, and the session cookie has no
    // business there. The presigned URL carries its own, narrower authorisation.
    xhr.withCredentials = false;

    sendWithProgress(
      xhr,
      file,
      (percent) => onProgress(Math.min(percent, DIRECT_UPLOAD_PROGRESS_CEILING)),
      signal,
      () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new ApiError(`Storage rejected the upload (${xhr.status})`, xhr.status));
        }
      },
      reject,
    );
  });
}

/**
 * The original multipart upload, used whenever storage cannot issue presigned URLs.
 * Unchanged in behaviour: one file per request, per-file progress, itemised failures.
 */
function uploadThroughApi(
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
    if (extras.uploadType) formData.append('uploadType', extras.uploadType);
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
