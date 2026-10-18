import type { Metadata } from 'next';
import { LearnByClassSection } from '@/components/marketing/sections';
import { getServerCatalog } from '@/lib/server/contentCatalog';
import { resolveCatalog } from '@/lib/content/catalog';
import { isSectionOn } from '@/lib/content/sections';
import { classCards } from '@/lib/content/learnPaths';
import { siteMetadataBase } from '@/lib/site';

/**
 * /classes — every visible class from Manage Courses, as the same cards as the home page. Where
 * "All classes" leads from a class page, for visitors and signed-in users alike (the home page
 * itself sends a signed-in user on to their dashboard).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Classes — media_tool',
    description: 'Fun, engaging and structured learning, class by class.',
    alternates: { canonical: '/classes' },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function ClassesPage() {
  const raw = await getServerCatalog();
  const catalog = resolveCatalog(raw);
  return (
    <div className="pt-4">
      <h1 className="sr-only">Classes</h1>
      <LearnByClassSection status={catalog.fromServer ? 'ready' : 'error'} classes={classCards(catalog, isSectionOn(raw, 'kid-games'))} retryHref="/classes" />
    </div>
  );
}
