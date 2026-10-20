'use client';

import { LifecycleManager } from '@/components/admin/lifecycle/LifecycleManager';

/** /admin/trash — Trash / Deleted: deleted content, to restore or delete forever. */
export default function AdminTrashPage() {
  return <LifecycleManager bin="trash" />;
}
