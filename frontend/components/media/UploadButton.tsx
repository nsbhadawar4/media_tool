'use client';

import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface UploadButtonProps {
  onFilesSelected: (files: File[]) => void;
  variant?: 'primary' | 'secondary';
  label?: string;
}

const ACCEPT =
  '.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.mp4,.mov,.webm,.mkv,.pdf,.doc,.docx,.xls,.xlsx,.txt';

export function UploadButton({ onFilesSelected, variant = 'primary', label = 'Upload' }: UploadButtonProps) {
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
        accept={ACCEPT}
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
