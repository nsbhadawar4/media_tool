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
