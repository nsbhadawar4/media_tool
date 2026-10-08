'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SearchX } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { CatalogManager } from '@/components/admin/content/CatalogManager';
import { SectionManager } from '@/components/admin/content/SectionManager';
import { contentTypeBySlug } from '@/components/admin/content/contentTypes';

/** /admin/content/{sections,classes,subjects,kid-games,games}: one kind of catalog entry. */
export default function AdminContentTypePage() {
  const { type } = useParams<{ type: string }>();
  const info = contentTypeBySlug(type);
  if (!info) {
    return (
      <EmptyState
        icon={SearchX}
        title="No such content section"
        action={
          <Link href="/admin/content" className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
            Back to Content
          </Link>
        }
      />
    );
  }
  // Website sections have one ON/OFF state, an order and an owner of the last change.
  if (info.type === 'section') return <SectionManager info={info} />;
  // Keyed: switching sections starts from fresh filters.
  return <CatalogManager key={info.type} info={info} />;
}
