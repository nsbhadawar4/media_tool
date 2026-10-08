import type { Metadata } from 'next';
import { siteMetadataBase } from '@/lib/site';
import { MarketingShell } from '@/components/marketing/MarketingShell';
import {
  DocumentsSection,
  Faq,
  FAQ_ITEMS,
  Features,
  FinalCta,
  GamesSection,
  Hero,
  KidGamesSection,
  MediaSection,
} from '@/components/marketing/sections';
import { PublicReviews } from '@/components/reviews/PublicReviews';

const TITLE = 'media_tool — Your Digital World, Organized';
const DESCRIPTION =
  'Store, organize and manage your photos, videos, documents and learning games in one secure place. Private folders, in-app previews, seven games and 150 Kid Games for Classes 1–5.';

const METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The app's pages stay out of search (root layout); the public site is meant to be found.
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  keywords: ['media library', 'photo organizer', 'document manager', 'private cloud storage', 'kids learning games', 'Hindi English Maths games'],
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'media_tool',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** Static metadata plus an absolute base for its URLs — see siteMetadataBase in lib/site.ts. */
export async function generateMetadata(): Promise<Metadata> {
  return { ...METADATA, metadataBase: await siteMetadataBase() };
}

/** FAQ structured data, built from the same answers the page shows. */
const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

/**
 * The public website. Only signed-out visitors see it: proxy.ts sends anyone with a session
 * cookie on to their own area (/dashboard or /admin/dashboard) before this renders.
 */
export default function HomePage() {
  return (
    <MarketingShell>
      <script
        type="application/ld+json"
        // Static content defined above; `<` is escaped so the JSON can never close the tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD).replace(/</g, '\\u003c') }}
      />
      <Hero />
      <Features />
      <MediaSection />
      <DocumentsSection />
      <GamesSection />
      <KidGamesSection />
      {/* Approved, published reviews only (the server decides); a polished empty state otherwise. */}
      <section id="reviews" className="border-y border-border bg-surface/30 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <PublicReviews className="mx-auto max-w-6xl" />
      </section>
      {/* No pricing section here: plans are chosen during onboarding (/onboarding), after signup. */}
      <Faq />
      <FinalCta />
    </MarketingShell>
  );
}
