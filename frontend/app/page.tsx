import { Fragment } from 'react';
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
  Pricing,
} from '@/components/marketing/sections';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { homeBlocks, type HomeBlock } from '@/lib/content/sections';
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
/**
 * Rendered per request: which sections show, and in what order, is set by administrators
 * (/admin/content/sections) and applies on the next request. If the database can't be reached
 * the code's own layout is used instead.
 */
export const dynamic = 'force-dynamic';

const SECTION: Record<string, (blocks: HomeBlock[]) => React.ReactNode> = {
  hero: (blocks) => <Hero featuresLink={blocks.some((b) => b.key === 'features')} />,
  features: () => <Features />,
  media: () => <MediaSection />,
  documents: () => <DocumentsSection />,
  games: () => <GamesSection />,
  'kid-games': () => <KidGamesSection />,
  // Approved, published reviews only (the server decides); a polished empty state otherwise.
  reviews: () => (
    <section id="reviews" className="border-y border-border bg-surface/30 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
      <PublicReviews className="mx-auto max-w-6xl" />
    </section>
  ),
  pricing: () => <Pricing />,
  faq: () => <Faq />,
  cta: () => <FinalCta />,
};

/** A section an administrator added: its title and text, as a simple band (plain text only). */
function CustomSection({ block }: { block: HomeBlock }) {
  return (
    <section id={block.key} className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{block.title}</h2>
        {block.description && <p className="mt-4 whitespace-pre-line text-base leading-relaxed text-muted sm:text-lg">{block.description}</p>}
      </div>
    </section>
  );
}

export default async function HomePage() {
  const blocks = homeBlocks(await getServerCatalog());
  return (
    <MarketingShell>
      {/* Only while the FAQ itself is shown. */}
      {blocks.some((b) => b.key === 'faq') && (
        <script
          type="application/ld+json"
          // Static content defined above; `<` is escaped so the JSON can never close the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD).replace(/</g, '\\u003c') }}
        />
      )}
      {blocks.map((block) => (
        <Fragment key={block.key}>{block.custom ? <CustomSection block={block} /> : SECTION[block.key]?.(blocks)}</Fragment>
      ))}
    </MarketingShell>
  );
}
