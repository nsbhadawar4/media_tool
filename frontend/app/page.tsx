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
  Highlights,
  HowItWorks,
  KidGamesSection,
  LearnByClassSection,
  kidSubjectSummary,
  MediaSection,
  Pricing,
  SecuritySection,
} from '@/components/marketing/sections';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { resolveCatalog, type ResolvedCatalog } from '@/lib/content/catalog';
import { SUBJECT_INFO } from '@/lib/kid-games/catalog';
import { homeBlocks, isSectionOn, type HomeBlock } from '@/lib/content/sections';
import { PublicReviews } from '@/components/reviews/PublicReviews';

const TITLE = 'media_tool — Your Digital World, Organized';
const DESCRIPTION =
  'Store, organize and manage your photos, videos and documents in one secure place. Private folders, in-app previews and search — in any browser.';

const METADATA: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The app's pages stay out of search (root layout); the public site is meant to be found.
  robots: { index: true, follow: true },
  alternates: { canonical: '/' },
  keywords: ['media library', 'photo organizer', 'document manager', 'private cloud storage'],
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

/** What a block needs: which sections are on, and the catalog as administrators set it. */
interface Ctx {
  on: (key: string) => boolean;
  /** A feature (Games, Kid Games) is switched on — its master switch, not its home page block. */
  featureOn: (key: string) => boolean;
  catalog: ResolvedCatalog;
}

/**
 * The Kid Games block's content: the listed classes that have games on the landing page, their
 * subjects and how many of those games each has — so switching games (or a class or subject) off
 * for the landing page is reflected in the counts.
 */
function kidGamesProps(catalog: ResolvedCatalog) {
  const classes = catalog.classViews.filter((c) => catalog.landingKidGames(c.level).length > 0);
  const keys = [...new Set(classes.flatMap((c) => catalog.subjectsFor(c.level).map((s) => s.key)))];
  const subjects = keys
    .map((key) => {
      const view = catalog.subjectView(key);
      const title = view?.title ?? (key in SUBJECT_INFO ? SUBJECT_INFO[key as keyof typeof SUBJECT_INFO].name : key);
      return kidSubjectSummary(key, title, catalog.landingKidGames(undefined, key).length);
    })
    .filter((s) => s.games > 0);
  return { classes, subjects, totalGames: catalog.landingKidGames().length };
}

const SECTION: Record<string, (ctx: Ctx) => React.ReactNode> = {
  hero: ({ on }) => <Hero featuresLink={on('features')} />,
  highlights: () => <Highlights />,
  features: () => <Features />,
  media: () => <MediaSection />,
  documents: () => <DocumentsSection />,
  // Learn by Class: every listed class, the same data and card as the app. Its pages belong to
  // Kid Games, so it shows only while that feature is on.
  classes: ({ catalog, featureOn }) =>
    featureOn('kid-games') ? (
      <LearnByClassSection
        classes={catalog.classViews.map((c) => ({ ...c, games: catalog.listedGames(c.level).length, subjects: catalog.subjectsFor(c.level).length }))}
      />
    ) : null,
  // Games and Kid Games: only while the feature is on AND opted in to the home page (homeBlocks);
  // each lists only the games switched on for the landing page. Empty, the block isn't rendered.
  games: ({ catalog }) => <GamesSection games={catalog.landingArcadeGames} />,
  'kid-games': ({ catalog }) => {
    const props = kidGamesProps(catalog);
    return props.totalGames > 0 ? <KidGamesSection {...props} /> : null;
  },
  'how-it-works': () => <HowItWorks />,
  security: () => <SecuritySection />,
  // Approved, published reviews only (the server decides); a polished empty state otherwise.
  reviews: () => (
    <section id="reviews" className="mk-band relative px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      <PublicReviews className="mx-auto max-w-6xl" />
    </section>
  ),
  pricing: () => <Pricing />,
  faq: ({ on }) => <Faq contactLink={on('contact')} />,
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
  const raw = await getServerCatalog();
  const blocks = homeBlocks(raw);
  const shown = new Set(blocks.map((b) => b.key));
  const ctx: Ctx = { catalog: resolveCatalog(raw), featureOn: (key) => isSectionOn(raw, key), on: (key) => shown.has(key) || (key === 'contact' && isSectionOn(raw, key)) };
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
        <Fragment key={block.key}>{block.custom ? <CustomSection block={block} /> : SECTION[block.key]?.(ctx)}</Fragment>
      ))}
    </MarketingShell>
  );
}
