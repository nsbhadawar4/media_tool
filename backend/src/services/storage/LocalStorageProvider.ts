import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import type {
  StorageService,
  UploadInput,
  StoredObjectMeta,
  ObjectStat,
  StreamRange,
  StreamResult,
} from './StorageProvider';

/** Storage provider for local development: writes/reads files under UPLOAD_DIR. */
export class LocalStorageProvider implements StorageService {
  readonly name = 'local' as const;
  private readonly root: string;

  constructor(root: string = env.localStorageRoot) {
    this.root = root;
  }

  private resolveKey(key: string): string {
    const normalized = path.normalize(key).replace(/^[/\\]+/, '');
    const full = path.resolve(this.root, normalized);
    // Prevent path traversal outside the storage root via a crafted key.
    if (!full.startsWith(path.resolve(this.root))) {
      throw AppError.badRequest('Invalid storage key');
    }
    return full;
  }

  async upload({ key, sourcePath }: UploadInput): Promise<StoredObjectMeta> {
    const destination = this.resolveKey(key);
    await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.rename(sourcePath, destination).catch(async (err) => {
      // rename fails across devices/drives sometimes — fall back to copy+unlink.
      if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
        await fsp.copyFile(sourcePath, destination);
        await fsp.unlink(sourcePath);
        return;
      }
      throw err;
    });
    const stat = await fsp.stat(destination);
    return { key, size: stat.size };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolveKey(key);
    await fsp.unlink(full).catch((err) => {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fsp.access(this.resolveKey(key), fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async stat(key: string): Promise<ObjectStat | null> {
    try {
      const stat = await fsp.stat(this.resolveKey(key));
      // The filesystem records no content type; callers fall back to the stored mimeType.
      return { key, size: stat.size, contentType: null };
    } catch {
      return null;
    }
  }

  async getObjectStream(key: string, range?: StreamRange): Promise<StreamResult> {
    const full = this.resolveKey(key);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(full);
    } catch {
      throw AppError.notFound('File not found in storage');
    }

    const totalSize = stat.size;
    if (range) {
      const start = Math.max(0, range.start);
      const end = Math.min(range.end, totalSize - 1);
      const stream = fs.createReadStream(full, { start, end });
      return {
        stream,
        contentLength: end - start + 1,
        contentType: 'application/octet-stream',
        range: { start, end },
        totalSize,
      };
    }

    const stream = fs.createReadStream(full);
    return { stream, contentLength: totalSize, contentType: 'application/octet-stream', totalSize };
  }

  getUrl(): string | null {
    // Local files have no direct URL — always streamed through the authenticated API.
    return null;
  }

  async getSignedUrl(): Promise<string | null> {
    // No standalone file server for local dev storage, so there's nothing to sign.
    // Private files are served exclusively through the API's own token-guarded routes.
    return null;
  }

  async getUploadUrl(): Promise<string | null> {
    // Nothing for a browser to PUT to — local uploads go through the API's multipart
    // endpoint, which is what the client falls back to when this returns null.
    return null;
  }
}
