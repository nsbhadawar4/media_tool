import {
  FileText,
  FileSpreadsheet,
  FileType2,
  File as FileGeneric,
  Image as ImageIcon,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { FileType } from '@/types/api';

/** Chooses a Lucide icon for a document based on its mimetype, falling back sensibly. */
export function iconForDocument(mimeType: string): LucideIcon {
  if (mimeType === 'application/pdf') return FileType2;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('word') || mimeType === 'text/plain') return FileText;
  return FileGeneric;
}

export function iconForFileType(fileType: FileType, mimeType: string): LucideIcon {
  if (fileType === 'image') return ImageIcon;
  if (fileType === 'video') return Video;
  return iconForDocument(mimeType);
}

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx >= 0 ? fileName.slice(idx + 1).toUpperCase() : '';
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'mov', 'webm', 'mkv']);

/**
 * Best-effort local classification of a not-yet-uploaded File, used only to pick an icon
 * for the upload queue before the server has confirmed anything. Some browsers report an
 * empty or generic `type` for formats like HEIC, so this falls back to the extension.
 */
export function guessFileTypeFromFile(file: { name: string; type: string }): FileType {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (
    file.type === 'application/pdf' ||
    file.type.includes('word') ||
    file.type.includes('excel') ||
    file.type.includes('spreadsheet') ||
    file.type === 'text/plain'
  ) {
    return 'document';
  }

  const ext = extensionOf(file.name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return 'document';
}
