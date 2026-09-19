import {
  FileArchive,
  FileText,
  FileSpreadsheet,
  FileType2,
  File as FileGeneric,
  Image as ImageIcon,
  Music,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type { FileType } from '@/types/api';

/**
 * Audio and archives are not in the server's upload allow-list today (see
 * backend/src/config/constants.ts), so nothing in the library currently matches these. They
 * are mapped anyway so the icon vocabulary is complete the day that list grows: without
 * them a .mp3 would land on the blank generic-file mark, which says nothing.
 */
const ARCHIVE_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/x-rar-compressed',
  'application/vnd.rar',
  'application/x-7z-compressed',
  'application/x-tar',
  'application/gzip',
]);

/** Chooses a Lucide icon for a document based on its mimetype, falling back sensibly. */
export function iconForDocument(mimeType: string): LucideIcon {
  if (mimeType === 'application/pdf') return FileType2;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('word') || mimeType === 'text/plain') return FileText;
  if (mimeType.startsWith('audio/')) return Music;
  if (ARCHIVE_MIME_TYPES.has(mimeType)) return FileArchive;
  return FileGeneric;
}

export interface DocumentTone {
  /** Background + text for a badge that encloses the icon. */
  badge: string;
  /** Text colour alone, for places too small to carry a badge. */
  icon: string;
}

/**
 * Colour for a document by type. Follows the convention people already recognise from
 * every file manager — red for PDF, green for spreadsheets, blue for Word — so the kind
 * of file reads at a glance. Colour is never the only signal: the extension is spelled
 * out alongside it, since not everyone can tell these hues apart.
 */
export function toneForDocument(mimeType: string): DocumentTone {
  if (mimeType === 'application/pdf') {
    return { badge: 'bg-red-500/12 text-red-500 dark:text-red-400', icon: 'text-red-500 dark:text-red-400' };
  }
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return {
      badge: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
      icon: 'text-emerald-600 dark:text-emerald-400',
    };
  }
  if (mimeType.includes('word')) {
    return { badge: 'bg-blue-500/12 text-blue-500 dark:text-blue-400', icon: 'text-blue-500 dark:text-blue-400' };
  }
  if (mimeType === 'text/plain') {
    return {
      badge: 'bg-slate-500/12 text-slate-500 dark:text-slate-300',
      icon: 'text-slate-500 dark:text-slate-300',
    };
  }
  if (mimeType.startsWith('audio/')) {
    return {
      badge: 'bg-violet-500/12 text-violet-500 dark:text-violet-400',
      icon: 'text-violet-500 dark:text-violet-400',
    };
  }
  if (ARCHIVE_MIME_TYPES.has(mimeType)) {
    return {
      badge: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
      icon: 'text-amber-600 dark:text-amber-400',
    };
  }
  return { badge: 'bg-surface text-muted', icon: 'text-muted' };
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
