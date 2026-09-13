'use client';

import { CheckCircle2, ChevronDown, FileWarning, Loader2, Upload, X } from 'lucide-react';
import { useState } from 'react';
import { ProgressBar } from '@/components/ui/Badge';
import type { UploadQueue } from '@/hooks/useUploadQueue';

export function UploadProgressPanel({ queue }: { queue: UploadQueue }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { items, dismiss, clearCompleted } = queue;

  if (items.length === 0) return null;

  const uploadingCount = items.filter((i) => i.status === 'uploading').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;

  return (
    <div className="animate-slide-up fixed bottom-4 left-4 z-50 w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:bottom-6 sm:left-6">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        {uploadingCount > 0 ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
        ) : (
          <Upload className="h-4 w-4 shrink-0 text-muted" />
        )}
        <p className="flex-1 text-sm font-medium text-foreground">
          {uploadingCount > 0
            ? `Uploading ${uploadingCount} file${uploadingCount === 1 ? '' : 's'}…`
            : `${doneCount} uploaded${errorCount > 0 ? `, ${errorCount} failed` : ''}`}
        </p>
        <button
          type="button"
          onClick={() => setIsCollapsed((v) => !v)}
          className="rounded-lg p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
          aria-label={isCollapsed ? 'Expand' : 'Collapse'}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`} />
        </button>
        {uploadingCount === 0 && (
          <button
            type="button"
            onClick={clearCompleted}
            className="rounded-lg p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
            aria-label="Clear all"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="max-h-64 overflow-y-auto px-4 py-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 py-2">
              <div className="shrink-0">
                {item.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-accent" />}
                {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" />}
                {item.status === 'error' && <FileWarning className="h-4 w-4 text-danger" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{item.fileName}</p>
                {item.status === 'uploading' && (
                  <div className="mt-1">
                    <ProgressBar value={item.progress} />
                  </div>
                )}
                {item.status === 'error' && <p className="mt-0.5 truncate text-[11px] text-danger">{item.error}</p>}
              </div>
              {item.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={() => dismiss(item.id)}
                  className="shrink-0 rounded p-0.5 text-muted transition hover:text-foreground"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
