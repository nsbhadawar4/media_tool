import type { Metadata } from 'next';
import { ContentUnavailableError } from '@/lib/server/contentErrors';
import { notFound } from 'next/navigation';
import { classVars } from '@/components/kid-games/cards/ClassCourseCard';
import { CourseBreadcrumb } from '@/components/courses/CourseBreadcrumb';
import { ManualCourseView } from '@/components/courses/ManualCourseView';
import { getPublicManualCourse } from '@/lib/server/contentCatalog';
import { classPath, subjectPath } from '@/lib/content/learnPaths';
import { siteMetadataBase } from '@/lib/site';

/**
 * /classes/class-N/<subject>/manual/<course> — a course written by hand in Admin → Manual Courses,
 * as learners take it. The API checks the class offers the subject and that the course is published,
 * visible and not in Trash (only its published chapters and lessons come back); anything else is 404.
 */
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ slug: string; subject: string; course: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, subject, course } = await params;
  const read = await getPublicManualCourse(slug, subject, course);
  const data = read.status === 'ok' ? read.data : null;
  return {
    title: data ? `${data.course.title} — ${data.subject.title} — ${data.class.title} — media_tool` : 'Course — media_tool',
    description: data?.course.description || 'Lessons and questions.',
    alternates: { canonical: `${subjectPath(slug, subject)}/manual/${encodeURIComponent(course)}` },
    metadataBase: await siteMetadataBase(),
  };
}

export default async function ManualCoursePage({ params }: Params) {
  const { slug, subject, course } = await params;
  const read = await getPublicManualCourse(slug, subject, course);
  if (read.status === 'error') throw new ContentUnavailableError('subject');
  if (read.status === 'missing') notFound();
  const { class: cls, subject: sub, course: c } = read.data;

  return (
    <div style={classVars(cls.classLevel)} className="relative px-4 pb-20 pt-8 sm:px-6 sm:pt-12 lg:px-8">
      <div aria-hidden className="mk-hero-glow mk-hero-fade pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mb-6">
          <CourseBreadcrumb
            items={[{ label: 'Courses', href: '/classes' }, { label: cls.title, href: classPath(cls.slug) }, { label: sub.title, href: subjectPath(cls.slug, sub.key) }, { label: c.title }]}
          />
        </div>
        <ManualCourseView course={{ title: c.title, description: c.description, classTitle: cls.title, subjectTitle: sub.title, chapters: c.chapters }} />
      </div>
    </div>
  );
}
