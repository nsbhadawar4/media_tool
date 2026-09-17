'use client';

import { CheckCheck, Download, FolderInput, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatBytes } from '@/utils/format';
import type { MediaSelection } from '@/hooks/useMediaSelection';

interface BulkActionBarProps {
  selection: MediaSelection;
  onDownload: () => void;
  onMove: () => void;
  onDelete: () => void;
  /** Label for whatever bulk work is currently running, e.g. "Downloading 3/12". */
  busyLabel?: string | null;
}

/**
 * Floating bar summarising the current selection and what can be done with it. Anchored to
 * the bottom of the viewport so it stays reachable while scrolling a long gallery, and
 * offset above the upload panel's corner so the two never overlap.
 */
export function BulkActionBar({ selection, onDownload, onMove, onDelete, busyLabel }: BulkActionBarProps) {
  const { selectedCount, selectedItems, allSelected, selectAll, clear } = selection;

  if (selectedCount === 0) return null;

  const totalBytes = selectedItems.reduce((sum, item) => sum + item.size, 0);
  const isBusy = Boolean(busyLabel);

  return (
    <div className="app-safe-bottom animate-slide-up pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 sm:bottom-6">
      <div className="pointer-events-auto flex w-full max-w-2xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border bg-surface px-4 py-3 shadow-2xl">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-sm font-semibold tabular-nums text-accent">
            {selectedCount}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {selectedCount} file{selectedCount === 1 ? '' : 's'} selected
            </p>
            <p className="truncate text-xs text-muted">
              {busyLabel ?? formatBytes(totalBytes)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!allSelected && (
            <BulkButton onClick={selectAll} disabled={isBusy} icon={<CheckCheck className="h-4 w-4" />}>
              Select all
            </BulkButton>
          )}
          <BulkButton
            onClick={onDownload}
            disabled={isBusy}
            icon={isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          >
            Download
          </BulkButton>
          <BulkButton onClick={onMove} disabled={isBusy} icon={<FolderInput className="h-4 w-4" />}>
            Move
          </BulkButton>
          <BulkButton onClick={onDelete} disabled={isBusy} icon={<Trash2 className="h-4 w-4" />} danger>
            Delete
          </BulkButton>

          <button
            type="button"
            onClick={clear}
            disabled={isBusy}
            aria-label="Clear selection"
            className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface-hover hover:text-foreground disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkButton({
  onClick,
  disabled,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger/10' : 'text-foreground hover:bg-surface-hover',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{children}</span>
    </button>
  );
}
