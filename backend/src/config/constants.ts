/** Central place for enums/constants shared across models, validators and controllers. */

export const FILE_TYPES = ['image', 'video', 'document'] as const;
export type FileType = (typeof FILE_TYPES)[number];

/** Top-level storage directory per file type — mirrors backend/uploads/{images,videos,documents}. */
export const STORAGE_DIR_BY_FILE_TYPE: Record<FileType, string> = {
  image: 'images',
  video: 'videos',
  document: 'documents',
};

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

/**
 * What a particular upload is allowed to contain.
 *
 * A file type describes one file; this describes the *intent* of the request that carried
 * it, which is a separate fact the server cannot otherwise know. The Documents page and
 * the Media page post to the same endpoint, so without this the server has no way to tell
 * that a perfectly valid JPEG arrived somewhere only documents belong — and a valid file
 * in the wrong place is exactly what "documents and images are not separated" means.
 *
 * `media` is its own value rather than two requests because the Media page holds photos
 * and videos together; narrowing it to images would quietly remove video upload.
 */
export const UPLOAD_CATEGORIES = ['image', 'video', 'document', 'media'] as const;
export type UploadCategory = (typeof UPLOAD_CATEGORIES)[number];

export const FILE_TYPES_BY_UPLOAD_CATEGORY: Record<UploadCategory, readonly FileType[]> = {
  image: ['image'],
  video: ['video'],
  document: ['document'],
  media: ['image', 'video'],
};

export function fileTypeFromMime(mime: string): FileType | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mime)) return 'image';
  if ((VIDEO_MIME_TYPES as readonly string[]).includes(mime)) return 'video';
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(mime)) return 'document';
  return null;
}

export const ACTIVITY_ACTIONS = [
  'signup',
  'login',
  'login_failed',
  'logout',
  'profile_updated',
  'avatar_updated',
  'password_changed',
  'password_reset_requested',
  'password_reset',
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
  'user_activated',
  'user_deactivated',
  'user_deleted',
  'subscription_updated',
  'review_submitted',
  'review_updated',
  'review_approved',
  'review_rejected',
  'review_published',
  'review_unpublished',
  'review_deleted',
  // One-time codes: mobile signup and password reset (metadata.purpose says which).
  'otp_requested',
  'otp_resent',
  'otp_verified',
  'otp_failed',
  'email_verified',
  // First-time onboarding and plan choice.
  'onboarding_started',
  'plan_selected',
  'onboarding_completed',
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

/** Whether the event succeeded — failed sign-ins and wrong codes are the security signal. */
export const ACTIVITY_STATUSES = ['success', 'failure'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

/**
 * Groups for the admin activity filters. An action may sit in more than one (a failed sign-in is
 * both an authentication and a security event).
 */
export const ACTIVITY_CATEGORIES = {
  auth: ['login', 'login_failed', 'logout'],
  signup: ['signup', 'otp_requested', 'otp_resent', 'otp_verified', 'otp_failed', 'email_verified'],
  security: ['login_failed', 'password_changed', 'password_reset_requested', 'password_reset', 'otp_failed', 'user_deactivated'],
  account: ['profile_updated', 'avatar_updated', 'password_changed', 'user_activated', 'user_deactivated', 'user_deleted', 'email_verified'],
  onboarding: ['onboarding_started', 'plan_selected', 'onboarding_completed', 'subscription_updated'],
  content: [
    'folder_created', 'folder_renamed', 'folder_updated', 'folder_deleted', 'folder_restored', 'folder_permanently_deleted',
    'media_uploaded', 'media_renamed', 'media_updated', 'media_deleted', 'media_restored', 'media_permanently_deleted', 'media_moved',
  ],
  reviews: ['review_submitted', 'review_updated', 'review_approved', 'review_rejected', 'review_published', 'review_unpublished', 'review_deleted'],
} as const satisfies Record<string, readonly ActivityAction[]>;
export type ActivityCategory = keyof typeof ACTIVITY_CATEGORIES;
export const ACTIVITY_CATEGORY_NAMES = Object.keys(ACTIVITY_CATEGORIES) as ActivityCategory[];

export const ACTIVITY_TARGET_TYPES = ['folder', 'media', 'auth', 'user', 'review'] as const;
export type ActivityTargetType = (typeof ACTIVITY_TARGET_TYPES)[number];

/** Reviews: moderation states and what a review can be about. */
export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_CATEGORIES = ['overall', 'media', 'documents', 'games', 'performance', 'other'] as const;
export type ReviewCategory = (typeof REVIEW_CATEGORIES)[number];

export const REVIEW_TEXT_MIN = 10;
export const REVIEW_TEXT_MAX = 500;
