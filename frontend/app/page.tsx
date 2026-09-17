import Link from 'next/link';
import { ShieldCheck, Lock, FolderClosed } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="app-viewport-min-h flex flex-col items-center justify-center bg-background px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-accent">
        <Lock className="h-7 w-7" />
      </div>
      <h1 className="mt-6 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">media_tool</h1>
      <p className="mt-3 max-w-md text-balance text-sm text-muted sm:text-base">
        A private personal library for photos, videos and documents. Nothing here is public — sign in to
        continue.
      </p>

      <Link
        href="/admin"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-medium text-accent-foreground shadow-sm transition hover:bg-accent-hover"
      >
        <ShieldCheck className="h-4 w-4" />
        Go to Admin
      </Link>

      <div className="mt-14 flex items-center gap-2 text-xs text-muted">
        <FolderClosed className="h-3.5 w-3.5" />
        <span>Private &middot; Self-hosted &middot; Not indexed</span>
      </div>
    </main>
  );
}
