import type { FileType } from '@/types/api';

/**
 * Which extensions belong to each kind of file. Mirrors EXTENSION_TO_MIME in
 * backend/src/config/constants.ts — the backend rejects anything outside that list, so
 * these two must agree or the picker would offer files the upload then refuses.
 */
export const EXTENSIONS_BY_FILE_TYPE: Record<FileType, readonly string[]> = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif'],
  video: ['.mp4', '.mov', '.webm', '.mkv'],
  document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt'],
};

const ALL_EXTENSIONS = [
  ...EXTENSIONS_BY_FILE_TYPE.image,
  ...EXTENSIONS_BY_FILE_TYPE.video,
  ...EXTENSIONS_BY_FILE_TYPE.document,
];

/** Value for an `<input type="file" accept>`; omitting the type accepts everything. */
export function acceptFor(fileType?: FileType): string {
  return (fileType ? EXTENSIONS_BY_FILE_TYPE[fileType] : ALL_EXTENSIONS).join(',');
}

const HUMAN_LABEL: Record<FileType, string> = {
  image: 'image',
  video: 'video',
  document: 'document',
};

export function labelFor(fileType: FileType): string {
  return HUMAN_LABEL[fileType];
}

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot).toLowerCase();
}

export interface FilterResult {
  accepted: File[];
  rejected: File[];
}

/**
 * Splits a selection by whether it belongs to `fileType`.
 *
 * The `accept` attribute is only a hint — every file dialog lets people switch to "All
 * files", and a drag-and-drop never consults it at all. So the page that only deals with
 * one kind of file has to check again here, and say so, rather than letting the upload
 * start and fail against the server.
 */
export function partitionByFileType(files: File[], fileType?: FileType): FilterResult {
  if (!fileType) return { accepted: files, rejected: [] };

  const allowed = EXTENSIONS_BY_FILE_TYPE[fileType];
  const accepted: File[] = [];
  const rejected: File[] = [];

  for (const file of files) {
    (allowed.includes(extensionOf(file)) ? accepted : rejected).push(file);
  }

  return { accepted, rejected };
}

/** "Only PDF, Word, Excel and text files can be uploaded here." */
export function rejectionMessage(fileType: FileType, rejected: File[]): string {
  const what =
    fileType === 'document'
      ? 'PDF, Word, Excel and text files'
      : fileType === 'image'
        ? 'images'
        : 'videos';

  if (rejected.length === 1) {
    return `"${rejected[0]!.name}" was skipped — only ${what} can be uploaded here.`;
  }
  return `${rejected.length} files were skipped — only ${what} can be uploaded here.`;
}
