'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin';
import { useToast } from '@/lib/toast/ToastContext';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

/** "Suspended" is the admin panel's word for an account with isActive=false. */
export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Suspended</Badge>;
}

interface StatusTarget {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
}

/**
 * Suspend / activate with a confirmation step. The server is what enforces a suspension — it
 * refuses the account on every request, ends its sessions and blocks sign-in — so on success
 * every ['admin', …] query is refreshed rather than patching one row locally.
 *
 * Returns `request(user)` to open the dialog, and the dialog element to render.
 */
export function useUserStatusAction() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<StatusTarget | null>(null);

  const mutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => adminApi.setStatus(id, isActive),
    onSuccess: (_result, { isActive }) => {
      toast.success(isActive ? 'Account activated' : 'Account suspended');
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      setTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const suspending = target?.isActive ?? false;
  const dialog = (
    <ConfirmDialog
      isOpen={target !== null}
      onClose={() => !mutation.isPending && setTarget(null)}
      title={suspending ? `Suspend ${target?.name}?` : `Activate ${target?.name}?`}
      description={
        suspending
          ? `${target?.email} will be signed out on every device immediately and won't be able to sign in. Their files, folders and reviews are kept, and you can activate the account again at any time.`
          : `${target?.email} will be able to sign in again. Sessions that were open before the suspension stay signed out, so they will need to sign in afresh.`
      }
      confirmLabel={suspending ? 'Suspend account' : 'Activate account'}
      isDangerous={suspending}
      isLoading={mutation.isPending}
      onConfirm={() => target && mutation.mutate({ id: target.id, isActive: !target.isActive })}
    />
  );

  return { request: setTarget, dialog, isPending: mutation.isPending };
}
