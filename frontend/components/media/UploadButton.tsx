'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { acceptFor } from '@/utils/uploadAccept';
import type { FileType } from '@/types/api';

interface UploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  variant?: 'primary' | 'secondary';
  label?: string;
  /**
   * Narrows the file picker to one kind of file. It is a convenience only — the dialog's
   * "All files" option ignores it — so the caller still filters what comes back.
   */
  fileType?: FileType;
}

export function UploadButton({
  onFilesSelected,
  variant = 'primary',
  label = 'Upload',
  fileType,
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
        accept={acceptFor(fileType)}
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
