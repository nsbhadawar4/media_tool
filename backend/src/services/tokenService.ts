import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { MediaTokenPayload, SessionTokenPayload, UploadTokenPayload } from '../types/jwt';

export function signSessionToken(payload: SessionTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN } as SignOptions);
}

export function verifySessionToken(token: string): SessionTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as SessionTokenPayload;
}

export function signMediaToken(payload: Omit<MediaTokenPayload, 'purpose'>): string {
  return jwt.sign({ ...payload, purpose: 'media-access' }, env.JWT_SECRET, {
    expiresIn: env.MEDIA_TOKEN_EXPIRES_IN,
  } as SignOptions);
}

export function verifyMediaToken(token: string): MediaTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as MediaTokenPayload;
  if (decoded.purpose !== 'media-access') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}

export function signUploadToken(payload: Omit<UploadTokenPayload, 'purpose'>): string {
  return jwt.sign({ ...payload, purpose: 'media-upload' }, env.JWT_SECRET, {
    expiresIn: env.UPLOAD_TOKEN_EXPIRES_IN,
  } as SignOptions);
}

/**
 * The purpose check is the point of this function. Every token here is signed with the
 * same secret, so without it a session cookie would be a structurally valid upload token
 * (and vice versa) — a signature check alone proves only that *we* minted the token, not
 * that we minted it for this.
 */
export function verifyUploadToken(token: string): UploadTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET) as UploadTokenPayload;
  if (decoded.purpose !== 'media-upload') {
    throw new Error('Invalid token purpose');
  }
  return decoded;
}
