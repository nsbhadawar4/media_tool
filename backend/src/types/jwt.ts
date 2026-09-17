import type { UserRole } from '../models/User';

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
