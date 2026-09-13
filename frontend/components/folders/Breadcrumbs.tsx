import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';
import type { Breadcrumb } from '@/types/api';

export function Breadcrumbs({ items, currentName }: { items: Breadcrumb[]; currentName?: string }) {
  return (
    <nav className="mb-4 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-sm text-muted">
      <Link href="/admin/folders" className="flex items-center gap-1 rounded-lg px-1.5 py-1 transition hover:bg-surface-hover hover:text-foreground">
        <Home className="h-3.5 w-3.5" />
        Folders
      </Link>
      {items.map((item) => (
        <span key={item.id} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <Link href={`/admin/folders/${item.id}`} className="rounded-lg px-1.5 py-1 transition hover:bg-surface-hover hover:text-foreground">
            {item.name}
          </Link>
        </span>
      ))}
      {currentName && (
        <span className="flex items-center gap-1.5 text-foreground">
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="px-1.5 py-1 font-medium">{currentName}</span>
        </span>
      )}
    </nav>
  );
}
