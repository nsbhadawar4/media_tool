import { env } from '../config/env';
import { signMediaToken } from '../services/tokenService';
import type { IMedia } from '../models/Media';

export interface MediaUrls {
  viewUrl: string;
  downloadUrl: string;
  /** Null when no thumbnail could be derived — the client then falls back to viewUrl or a placeholder. */
  thumbnailUrl: string | null;
}

/** Mints a fresh, short-lived signed token per response so <img>/<video>/download links work without exposing raw storage keys. */
export function buildMediaUrls(media: Pick<IMedia, '_id' | 'thumbnailKey'>, adminId: string): MediaUrls {
  const token = signMediaToken({ sub: adminId, mediaId: media._id.toString() });
  const base = `${env.API_BASE_URL.replace(/\/$/, '')}/api/media/${media._id.toString()}`;
  return {
    viewUrl: `${base}/raw?token=${token}`,
    downloadUrl: `${base}/download?token=${token}`,
    thumbnailUrl: media.thumbnailKey ? `${base}/thumb?token=${token}` : null,
  };
}

export function serializeMedia(media: IMedia, adminId: string) {
  const urls = buildMediaUrls(media, adminId);
  return {
    id: media._id,
    folderId: media.folderId,
    originalName: media.originalName,
    mimeType: media.mimeType,
    fileType: media.fileType,
    size: media.size,
    width: media.width,
    height: media.height,
    duration: media.duration,
    isDeleted: media.isDeleted,
    deletedAt: media.deletedAt,
    createdAt: media.createdAt,
    updatedAt: media.updatedAt,
    ...urls,
  };
}
