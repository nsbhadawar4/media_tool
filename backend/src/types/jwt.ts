import type { UserRole } from '../models/User';
import type { FileType } from '../config/constants';

export interface SessionTokenPayload {
  sub: string; // user id
  role: UserRole;
  email: string;
  name: string;
}

export interface MediaTokenPayload {
  sub: string; // user id, so tokens can't be replayed by a different session
  mediaId: string;
  purpose: 'media-access';
}

/** Scoped to a specific set of media ids chosen at request time — used only for bulk ZIP downloads. */
export interface BulkDownloadTokenPayload {
  sub: string;
  ids: string[];
  purpose: 'bulk-download';
}

/**
 * Issued by the presign endpoint, presented back by the commit endpoint.
 *
 * Without it, commit would have to take a storage key straight from the client, and
 * nothing would stop someone committing a key they never uploaded — including one
 * belonging to another account, which would attach that file to their own library. The
 * token binds the key to the account that asked for it, along with everything the server
 * already decided about the file, so commit can trust all of it without re-deriving any.
 */
export interface UploadTokenPayload {
  sub: string; // user id the presigned URL was minted for
  key: string; // exact storage key the URL grants a PUT to
  storedName: string;
  originalName: string;
  mimeType: string;
  fileType: FileType;
  folderId: string | null;
  /** Byte ceiling accepted for this upload; the real size is verified against it at commit. */
  maxSize: number;
  purpose: 'media-upload';
}
