/**
 * Machine-readable causes for a rejected upload.
 *
 * The message attached to each of these is written for whoever is looking at the upload
 * panel, and gets rewritten whenever that wording can be improved. The code is the part
 * that does not move: it is what a log line can be grouped by, what a test can assert on
 * without pinning prose, and what the client could branch on if it ever needs to treat
 * "your file is broken" differently from "our storage is broken".
 *
 * The distinction those two halves draw is the important one. Everything from
 * InvalidFileType through FileTooLarge is the caller being told their file is not
 * acceptable, and retrying it unchanged will fail again. Everything from
 * StorageUploadFailed down is this deployment failing at its job with a file that was
 * perfectly good, where retrying is exactly the right response.
 */
export const UploadErrorCode = {
  /** The extension is not one this app accepts at all. */
  InvalidFileType: 'INVALID_FILE_TYPE',
  /** Extension, reported type and actual bytes disagree — a renamed file. */
  InvalidFileContent: 'INVALID_FILE_CONTENT',
  /** The right kind of file, but unreadable: truncated, damaged, or half-written. */
  CorruptFile: 'CORRUPT_FILE',
  EmptyFile: 'EMPTY_FILE',
  FileTooLarge: 'FILE_TOO_LARGE',

  /** Storage refused the write. */
  StorageUploadFailed: 'STORAGE_UPLOAD_FAILED',
  /** The write reported success but what came back was not what went in. */
  StorageVerificationFailed: 'STORAGE_VERIFICATION_FAILED',
  /** The bytes are stored, but the record describing them could not be written. */
  MediaRecordFailed: 'MEDIA_RECORD_FAILED',
  /** A valid image whose thumbnail could not be produced or stored. */
  PreviewGenerationFailed: 'PREVIEW_GENERATION_FAILED',
} as const;

export type UploadErrorCode = (typeof UploadErrorCode)[keyof typeof UploadErrorCode];
