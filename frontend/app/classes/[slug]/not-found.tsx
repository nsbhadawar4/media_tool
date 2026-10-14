import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { MarketingShell } from '@/components/marketing/MarketingShell';

/** /classes/<unknown or switched-off class>: a clear way back instead of a bare 404. */
export default function ClassNotFound() {
  return (
    <MarketingShell>
      <main className="flex min-h-[60vh] items-center justify-center px-4 py-20">
        <div className="max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
          <SearchX aria-hidden className="mx-auto h-8 w-8 text-muted" />
          <h1 className="mt-3 text-xl font-semibold text-foreground">Class not found</h1>
          <p className="mt-2 text-sm text-muted">This class doesn&apos;t exist or isn&apos;t available right now.</p>
          <Link href="/#kid-games" className="btn-primary mt-6 inline-flex h-11 items-center rounded-xl px-5 text-sm font-semibold text-accent-foreground">
            See all classes
          </Link>
        </div>
      </main>
    </MarketingShell>
  );
}
