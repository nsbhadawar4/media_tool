'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { acceptFor, type UploadCategory } from '@/utils/uploadAccept';

interface UploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  variant?: 'primary' | 'secondary';
  label?: string;
  /**
   * Narrows the file picker to the kinds of file this upload takes. A convenience only —
   * the dialog's "All files" option ignores it and drag-and-drop never consults it — so
   * the caller checks the selection anyway, and the server checks the bytes.
   */
  uploadCategory?: UploadCategory;
}

export function UploadButton({
  onFilesSelected,
  variant = 'primary',
  label = 'Upload',
  uploadCategory,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button variant={variant} onClick={() => inputRef.current?.click()}>
        <Upload className="h-4 w-4" />
        {label}
      </Button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptFor(uploadCategory)}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length > 0) onFilesSelected(files);
          e.target.value = '';
        }}
      />
    </>
  );
}
