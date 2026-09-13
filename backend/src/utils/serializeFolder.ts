import type { IFolder } from '../models/Folder';
import type { IMedia } from '../models/Media';
import { serializeMedia } from './mediaUrls';

/**
 * Folder.coverImage is populated with the raw Media document, which has no viewUrl/downloadUrl
 * (those are minted on demand by serializeMedia, not stored). This rebuilds the folder as a
 * plain object with a properly serialized cover so <img src={folder.coverImage.viewUrl}> works.
 */
export function serializeFolder(folder: IFolder, adminId: string) {
  const plain = folder.toObject({ virtuals: false }) as Record<string, unknown> & {
    coverImage?: IMedia | null;
  };

  const cover = plain.coverImage;
  const isPopulatedMedia = Boolean(cover && typeof cover === 'object' && 'mimeType' in cover);

  return {
    ...plain,
    coverImage: isPopulatedMedia ? serializeMedia(cover as IMedia, adminId) : null,
  };
}
