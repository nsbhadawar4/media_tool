'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, Loader2, PencilLine, RefreshCw, Send, Wand2 } from 'lucide-react';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { ADMIN_CLASSES_KEY, adminClassesApi } from '@/lib/api/adminClasses';
import { Button } from '@/components/ui/Button';
import { CurriculumView } from '@/components/courses/CurriculumView';
import { builtInSubtitle, classPicture } from '@/components/kid-games/cards/ClassCourseCard';
import { ThemedPlaceholder } from '@/components/courses/ThemedPlaceholder';

const STATUS_TEXT = { draft: 'Draft — not shown publicly', visible: 'Published and visible', hidden: 'Hidden — not shown publicly', off: 'Switched off', archived: 'Archived' } as const;

/**
 * /admin/courses/N/preview — a class as visitors will see it (subjects, chapters, lessons, practice,
 * quiz and resources), whatever its status: drafts and hidden classes included. Answers are shown
 * for the administrator. Looking changes nothing.
 */
export function ClassPreview({ level }: { level: number }) {
  const list = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'all'], queryFn: async () => (await adminClassesApi.list('all')).data });
  const curriculum = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'curriculum', level], queryFn: async () => (await adminClassesApi.curriculum(level)).data, enabled: level > 0 });
  const cls = list.data?.find((c) => c.classLevel === level);
  const toast = useToast();
  const queryClient = useQueryClient();
  // Publishing a class also publishes its draft chapters (the generator saves new chapters as drafts).
  const publish = useMutation({
    mutationFn: () => adminClassesApi.setStatus(level, 'published'),
    onSuccess: () => {
      toast.success(cls?.status === 'draft' ? `${cls.title} is published` : 'Draft chapters published');
      void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
      void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Could not publish'),
  });

  if (list.isLoading || curriculum.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (list.isError || curriculum.isError || !cls) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">{!cls && !list.isError ? 'There is no such class' : 'Unable to load this class'}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Link href="/admin/courses" className="inline-flex h-10 items-center rounded-xl border border-border px-4 text-sm font-medium text-foreground">
            Manage Courses
          </Link>
          {(list.isError || curriculum.isError) && (
            <Button className="gap-2" onClick={() => void Promise.all([list.refetch(), curriculum.refetch()])}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const picture = classPicture(cls.classLevel, cls.image, cls.title, cls.builtIn);
  const subtitle = cls.subtitle || (cls.builtIn ? builtInSubtitle(cls.classLevel) : '');
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/admin/courses" className="group mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Manage Courses
          </Link>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Preview · {STATUS_TEXT[cls.status]}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/courses/${level}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
            <PencilLine aria-hidden className="h-4 w-4" />
            Edit
          </Link>
          <Link href={`/admin/courses/generate?class=${level}`} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
            <Wand2 aria-hidden className="h-4 w-4" />
            Generate Content
          </Link>
          {(cls.status === 'draft' || cls.counts.draftChapters > 0) && (
            <Button className="gap-1.5" onClick={() => publish.mutate()} isLoading={publish.isPending}>
              <Send aria-hidden className="h-4 w-4" />
              {cls.status === 'draft' ? 'Publish Class' : `Publish ${cls.counts.draftChapters} draft ${cls.counts.draftChapters === 1 ? 'chapter' : 'chapters'}`}
            </Button>
          )}
          {cls.status === 'visible' && (
            <a href={`/classes/${cls.slug}`} target="_blank" rel="noreferrer" className="btn-primary inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-accent-foreground">
              <ExternalLink aria-hidden className="h-4 w-4" />
              Public page
            </a>
          )}
        </div>
      </div>

      <section className="surface-card overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
        <div className="grid md:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="relative aspect-[4/3]">
            {picture ? (
              // eslint-disable-next-line @next/next/no-img-element -- the class picture (built-in, uploaded or linked)
              <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
            ) : (
              <ThemedPlaceholder level={cls.classLevel} marks={cls.subjects.map((s) => s.glyph ?? '').filter(Boolean).slice(0, 4)} />
            )}
          </div>
          <div className="p-5 sm:p-7">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted">{subtitle || `Class ${cls.classLevel}`}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-foreground">
              {cls.title}
              {cls.subtitle && <span className="text-muted"> — {cls.subtitle}</span>}
            </h1>
            {cls.description && <p className="mt-3 text-foreground-soft">{cls.description}</p>}
            {cls.details && <p className="mt-2 whitespace-pre-line text-sm text-muted">{cls.details}</p>}
            {cls.profile?.learningGoal && <p className="mt-3 text-sm text-muted">Goal: {cls.profile.learningGoal}</p>}
          </div>
        </div>
      </section>

      {curriculum.data!.subjects.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="text-muted">Edit a course:</span>
          {curriculum.data!.subjects.map((s) => (
            <Link key={s.key} href={`/admin/courses/${level}/${s.key}`} className="rounded-full border border-border bg-surface px-3 py-1 font-medium text-foreground hover:bg-surface-hover">
              {s.title}
            </Link>
          ))}
        </div>
      )}
      <CurriculumView subjects={curriculum.data!.subjects} showAnswers emptyText="This class has no subjects yet. Add one in Edit, then generate its content." />
    </div>
  );
}
