/** Central place for enums/constants shared across models, validators and controllers. */

export const FILE_TYPES = ['image', 'video', 'document'] as const;
export type FileType = (typeof FILE_TYPES)[number];

export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

export const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov
  'video/webm',
  'video/x-matroska', // .mkv
] as const;

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/vnd.ms-excel', // .xls
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'text/plain',
] as const;

export const ALLOWED_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  ...VIDEO_MIME_TYPES,
  ...DOCUMENT_MIME_TYPES,
] as const;

export const EXTENSION_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
};

export function fileTypeFromMime(mime: string): FileType | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mime)) return 'image';
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(mime)) return 'video';
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) return 'document';
  return null;
}

export const ACTIVITY_ACTIONS = [
  'login',
  'login_failed',
  'logout',
  'folder_created',
  'folder_renamed',
  'folder_updated',
  'folder_deleted',
  'folder_restored',
  'folder_permanently_deleted',
  'media_uploaded',
  'media_renamed',
  'media_updated',
  'media_deleted',
  'media_restored',
  'media_permanently_deleted',
  'media_moved',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export const ACTIVITY_TARGET_TYPES = ['folder', 'media', 'auth'] as const;
export type ActivityTargetType = (typeof ACTIVITY_TARGET_TYPES)[number];
