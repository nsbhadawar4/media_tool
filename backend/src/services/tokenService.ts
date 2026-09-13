import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { MediaTokenPayload, SessionTokenPayload } from '../types/jwt';

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
