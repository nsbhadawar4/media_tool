export interface SessionTokenPayload {
  sub: string; // admin id
  email: string;
  name: string;
}

export interface MediaTokenPayload {
  sub: string; // admin id, so tokens can't be replayed by a different session type
  mediaId: string;
  purpose: 'media-access';
}
