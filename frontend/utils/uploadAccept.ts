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

/**
 * What a particular upload is allowed to contain. Mirrors UPLOAD_CATEGORIES in
 * backend/src/config/constants.ts, which is where it is actually enforced.
 *
 * `media` covers photos and videos together, which is what the Media page holds.
 */
export type UploadCategory = 'image' | 'video' | 'document' | 'media';

const FILE_TYPES_BY_CATEGORY: Record<UploadCategory, readonly FileType[]> = {
  image: ['image'],
  video: ['video'],
  document: ['document'],
  media: ['image', 'video'],
};

function extensionsFor(category: UploadCategory): string[] {
  return FILE_TYPES_BY_CATEGORY[category].flatMap((type) => [...EXTENSIONS_BY_FILE_TYPE[type]]);
}

/** Value for an `<input type="file" accept>`; omitting the category accepts everything. */
export function acceptFor(category?: UploadCategory): string {
  return (category ? extensionsFor(category) : ALL_EXTENSIONS).join(',');
}

const HUMAN_LABEL: Record<UploadCategory, string> = {
  image: 'image',
  video: 'video',
  document: 'document',
  media: 'photo and video',
};

export function labelFor(category: UploadCategory): string {
  return HUMAN_LABEL[category];
}

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot === -1 ? '' : file.name.slice(dot).toLowerCase();
}

function typeFromExtension(file: File): FileType | null {
  const extension = extensionOf(file);
  for (const [type, extensions] of Object.entries(EXTENSIONS_BY_FILE_TYPE) as [FileType, readonly string[]][]) {
    if (extensions.includes(extension)) return type;
  }
  return null;
}

/**
 * The category a Content-Type states outright, or null when it states nothing useful.
 *
 * `application/octet-stream` is the case that matters: Windows and several browsers report
 * it for a perfectly ordinary .xlsx or .mkv, so it has to mean "no opinion" rather than
 * "not a document" — treating it as a real answer would reject files that are fine.
 */
function typeFromMime(file: File): FileType | null {
  const mime = file.type.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'text/plain' || mime === 'application/pdf' || mime.includes('officedocument')) {
    return 'document';
  }
  if (mime.startsWith('application/vnd.ms-') || mime === 'application/msword') return 'document';
  return null;
}

/**
 * What a picked file appears to be, from its extension and the type the browser reports.
 *
 * A guess, and treated as one — the server settles this by reading the bytes. Its job here
 * is to catch the ordinary case before anything is uploaded, so choosing a photo on the
 * Documents page says so at once instead of after a round trip.
 *
 * Both signals are consulted, and when both are confident and disagree the content type
 * wins: a picker reporting `image/png` for a file named `.pdf` is describing the bytes,
 * while the name is only what someone typed. The extension decides on its own whenever the
 * browser has no clear opinion, which is most of the time.
 */
function guessFileType(file: File): FileType | null {
  const fromExtension = typeFromExtension(file);
  const fromMime = typeFromMime(file);

  if (fromExtension && fromMime && fromExtension !== fromMime) return fromMime;
  return fromExtension ?? fromMime;
}

export interface BatchVerdict {
  /** True when every file in the selection belongs to this upload. */
  ok: boolean;
  /** Set when it is not — ready to show, and naming what went wrong. */
  message?: string;
}

/**
 * Accepts or refuses a whole selection, never part of one.
 *
 * Refusing the batch rather than quietly uploading the files that happen to fit is the
 * deliberate behaviour: a selection is one action, and silently dropping half of it leaves
 * someone believing files were uploaded that were not. Saying so and uploading nothing is
 * the only outcome that cannot be misread.
 *
 * Advisory only. `accept` is a hint every file dialog lets people override, drag-and-drop
 * ignores it entirely, and nothing stops a request being made directly — so the server
 * enforces the same rule against the actual bytes, and this exists to make the common case
 * immediate rather than to be relied upon.
 */
export function checkBatch(files: File[], category?: UploadCategory): BatchVerdict {
  if (!category || files.length === 0) return { ok: true };

  const allowed = FILE_TYPES_BY_CATEGORY[category];
  const offending = files.filter((file) => {
    const guess = guessFileType(file);
    // An unrecognisable file is left to the server, which can actually tell.
    return guess !== null && !allowed.includes(guess);
  });

  if (offending.length === 0) return { ok: true };

  const kinds = new Set(offending.map((file) => guessFileType(file)));

  if (category === 'document') {
    return {
      ok: false,
      message: kinds.has('image')
        ? 'Upload cancelled: Documents only. Images are not allowed.'
        : 'Upload cancelled: Documents only.',
    };
  }

  return {
    ok: false,
    message: kinds.has('document')
      ? 'Upload cancelled: Documents are not allowed here. Please upload an image.'
      : `Upload cancelled: only ${labelFor(category)} files can be uploaded here.`,
  };
}
