'use client';

import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { acceptFor, type UploadCategory } from '@/utils/uploadAccept';
import { cn } from '@/utils/cn';

interface UploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  uploadCategory?: UploadCategory;
  title?: string;
  hint?: string;
  className?: string;
}

/**
 * A drop target that is also a button: click it to open the file picker, or drag files over
 * it. Dropping is handled by the page's own drop handler (the event bubbles up to it) — the
 * zone only reacts visually, so a file can never be uploaded twice.
 */
export function UploadZone({
  onFilesSelected,
  uploadCategory,
  title = 'Drag & drop files here',
  hint = 'or click to browse',
  className,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={() => setIsOver(true)}
        onDragLeave={() => setIsOver(false)}
        onDrop={() => setIsOver(false)}
        className={cn(
          'group flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all duration-300',
          isOver
            ? 'scale-[1.02] border-accent bg-accent/10 zone-glow'
            : 'border-border-strong bg-surface/60 hover:border-accent/60 hover:bg-accent/5',
          className,
        )}
      >
        <span
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-xl border transition-all duration-300',
            isOver
              ? '-translate-y-1.5 border-accent/50 bg-accent/20 text-accent-2'
              : 'border-border-strong bg-surface-elevated text-accent group-hover:-translate-y-1',
          )}
        >
          <UploadCloud className={cn('h-6 w-6', isOver && 'animate-bounce')} />
        </span>
        <span className="text-sm font-semibold text-foreground">{isOver ? 'Release to upload' : title}</span>
        <span className="text-xs text-muted">{hint}</span>
      </button>
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
