import type { Metadata } from 'next';
import { siteMetadataBase } from '@/lib/site';
import Link from 'next/link';
import { LegalPage } from '@/components/marketing/MarketingShell';
import { LEGAL_LAST_UPDATED } from '@/components/marketing/legal';

const METADATA: Metadata = {
  title: 'Privacy — media_tool',
  description: 'What media_tool stores about you, who can see it, and how to remove it.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/privacy' },
};

/** Static metadata plus an absolute base for its URLs — see siteMetadataBase in lib/site.ts. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...METADATA, metadataBase: await siteMetadataBase() };
}

/**
 * Describes what the application actually stores and shows — kept in step with the code
 * (User, Media, ActivityLog models; the session cookie; theme preference in localStorage).
 */
export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Legal" title="Privacy" updated={LEGAL_LAST_UPDATED} informational>
      <p>
        This page explains, in plain language, what media_tool stores when you use it and who can see it. media_tool is a
        private library: what you upload is yours and is shown only to you.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address, an optional mobile number and an optional profile photo.</li>
        <li><strong>Your password</strong> — only as a one-way hash. Nobody, including administrators, can read it.</li>
        <li><strong>Your files:</strong> the photos, videos and documents you upload, their names, sizes and the folders you put them in.</li>
        <li><strong>Game progress:</strong> Kid Games scores, stars, XP, streaks and achievements, so progress carries across devices.</li>
        <li><strong>Reviews</strong> you choose to submit.</li>
        <li>
          <strong>An activity log</strong> of account events — such as signing in, uploading, renaming or deleting — with the time,
          your IP address and your browser’s user agent. It helps keep accounts secure and lets you see your own history.
        </li>
      </ul>

      <h2>Cookies and local storage</h2>
      <p>
        media_tool sets a single cookie: an HTTP-only session cookie that keeps you signed in. It is not readable by scripts and is
        not used for advertising or tracking. When you log out, a record of that session (not the cookie itself) is kept only
        until the session would have expired, so it can’t be reused. Your theme and a few display preferences are saved in your browser’s local storage
        and never leave your device.
      </p>

      <h2>Who can see your data</h2>
      <ul>
        <li><strong>You</strong> can see everything in your library.</li>
        <li>
          <strong>Administrators</strong> of this installation can see your account details, how many files you hold and how much
          space they use, your activity log, and any review you submit. They cannot browse or open your files.
        </li>
        <li>
          <strong>The public</strong> sees nothing of yours, except a review you submit once an administrator has approved and
          published it — shown with your first name and last initial only (for example, “Priya S.”).
        </li>
      </ul>
      <p>Files are delivered through short-lived signed links, never through public addresses.</p>

      <h2>Email</h2>
      <p>We email you only to send a password-reset code when you ask for one.</p>

      <h2>Deleting your data</h2>
      <p>
        Files and folders you delete go to Trash and are removed permanently when you delete them from Trash. To have your account
        closed, <Link href="/contact">get in touch</Link>.
      </p>

      <h2>Questions</h2>
      <p>
        If anything here is unclear, please <Link href="/contact">contact us</Link>.
      </p>
    </LegalPage>
  );
}
