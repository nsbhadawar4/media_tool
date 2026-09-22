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
  /**
   * A valid, supported file, offered where that kind of file does not belong — an image
   * through the Documents upload, a PDF through the Media upload. Distinct from
   * InvalidFileType, which means the app does not accept the file anywhere.
   */
  WrongUploadCategory: 'WRONG_UPLOAD_CATEGORY',
  /** The right kind of file, but unreadable: truncated, damaged, or half-written. */
  CorruptFile: 'CORRUPT_FILE',
  EmptyFile: 'EMPTY_FILE',
  FileTooLarge: 'FILE_TOO_LARGE',

  /** Storage refused the write. */
  StorageUploadFailed: 'STORAGE_UPLOAD_FAILED',
  /** The write reported success but what came back was not what went in. */
  StorageVerificationFailed: 'STORAGE_VERIFICATION_FAILED',
  /** The record is here; the object it names is not. */
  StorageNotFound: 'STORAGE_NOT_FOUND',
  /**
   * The record was written against a different storage backend than the one this
   * deployment runs, so its bytes were never in reach — not lost, just elsewhere.
   *
   * Its own code because it is the one failure here that is neither a fault nor a
   * corruption: a record made while STORAGE_PROVIDER was `local` names a path on one
   * machine's disk, and the same database read by a deployment running `gridfs` finds
   * nothing at that key. Reported as "missing" it sends people looking for a bug in
   * uploading; named, it points straight at the migration that fixes it.
   */
  StorageProviderMismatch: 'STORAGE_PROVIDER_MISMATCH',
  /** The bytes are stored, but the record describing them could not be written. */
  MediaRecordFailed: 'MEDIA_RECORD_FAILED',
  /** A valid image whose thumbnail could not be produced or stored. */
  PreviewGenerationFailed: 'PREVIEW_GENERATION_FAILED',
} as const;

export type UploadErrorCode = (typeof UploadErrorCode)[keyof typeof UploadErrorCode];
