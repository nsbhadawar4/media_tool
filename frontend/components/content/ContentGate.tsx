import type { ReactNode } from 'react';
import Link from 'next/link';
import { PowerOff } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { resolveCatalog, type ResolvedCatalog } from '@/lib/content/catalog';

/**
 * Closes one piece of content an administrator switched off — a single game or Kid Game — on the
 * server, before any of it is sent: a direct link gets "not available" instead of the game. The
 * client player checks again, and what a Kid Game saves is refused by the API on its own
 * (isKidGamePlayable in the backend's contentService).
 *
 * `allowed` decides from the resolved catalog; with no catalog (API unreachable) the code
 * defaults apply, as everywhere else.
 */
export async function ContentGate({
  allowed,
  name,
  back,
  children,
}: {
  allowed: (catalog: ResolvedCatalog) => boolean;
  /** What is switched off, in the user's words ("This game"). */
  name: string;
  back: { href: string; label: string };
  children: ReactNode;
}) {
  if (allowed(resolveCatalog(await getServerCatalog()))) return children;
  return (
    <div className="mx-auto w-full max-w-2xl">
      <EmptyState
        icon={PowerOff}
        title="This game is currently unavailable"
        description={`${name} has been switched off for now. Please pick another one.`}
        action={
          <Link href={back.href} className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
            {back.label}
          </Link>
        }
      />
    </div>
  );
}
