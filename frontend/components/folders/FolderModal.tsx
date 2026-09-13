'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input, Label, Textarea } from '@/components/ui/Input';
import type { Folder } from '@/types/api';

interface FolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description?: string }) => Promise<void>;
  folder?: Folder | null;
}

/**
 * Handles both create and edit — pass `folder` to edit, omit it to create a new one.
 * The caller renders this keyed to the open/close transition (e.g. `key={isOpen}` or an
 * id that changes per item), so form fields naturally re-initialize from props on every
 * open instead of needing an effect to reset them.
 */
export function FolderModal({ isOpen, onClose, onSubmit, folder }: FolderModalProps) {
  const [name, setName] = useState(folder?.name ?? '');
  const [description, setDescription] = useState(folder?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Folder name is required');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await onSubmit({ name: trimmed, description: description.trim() || undefined });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={folder ? 'Edit folder' : 'New folder'} size="sm">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="folder-name">Name</Label>
          <Input
            id="folder-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Wedding"
            maxLength={255}
          />
        </div>
        <div>
          <Label htmlFor="folder-description">Description (optional)</Label>
          <Textarea
            id="folder-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add a short note about what's in here"
            maxLength={2000}
          />
        </div>
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex gap-3">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" className="flex-1" isLoading={isSubmitting}>
            {folder ? 'Save changes' : 'Create folder'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
