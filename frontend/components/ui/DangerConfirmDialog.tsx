'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input, Label } from './Input';

interface DangerConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  title: string;
  /** What exactly is about to be destroyed — state real numbers, not a generic warning. */
  consequences: ReactNode;
  /** Phrase the admin must type character-for-character. */
  confirmationPhrase: string;
  confirmLabel?: string;
  isLoading?: boolean;
}

/**
 * Confirmation for the one action in this app that cannot be undone.
 *
 * A plain "are you sure?" is dismissed reflexively, so this asks for the phrase to be
 * typed out: it cannot be satisfied by a stray Enter keypress, a double-click landing on
 * a moved dialog, or muscle memory. The confirm button stays disabled until the text
 * matches exactly, and the dialog deliberately offers no keyboard shortcut to submit.
 */
export function DangerConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  consequences,
  confirmationPhrase,
  confirmLabel = 'Delete forever',
  isLoading = false,
}: DangerConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = typed === confirmationPhrase;

  const handleClose = () => {
    setTyped('');
    setError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    // Belt and braces: the button is already disabled unless this holds.
    if (!matches) return;
    setError(null);
    try {
      await onConfirm();
      setTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="sm" hideCloseButton>
      <div className="flex flex-col items-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">{title}</h2>
      </div>

      <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-foreground">
        {consequences}
        <p className="mt-2 text-xs font-medium text-danger">
          This removes the files from storage for good. It cannot be undone, and the trash
          cannot bring them back.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div>
          <Label htmlFor="danger-confirm-input">
            Type <span className="font-semibold text-foreground">{confirmationPhrase}</span> to confirm
          </Label>
          <Input
            id="danger-confirm-input"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={typed.length > 0 && !matches}
          />
          {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
        </div>

        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={handleClose} disabled={isLoading}>
            Keep it
          </Button>
          <Button
            type="submit"
            variant="danger"
            className="flex-1 whitespace-nowrap"
            disabled={!matches}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
