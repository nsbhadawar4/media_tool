import type { Metadata } from 'next';
import { siteMetadataBase } from '@/lib/site';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/MarketingShell';
import { LEGAL_LAST_UPDATED } from '@/components/marketing/legal';

const METADATA: Metadata = {
  title: 'Terms — media_tool',
  description: 'The terms for using media_tool.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/terms' },
};

/** Static metadata plus an absolute base for its URLs — see siteMetadataBase in lib/site.ts. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...METADATA, metadataBase: await siteMetadataBase() };
}

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Legal" title="Terms of use" updated={LEGAL_LAST_UPDATED} informational>
      <p>
        This page sets out, in plain language, what is expected of everyone who uses media_tool and what you can expect from
        the service. Please <Link href="/contact">contact us</Link> if anything is unclear.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You need an account to use the library and games. Keep your password private — you are responsible for activity on your account.</li>
        <li>If you forget your password, you can reset it with a code sent to your email address.</li>
      </ul>

      <h2>Your content</h2>
      <ul>
        <li>We don’t claim ownership of what you upload. It is stored so that you can view, organise and download it.</li>
        <li>Only upload files you have the right to store, and nothing unlawful.</li>
        <li>Keep your own copies of anything important; deleting a file from Trash removes it permanently.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>
        Don’t try to access other people’s accounts or files, disrupt the service, or get around its limits and security. Accounts
        that break these terms may be suspended. A suspended account can’t sign in, but its files are not deleted.
      </p>

      <h2>Reviews</h2>
      <p>
        Reviews you submit are checked by an administrator before they appear publicly, and may be declined or unpublished.
      </p>

      <h2>The service</h2>
      <p>
        The Free plan is provided at no cost and as it is. Paid plans can be reserved but can’t be purchased yet; nothing is
        charged and no paid plan is activated until payment is available and completed. We aim to keep the service available
        and your data safe, but can’t promise uninterrupted service. This page may be updated; the date above shows when it
        last changed.
      </p>
    </LegalPage>
  );
}
