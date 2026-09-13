'use client';

import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  isDangerous?: boolean;
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  isDangerous = true,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="sm" hideCloseButton>
      <div className="flex flex-col items-center text-center">
        <div
          className={
            isDangerous
              ? 'flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger'
              : 'flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent'
          }
        >
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-1.5 text-sm text-muted">{description}</p>
      </div>

      <div className="mt-6 flex gap-3">
        <Button variant="secondary" className="flex-1" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant={isDangerous ? 'danger' : 'primary'}
          className="flex-1"
          onClick={onConfirm}
          isLoading={isLoading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
