'use client';

import { LifecycleManager } from '@/components/admin/lifecycle/LifecycleManager';

/** /admin/archive — Archive: content that was intentionally archived, to restore or move to Trash. */
export default function AdminArchivePage() {
  return <LifecycleManager bin="archive" />;
}
