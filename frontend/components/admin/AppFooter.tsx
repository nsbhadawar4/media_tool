import Link from 'next/link';
import { HardDrive, KeyRound } from 'lucide-react';

/**
 * Account links at the foot of every page in the user application. Links only: each page
 * checks the session for itself (/manage-storage needs one; /forgot-password is the public
 * recovery flow), so showing or hiding them here grants nothing.
 */
const LINKS = [
  { href: '/manage-storage', label: 'Manage Storage', icon: HardDrive },
  { href: '/forgot-password', label: 'Reset Password', icon: KeyRound },
] as const;

export function AppFooter() {
  return (
    <footer className="mt-12 flex flex-col gap-3 border-t border-border pb-2 pt-5 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
      <p>© {new Date().getFullYear()} media_tool</p>
      <nav aria-label="Account">
        <ul className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-foreground-soft transition hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
