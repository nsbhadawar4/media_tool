'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, RotateCcw, Upload, Video, X } from 'lucide-react';
import { ProgressBar } from '@/components/ui/Badge';
import { iconForDocument } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/format';
import type { UploadQueue, UploadQueueItem } from '@/hooks/useUploadQueue';

/** Image files get a real thumbnail (via an object URL); everything else gets a type icon. */
function UploadThumb({ item }: { item: UploadQueueItem }) {
  const isImage = item.mimeType.startsWith('image/');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    // Creating/revoking a browser object URL is exactly the kind of external-system
    // side effect useEffect is for; the resulting URL only exists after this runs.
    if (!isImage) return;
    const url = URL.createObjectURL(item.file);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [isImage, item.file]);

  if (isImage && objectUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={objectUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
    );
  }

  const DocIcon = iconForDocument(item.mimeType);
  const Icon = item.mimeType.startsWith('video/') ? Video : DocIcon;
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-hover text-muted">
      {/* Icon is one of a fixed set of stable Lucide components, not created per render. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Icon className="h-4 w-4" />
    </div>
  );
}

export function UploadProgressPanel({ queue }: { queue: UploadQueue }) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { items, cancel, retry, dismiss, clearCompleted } = queue;

  if (items.length === 0) return null;

  const uploadingCount = items.filter((i) => i.status === 'uploading').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error' || i.status === 'cancelled').length;

  return (
    <div className="animate-slide-up fixed bottom-4 left-4 z-50 w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl sm:bottom-6 sm:left-6">
      <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
        <Upload className="h-4 w-4 shrink-0 text-muted" />
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
        <div className="max-h-80 overflow-y-auto px-4 py-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2.5">
              <UploadThumb item={item} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">{item.fileName}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {formatBytes(item.fileSize)}
                  {item.status === 'uploading' && ` · ${item.progress}%`}
                </p>
                {item.status === 'uploading' && (
                  <div className="mt-1.5">
                    <ProgressBar value={item.progress} />
                  </div>
                )}
                {item.status === 'error' && <p className="mt-0.5 truncate text-[11px] text-danger">{item.error}</p>}
                {item.status === 'cancelled' && <p className="mt-0.5 text-[11px] text-muted">Cancelled</p>}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {item.status === 'uploading' && (
                  <button
                    type="button"
                    onClick={() => cancel(item.id)}
                    className="rounded p-1 text-muted transition hover:bg-surface-hover hover:text-danger"
                    aria-label="Cancel upload"
                    title="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                {item.status === 'done' && <CheckCircle2 className="h-4 w-4 text-success" />}
                {(item.status === 'error' || item.status === 'cancelled') && (
                  <>
                    <button
                      type="button"
                      onClick={() => retry(item.id)}
                      className="rounded p-1 text-muted transition hover:bg-surface-hover hover:text-accent"
                      aria-label="Retry upload"
                      title="Retry"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => dismiss(item.id)}
                      className="rounded p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
                      aria-label="Remove from queue"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                {item.status === 'done' && (
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    className="rounded p-1 text-muted transition hover:bg-surface-hover hover:text-foreground"
                    aria-label="Remove from queue"
                    title="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
