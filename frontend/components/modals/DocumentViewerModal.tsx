'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, Maximize2, X } from 'lucide-react';
import { iconForDocument } from '@/utils/fileIcons';
import { formatBytes } from '@/utils/format';
import type { Media } from '@/types/api';

/** Beyond this, a text file is streamed to disk rather than pulled into the DOM. */
const MAX_INLINE_TEXT_BYTES = 2 * 1024 * 1024;

type Renderable = 'pdf' | 'text' | 'none';

/** Decides how — or whether — this document can be shown without leaving the app. */
function renderableAs(media: Media): Renderable {
  if (media.mimeType === 'application/pdf') return 'pdf';
  // Office formats need a converter the app doesn't have; only plain text renders directly.
  if (media.mimeType === 'text/plain' && media.size <= MAX_INLINE_TEXT_BYTES) return 'text';
  return 'none';
}

export function DocumentViewerModal({ media, onClose }: { media: Media; onClose: () => void }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const mode = renderableAs(media);

  return createPortal(
    <div className="app-safe-bottom animate-fade-in fixed inset-0 z-60 flex flex-col bg-black/85">
      <header className="flex items-center justify-between gap-4 px-4 py-3 text-white sm:px-6">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{media.originalName}</p>
          <p className="text-xs text-white/60">{formatBytes(media.size)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => window.open(media.viewUrl, '_blank')}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Open in a new tab"
            title="Open in a new tab"
          >
            <Maximize2 className="h-4.5 w-4.5" />
          </button>
          <a
            href={media.downloadUrl}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Download"
          >
            <Download className="h-4.5 w-4.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-white/80 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
        {mode === 'pdf' && (
          <iframe
            src={media.viewUrl}
            title={media.originalName}
            className="h-full w-full max-w-5xl rounded-lg bg-white"
          />
        )}
        {mode === 'text' && <TextPreview media={media} />}
        {mode === 'none' && <UnsupportedPreview media={media} />}
      </div>
    </div>,
    document.body,
  );
}

/** Fetches a plain-text file and shows it, so .txt files don't force a download to read. */
function TextPreview({ media }: { media: Media }) {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'error'; content: string }>({
    status: 'loading',
    content: '',
  });

  useEffect(() => {
    const controller = new AbortController();

    fetch(media.viewUrl, { credentials: 'include', signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.text();
      })
      .then((content) => setState({ status: 'ready', content }))
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setState({ status: 'error', content: '' });
      });

    return () => controller.abort();
  }, [media.viewUrl]);

  if (state.status === 'error') return <UnsupportedPreview media={media} />;

  return (
    <div className="h-full w-full max-w-4xl overflow-auto rounded-lg border border-border bg-surface p-5">
      {state.status === 'loading' ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-3 animate-pulse rounded bg-surface-hover" style={{ width: `${90 - index * 8}%` }} />
          ))}
        </div>
      ) : (
        <pre className="whitespace-pre-wrap wrap-break-word font-mono text-xs leading-relaxed text-foreground">
          {state.content}
        </pre>
      )}
    </div>
  );
}

/** Fallback card for formats the browser can't render — Word, Excel, oversized text. */
function UnsupportedPreview({ media }: { media: Media }) {
  const Icon = iconForDocument(media.mimeType);

  return (
    <div className="flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-surface px-10 py-12 text-center">
      {/* Icon comes from a fixed set of stable Lucide components, not created per render. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Icon className="h-14 w-14 text-muted" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-foreground">{media.originalName}</p>
        <p className="mt-1 text-xs text-muted">{formatBytes(media.size)}</p>
        <p className="mt-3 text-xs text-muted">
          This file type can&apos;t be previewed in the browser. Download it to open in its own app.
        </p>
      </div>
      <a
        href={media.downloadUrl}
        className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition hover:bg-accent-hover"
      >
        <Download className="h-4 w-4" />
        Download
      </a>
    </div>
  );
}
