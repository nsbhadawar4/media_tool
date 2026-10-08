import type { Metadata } from 'next';
import { siteMetadataBase, supportEmail } from '@/lib/site';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { KeyRound, Mail, MessageSquareHeart, UserRound } from 'lucide-react';
import { LegalPage } from '@/components/marketing/MarketingShell';
import { LOGIN_PATH } from '@/lib/auth/routes';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { isSectionOn } from '@/lib/content/sections';

const METADATA: Metadata = {
  title: 'Contact — media_tool',
  description: 'How to get help with media_tool.',
  robots: { index: true, follow: true },
  alternates: { canonical: '/contact' },
};

/** Static metadata plus an absolute base for its URLs — see siteMetadataBase in lib/site.ts. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...METADATA, metadataBase: await siteMetadataBase() };
}

/** Only the help channels the app really has. */
const BASE_CHANNELS = [
  {
    icon: KeyRound,
    title: 'Can’t sign in?',
    body: 'Reset your password with a 4-digit code sent to your email.',
    link: { href: '/forgot-password', label: 'Reset password' },
  },
  {
    icon: MessageSquareHeart,
    title: 'Feedback and ideas',
    body: 'Signed-in users can rate media_tool and leave a review from their Profile page. Every review is read by an administrator.',
    link: { href: LOGIN_PATH, label: 'Sign in to leave a review' },
  },
] as const;

/** A managed section: switched off (/admin/content/sections), the page doesn't exist. */
export default async function ContactPage() {
  if (!isSectionOn(await getServerCatalog(), 'contact')) notFound();
  // Read on the server from the deployment's own email settings; only the address is used.
  const email = supportEmail();
  const channels = [
    ...(email
      ? [{ icon: Mail, title: 'Email us', body: `Questions, problems or feedback — write to ${email} and we’ll get back to you.`, link: { href: `mailto:${email}`, label: email } }]
      : []),
    ...BASE_CHANNELS,
    {
      icon: UserRound,
      title: 'Account questions',
      body: email
        ? `For anything about your account — including closing it — email ${email} from the address you signed up with.`
        : 'For anything about your account — including closing it — contact the media_tool administrator.',
      link: null,
    },
  ];

  return (
    <LegalPage eyebrow="Support" title="Contact">
      <p>The quickest way to get help depends on what you need.</p>
      <div className="not-prose mt-8 grid gap-4">
        {channels.map(({ icon: Icon, title, body, link }) => (
          <div key={title} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              {link && (
                <Link href={link.href} className="mt-2 inline-block text-sm font-medium text-accent hover:underline">
                  {link.label} →
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </LegalPage>
  );
}
