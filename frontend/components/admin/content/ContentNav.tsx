'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/utils/cn';
import { CONTENT_TYPES, COURSES_INFO, OVERVIEW_ICON } from './contentTypes';

const LINKS = [
  { href: '/admin/content', label: 'Overview', icon: OVERVIEW_ICON },
  ...CONTENT_TYPES.map((t) => ({ href: `/admin/content/${t.slug}`, label: t.label, icon: t.icon })),
  { href: `/admin/content/${COURSES_INFO.slug}`, label: COURSES_INFO.label, icon: COURSES_INFO.icon },
];

/** The section switcher across every content page; scrolls sideways on small screens. */
export function ContentNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Content sections" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 rounded-2xl border border-border bg-surface p-1.5">
        {LINKS.map((link) => {
          const active = link.href === '/admin/content' ? pathname === link.href : pathname === link.href || pathname.startsWith(`${link.href}/`);
          const Icon = link.icon;
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                  active ? 'bg-accent/15 text-accent' : 'text-muted hover:bg-surface-hover hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
