/**
 * Downloads several files by triggering them one at a time.
 *
 * There is no server-side archive endpoint, so this is the practical option: each file's
 * download URL already responds with `Content-Disposition: attachment`, which makes the
 * browser save it instead of navigating, even cross-origin. Requests are spaced out
 * because browsers drop downloads fired in a tight loop — expect a one-time "allow
 * multiple downloads?" prompt on the first bulk download per site.
 */

/** Spacing between triggers. Short enough to feel immediate, long enough that none are dropped. */
const DOWNLOAD_INTERVAL_MS = 600;

export interface BulkDownloadFile {
  url: string;
  name: string;
}

export interface BulkDownloadOptions {
  onProgress?: (completed: number, total: number) => void;
  signal?: AbortSignal;
}

function triggerDownload(file: BulkDownloadFile): void {
  const anchor = document.createElement('a');
  anchor.href = file.url;
  // Honoured only for same-origin URLs; cross-origin relies on Content-Disposition,
  // which the API sets. Harmless either way.
  anchor.download = file.name;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** Resolves with the number of downloads actually started. */
export async function downloadFilesSequentially(
  files: BulkDownloadFile[],
  { onProgress, signal }: BulkDownloadOptions = {},
): Promise<number> {
  let started = 0;

  for (const file of files) {
    if (signal?.aborted) break;

    triggerDownload(file);
    started += 1;
    onProgress?.(started, files.length);

    if (started < files.length) {
      await new Promise((resolve) => setTimeout(resolve, DOWNLOAD_INTERVAL_MS));
    }
  }

  return started;
}
