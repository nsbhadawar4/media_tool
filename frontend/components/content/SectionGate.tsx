import type { ReactNode } from 'react';
import Link from 'next/link';
import { PowerOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { isSectionOn } from '@/lib/content/sections';
import { USER_HOME_PATH } from '@/lib/auth/routes';

/**
 * Closes an app area whose website section an administrator switched off — Games, or Kid Games
 * with its courses — on the server, so a direct link can't open it either. What the area saves is
 * refused by the API on its own (see isSectionOn in the backend's contentService).
 */
export async function SectionGate({ section, name, children }: { section: string; name: string; children: ReactNode }) {
  if (isSectionOn(await getServerCatalog(), section)) return children;
  return (
    <EmptyState
      icon={PowerOff}
      title="Not available right now"
      description={`${name} has been switched off for now. Please check back later.`}
      action={
        <Link href={USER_HOME_PATH} className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
          Back to dashboard
        </Link>
      }
    />
  );
}
