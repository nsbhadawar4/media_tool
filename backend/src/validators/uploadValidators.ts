import { z } from 'zod';
import { UPLOAD_CATEGORIES } from '../config/constants';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/**
 * What the browser proposes to upload. Note what is absent: there is no storage key
 * here. The server derives that itself and signs it into the upload token, so a client
 * can never nominate where its bytes land.
 */
export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1, 'A file name is required').max(255),
  // Advisory only — the extension decides the stored type (see resolveFileIdentity).
  mimeType: z.string().trim().min(1).max(255),
  size: z.coerce.number().int().nonnegative(),
  /**
   * Which upload this is, when the caller only takes one kind of file. Optional: the
   * dashboard and the folder pages take anything the library accepts, and always have.
   */
  uploadType: z.enum(UPLOAD_CATEGORIES).optional(),
  folderId: objectId.nullable().optional().default(null),
});

export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

/**
 * Sent once the browser's PUT to storage has completed. `uploadToken` carries every
 * decision the server already made about this file; the dimensions are browser-read
 * metadata that could not be measured without the bytes.
 */
export const commitUploadSchema = z.object({
  uploadToken: z.string().min(1, 'uploadToken is required'),
  // Repeated from presign so the check can run again against the real bytes. It is not a
  // second chance for the client to choose: the category only ever narrows what is
  // allowed, and the file's type is settled by reading it either way.
  uploadType: z.enum(UPLOAD_CATEGORIES).optional(),
  width: z.coerce.number().int().positive().nullable().optional(),
  height: z.coerce.number().int().positive().nullable().optional(),
  duration: z.coerce.number().positive().nullable().optional(),
});

export type CommitUploadInput = z.infer<typeof commitUploadSchema>;
