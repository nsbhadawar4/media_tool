'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, LibraryBig, ShieldCheck } from 'lucide-react';
import { adminCrumbs, userCrumbs } from '@/lib/admin/breadcrumbs';

/**
 * Where you are, in the top bar — the admin panel's trail or the library's, each from its own
 * routes. The last crumb is the current page (not a link); the rest go back up. Shown from `lg`
 * up: on a phone the page title says the same.
 */
export function AdminBreadcrumbs({ area = 'admin' }: { area?: 'admin' | 'user' }) {
  const pathname = usePathname();
  const crumbs = area === 'admin' ? adminCrumbs(pathname) : userCrumbs(pathname);
  const RootIcon = area === 'admin' ? ShieldCheck : LibraryBig;
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={area === 'admin' ? 'hidden min-w-0 flex-1 items-center lg:flex' : 'hidden min-w-0 shrink items-center lg:flex'}>
      <ol className="flex min-w-0 items-center gap-1 text-[13px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={crumb.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden />}
              {last ? (
                <span aria-current="page" className="truncate rounded-md px-1.5 py-1 font-semibold text-foreground">
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-muted transition-colors hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {i === 0 && <RootIcon className="h-3.5 w-3.5 text-accent-2" aria-hidden />}
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
