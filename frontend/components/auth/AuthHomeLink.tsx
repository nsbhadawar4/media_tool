import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * The way back to the public website from the sign-in pages. Pinned to the top-left corner,
 * so the centred form stays where it is.
 */
export function AuthHomeLink() {
  return (
    <Link
      href="/"
      className="mk-safe-top absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-muted transition hover:bg-surface-hover hover:text-foreground sm:left-6 sm:top-6"
    >
      <ArrowLeft className="h-4 w-4" />
      Back to home
    </Link>
  );
}
