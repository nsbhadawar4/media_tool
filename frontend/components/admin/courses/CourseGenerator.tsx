'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Bot, CheckCircle2, Circle, ExternalLink, FileText, Loader2, RefreshCw, Save, Send, Sparkles, Wand2 } from 'lucide-react';
import { ADMIN_CLASSES_KEY, adminClassesApi } from '@/lib/api/adminClasses';
import { adminContentApi } from '@/lib/api/adminContent';
import { COURSE_KEY, GENERATION_JOB_KEY, courseAdminApi, type CourseBrief, type CourseLanguage, type CourseLevel, type CourseOutline, type Engine, type GeneratedBy, type GenerationJob } from '@/lib/api/courses';
import { nextChapterIndex, rateLimitOf, runGenerationJob, type RetryWait } from '@/lib/api/courseGeneration';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { cn } from '@/utils/cn';
import { CourseEditor, courseCounts, courseProblems, toDraftChapter, toDraftLesson, toDraftQuestion, toSaveChapters, type DraftCourse } from './CourseEditor';

/**
 * Admin → Manage Courses → AI Course Generator. A course is one subject of one class:
 *   1 Course details → 2 Content settings → 3 Generate → 4 Review & edit → 5 Saved
 * Generation runs in steps the server really completes — the plan, then each chapter — so the
 * progress shown is real, and a failed step can be retried without starting over. Nothing is saved
 * until the administrator saves a draft or publishes; an existing course is never overwritten
 * (a new version is saved as drafts beside it). Content is labelled with what wrote it: the AI
 * provider and model, or the template generator — never "AI" when no AI was used.
 */

const STEPS = ['Course Details', 'Content Settings', 'Generate', 'Review', 'Publish'] as const;
const field = 'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';
const LEVELS: Array<{ value: CourseLevel; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'basic', label: 'Easy' },
  { value: 'intermediate', label: 'Medium' },
  { value: 'advanced', label: 'Advanced' },
];
const LANGUAGES: Array<{ value: CourseLanguage; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'bilingual', label: 'English + Hindi' },
  { value: 'hinglish', label: 'Hinglish' },
];
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="anim-rise surface-card rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}
function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** Who wrote the content, in plain words. */
export function sourceLabel(by: { kind: string; provider: string | null; model: string | null } | null | undefined): string {
  if (!by) return 'Written by hand';
  if (by.kind === 'ai') return `AI-generated · ${by.provider ?? 'AI'}${by.model ? ` (${by.model})` : ''}`;
  if (by.kind === 'template') return 'Template-generated (no AI)';
  return 'Written by hand';
}

type Stage = { label: string; state: 'waiting' | 'running' | 'done' | 'failed' };

export function CourseGenerator() {
  const params = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Step 1
  const classes = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'live'], queryFn: async () => (await adminClassesApi.list('live')).data });
  const subjects = useQuery({
    queryKey: ['admin', 'content', 'taxonomy', 'subject'],
    queryFn: async () => (await adminContentApi.list({ type: 'subject', status: 'live', sort: 'order', limit: 100 })).data,
    staleTime: 30_000,
  });
  const [classLevel, setClassLevel] = useState<number>(Number(params.get('class')) || 0);
  const [subjectKey, setSubjectKey] = useState(params.get('subject') ?? '');
  const [newSubject, setNewSubject] = useState('');
  // Typed by the administrator, or (until then) made from the subject and class.
  const [typedTitle, setTypedTitle] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [chosenLanguage, setLanguage] = useState<CourseLanguage | null>(null);
  const [level, setLevel] = useState<CourseLevel>('beginner');
  const [versionChosen, setVersionChosen] = useState(false);

  // Step 2
  const [chapters, setChapters] = useState(6);
  const [lessons, setLessons] = useState(3);
  const [questions, setQuestions] = useState(5);
  const [prompt, setPrompt] = useState('');
  const [goals, setGoals] = useState('');
  const [include, setInclude] = useState('');
  const [avoid, setAvoid] = useState('');
  const [instructions, setInstructions] = useState('');
  const engineQuery = useQuery({ queryKey: ['admin', 'courses', 'engine'], queryFn: async () => (await courseAdminApi.engine()).data, staleTime: 60_000 });
  const [engine, setEngine] = useState<Engine | null>(null);
  // The administrator's choice, else what the server says (AI whenever a provider is configured). Never assumed:
  // until the server answers there is no engine, and Generate waits — the template is used only when chosen.
  const chosenEngine: Engine | null = engine ?? engineQuery.data?.defaultEngine ?? null;

  // Step 3–5
  const [stages, setStages] = useState<Stage[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [by, setBy] = useState<GeneratedBy | null>(null);
  const [draft, setDraft] = useState<DraftCourse | null>(null);
  const [saved, setSaved] = useState<{ published: boolean } | null>(null);
  const [running, setRunning] = useState(false);
  /** Waiting out a rate limit before retrying (null when not). */
  const [wait, setWait] = useState<RetryWait | null>(null);
  /** Where generation stopped: a chapter (0-based) or the plan (null), and whether it was a rate limit. */
  const [failure, setFailure] = useState<{ chapter: number | null; rateLimited: boolean } | null>(null);
  /** The generation job this page is running (saved on the server, chapter by chapter). */
  const [job, setJob] = useState<GenerationJob | null>(null);

  const cls = classes.data?.find((c) => c.classLevel === classLevel);
  const subjectOptions = useMemo(() => {
    const offered = new Set(cls?.subjects.map((s) => s.key) ?? []);
    return (subjects.data ?? []).map((s) => ({ key: s.key, title: s.title, offered: offered.has(s.key) })).sort((a, b) => Number(b.offered) - Number(a.offered));
  }, [subjects.data, cls]);
  const isNewSubject = subjectKey === '__new';
  const subject = isNewSubject ? { key: slugify(newSubject), title: newSubject.trim() } : subjectOptions.find((s) => s.key === subjectKey);

  // Language follows the subject until chosen (a Hindi course in Hindi); the title likewise.
  const language: CourseLanguage = chosenLanguage ?? (subject?.key === 'hindi' ? 'hindi' : 'english');
  const title = typedTitle ?? (subject?.title && cls ? `${subject.title} — ${cls.title}` : '');

  // Duplicate protection: an existing course for this class and subject.
  const existing = useQuery({
    queryKey: COURSE_KEY(classLevel, subject?.key ?? ''),
    queryFn: async () => (await courseAdminApi.get(classLevel, subject!.key)).data,
    enabled: Boolean(classLevel && subject?.key && !isNewSubject),
  });
  const exists = (existing.data?.counts.chapters ?? 0) > 0;
  // An unfinished generation for this class and subject (paused, or left when the page closed).
  const savedJob = useQuery({
    queryKey: GENERATION_JOB_KEY(classLevel, subject?.key ?? ''),
    queryFn: async () => (await courseAdminApi.jobs.current(classLevel, subject!.key)).data,
    enabled: Boolean(classLevel && subject?.key && !isNewSubject),
  });
  const unfinished = !job && savedJob.data && savedJob.data.status !== 'complete' && savedJob.data.status !== 'discarded' ? savedJob.data : null;
  // A new version only where a course exists (and the administrator chose it).
  const mode: 'new' | 'new-version' = exists && versionChosen ? 'new-version' : 'new';

  const brief: CourseBrief | null =
    cls && subject?.key && subject.title
      ? { classLevel, subject: { key: subject.key, title: subject.title }, title: title.trim() || `${subject.title} — ${cls.title}`, description: description.trim(), language, level, chapters, lessonsPerChapter: lessons, questionsPerLesson: questions, prompt: prompt.trim(), goals: goals.trim(), include: include.trim(), avoid: avoid.trim(), instructions: instructions.trim() }
      : null;
  const step1Ready = Boolean(brief && (!exists || mode === 'new-version'));

  const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong');
  const providerLabel = chosenEngine === 'template' ? 'The generator' : ({ gemini: 'Gemini', openai: 'OpenAI', anthropic: 'Claude' }[(job?.by?.provider ?? engineQuery.data?.ai.provider) || ''] ?? 'The AI provider');

  /** The progress list for a job: the plan, each chapter, then the final check. */
  function stagesFor(j: GenerationJob, state: 'running' | 'failed' | 'done'): Stage[] {
    const now: Stage['state'] = state === 'failed' ? 'failed' : 'running';
    const at = nextChapterIndex(j);
    const list: Stage[] = [{ label: `Understanding Class ${j.classLevel} and planning the chapters`, state: j.outline ? 'done' : j.next === 'outline' ? now : 'waiting' }];
    for (let i = 0; i < j.total; i++) {
      const t = j.outline?.chapters[i]?.title;
      list.push({ label: `Chapter ${i + 1} of ${j.total}${t ? `: ${t}` : ''} — lessons, questions and answers`, state: i < j.done ? 'done' : i === at ? now : 'waiting' });
    }
    list.push({ label: 'Validating and finalizing the course', state: state === 'done' ? 'done' : 'waiting' });
    return list;
  }

  /** Shows a job as the server saved it: its plan and every chapter written so far. */
  function show(j: GenerationJob, state: 'running' | 'failed' | 'done') {
    setJob(j);
    setStages(stagesFor(j, state));
    if (!j.outline) return;
    setBy(j.by);
    setDraft({ title: j.outline.title, description: j.outline.description, objectives: j.outline.objectives, chapters: j.chapters.map((c) => toDraftChapter(c, 'draft')) });
  }

  /**
   * Runs generation as a job saved on the server: the outline, then each chapter not written yet,
   * one request at a time. Every chapter is saved as it arrives; a rate limit is waited out as the
   * server says (backoff or Retry-After, at most 4 retries). If it stops, the job is paused with its
   * chapters kept, and "Resume Generation" continues from the first missing chapter — now or after
   * a reload. `resume` continues that job (with its own settings); `fresh` starts a new one.
   */
  async function generate(fresh: boolean, resume?: GenerationJob) {
    const b = resume?.brief ?? brief;
    const eng = resume?.engine ?? job?.engine ?? chosenEngine;
    if (!b || !eng || running) return;
    setRunning(true);
    setGenError(null);
    setFailure(null);
    setWait(null);
    try {
      let current = resume ?? (fresh ? null : job);
      if (!current || current.status === 'complete' || current.status === 'discarded') {
        setDraft(null);
        setBy(null);
        try {
          current = (await courseAdminApi.jobs.start(b, chosenEngine ?? eng, mode)).data;
        } catch (err) {
          setFailure({ chapter: null, rateLimited: false });
          setGenError(message(err));
          return;
        }
      }
      show(current, 'running');
      const run = await runGenerationJob({
        job: current,
        next: async (id) => (await courseAdminApi.jobs.next(id)).data,
        onProgress: (j) => show(j, 'running'),
        onWait: setWait,
      });
      if (run.error) {
        show(run.job, 'failed');
        setFailure({ chapter: nextChapterIndex(run.job), rateLimited: Boolean(rateLimitOf(run.error)) });
        setGenError(message(run.error));
        return;
      }
      // Every chapter was validated by the server as it arrived; this is the final check of the whole.
      show(run.job, 'done');
      setStep(3);
      toast.success('Course generated successfully');
    } finally {
      setWait(null);
      setRunning(false);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'courses', 'job'] });
    }
  }

  /** Picks up an unfinished generation (after a reload, or later): its settings, then carries on. */
  function resumeJob(j: GenerationJob) {
    const jb = j.brief;
    setTypedTitle(jb.title);
    setDescription(jb.description);
    setLanguage(jb.language);
    setLevel(jb.level);
    setChapters(jb.chapters);
    setLessons(jb.lessonsPerChapter);
    setQuestions(jb.questionsPerLesson);
    setPrompt(jb.prompt);
    setGoals(jb.goals);
    setInclude(jb.include);
    setAvoid(jb.avoid);
    setInstructions(jb.instructions);
    setEngine(j.engine);
    setVersionChosen(j.mode === 'new-version');
    setStep(2);
    void generate(false, j);
  }

  const discardJob = useMutation({
    mutationFn: (id: string) => courseAdminApi.jobs.discard(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'courses', 'job'] });
      toast.success('Unfinished generation discarded');
    },
    onError: (err) => toast.error(message(err)),
  });

  const regenEngine: Engine = job?.engine ?? chosenEngine ?? 'ai';
  const regenerate = brief
    ? {
        chapter: async (index: number) => {
          const plan: CourseOutline = { title: draft!.title, description: draft!.description, objectives: draft!.objectives, chapters: draft!.chapters.map((c) => ({ title: c.title, description: c.description || c.title, lessonTitles: c.lessons.map((l) => l.title) })) };
          const res = await courseAdminApi.chapter({ ...brief, chapters: plan.chapters.length, lessonsPerChapter: plan.chapters[index]!.lessonTitles.length || brief.lessonsPerChapter }, regenEngine, plan, index, String(Date.now()));
          return toDraftChapter(res.data.chapter, 'draft');
        },
        lesson: async (ci: number, li: number) => {
          const c = draft!.chapters[ci]!;
          const res = await courseAdminApi.lesson(brief, regenEngine, { title: c.title, description: c.description || c.title, lessonTitles: c.lessons.map((l) => l.title) }, li, String(Date.now()));
          return toDraftLesson(res.data.lesson);
        },
        questions: async (ci: number, li: number, count: number) => {
          const c = draft!.chapters[ci]!;
          const l = c.lessons[li]!;
          const res = await courseAdminApi.questions(brief, regenEngine, c.title, li, { title: l.title, explanation: l.explanation }, Math.min(15, count), String(Date.now()));
          return res.data.questions.map(toDraftQuestion);
        },
      }
    : undefined;

  const problems = draft ? courseProblems(draft) : [];
  const save = useMutation({
    mutationFn: async (publish: boolean) =>
      courseAdminApi.save(classLevel, subject!.key, {
        mode,
        ...(isNewSubject ? { subjectTitle: subject!.title } : {}),
        course: { title: draft!.title.trim(), description: draft!.description.trim(), objectives: draft!.objectives.map((o) => o.trim()).filter(Boolean), language, level },
        chapters: toSaveChapters(draft!.chapters, false),
        source: by ?? { kind: 'manual', provider: null, model: null },
        publish,
      }),
    onSuccess: (_res, publish) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'courses'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
      setSaved({ published: publish });
      setStep(4);
      // The course is saved: its generation job is done (it no longer offers to resume).
      if (job) void courseAdminApi.jobs.finish(job.id).catch(() => undefined);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'courses', 'job'] });
      toast.success(publish ? 'Course published' : 'Course saved as a draft');
    },
    onError: (err) => toast.error(message(err)),
  });

  const c = draft ? courseCounts(draft) : null;
  const aiReady = engineQuery.data?.ai.ready ?? false;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <Link href="/admin/courses" className="group inline-flex min-h-10 w-fit items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Manage Courses
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Sparkles aria-hidden className="h-6 w-6 text-accent" />
          AI Course Generator
        </h1>
        <p className="text-sm text-muted">Describe the course; review and edit everything it writes; publish when it&apos;s right.</p>
      </div>

      <ol className="grid grid-cols-5 gap-1.5" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? 'step' : undefined} className="min-w-0">
            <div className={cn('h-1.5 rounded-full transition-colors', i < step ? 'bg-accent' : i === step ? 'bg-accent/70' : 'bg-surface-hover')} />
            <p className={cn('mt-1.5 truncate text-[11px] font-semibold sm:text-xs', i === step ? 'text-foreground' : 'text-muted')}>
              <span className="tabular-nums">{i + 1}.</span> {label}
            </p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Section title="Course details" hint="Which class and subject the course is for, and how it should read.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class / Grade" htmlFor="g-class">
              <select id="g-class" className={field} value={classLevel || ''} onChange={(e) => setClassLevel(Number(e.target.value))}>
                <option value="">Choose a class…</option>
                {(classes.data ?? []).map((x) => (
                  <option key={x.classLevel} value={x.classLevel}>
                    {x.title}
                    {x.title !== `Class ${x.classLevel}` ? ` (Class ${x.classLevel})` : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject" htmlFor="g-subject" hint={cls && subject && !isNewSubject && !subjectOptions.find((s) => s.key === subject.key)?.offered ? `${cls.title} doesn't offer it yet — saving adds it.` : undefined}>
              <select id="g-subject" className={field} value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)}>
                <option value="">Choose a subject…</option>
                {subjectOptions.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                    {cls && !s.offered ? ' (new to this class)' : ''}
                  </option>
                ))}
                <option value="__new">+ Another subject…</option>
              </select>
            </Field>
            {isNewSubject && (
              <Field label="New subject name" htmlFor="g-newsubject" hint="e.g. Science, EVS, Social Studies, Computer">
                <input id="g-newsubject" className={field} value={newSubject} maxLength={60} onChange={(e) => setNewSubject(e.target.value)} />
              </Field>
            )}
            <Field label="Course title (optional)" htmlFor="g-title" hint="Made from the subject and class if left as it is.">
              <input
                id="g-title"
                className={field}
                value={title}
                maxLength={120}
                onChange={(e) => setTypedTitle(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Course description (optional)" htmlFor="g-desc">
                <textarea id="g-desc" className={cn(field, 'min-h-20 resize-y')} value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>
            <Field label="Language" htmlFor="g-lang">
              <select id="g-lang" className={field} value={language} onChange={(e) => setLanguage(e.target.value as CourseLanguage)}>
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Difficulty level" htmlFor="g-level">
              <select id="g-level" className={field} value={level} onChange={(e) => setLevel(e.target.value as CourseLevel)}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {unfinished && (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
              <p className="flex gap-2">
                <RefreshCw aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <span>
                  <strong>Unfinished generation</strong> — {unfinished.done} of {unfinished.total} chapters are saved
                  {unfinished.lastError?.rateLimited ? ` (paused: ${providerLabel} was rate limiting requests)` : unfinished.status === 'ready' ? ', ready to review' : ''}. Continue from chapter{' '}
                  {Math.min(unfinished.done + 1, unfinished.total)}, or start over.
                </span>
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" disabled={discardJob.isPending} onClick={() => discardJob.mutate(unfinished.id)}>
                  Start Over
                </Button>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => resumeJob(unfinished)}>
                  <RefreshCw aria-hidden className="h-4 w-4" />
                  {unfinished.status === 'paused' && unfinished.outline ? 'Retry from failed chapter' : 'Resume Generation'}
                </Button>
              </div>
            </div>
          )}
          {exists && existing.data && (
            <div role="status" className="flex flex-col gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
              <p className="flex gap-2">
                <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <span>
                  <strong>This course already exists</strong> — {existing.data.subject.title} for {existing.data.class.title} ({existing.data.counts.chapters} chapters). Update it in the course editor, or generate a new version: it is saved as drafts beside the current one and replaces it only when you publish.
                </span>
              </p>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setSubjectKey('')}>
                  Cancel
                </Button>
                <Link href={`/admin/courses/${classLevel}/${subject!.key}`} className="inline-flex h-9 items-center rounded-xl border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-surface-hover">
                  Update Existing
                </Link>
                <Button type="button" size="sm" variant={mode === 'new-version' ? 'primary' : 'secondary'} onClick={() => setVersionChosen(true)} aria-pressed={mode === 'new-version'}>
                  {mode === 'new-version' ? '✓ New Version' : 'Generate New Version'}
                </Button>
              </div>
            </div>
          )}
        </Section>
      )}

      {step === 1 && (
        <Section title="Content settings" hint="How much to write, and what to teach. Everything is reviewed before it's saved.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Number of chapters" htmlFor="g-ch" hint="1–12">
              <input id="g-ch" type="number" min={1} max={12} className={field} value={chapters} onChange={(e) => setChapters(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Lessons per chapter" htmlFor="g-ls" hint="1–8">
              <input id="g-ls" type="number" min={1} max={8} className={field} value={lessons} onChange={(e) => setLessons(Math.max(1, Math.min(8, Number(e.target.value) || 1)))} />
            </Field>
            <Field label="Questions per lesson" htmlFor="g-qs" hint="1–15">
              <input id="g-qs" type="number" min={1} max={15} className={field} value={questions} onChange={(e) => setQuestions(Math.max(1, Math.min(15, Number(e.target.value) || 1)))} />
            </Field>
          </div>
          <Field label="Describe what you want to teach" htmlFor="g-prompt">
            <textarea
              id="g-prompt"
              className={cn(field, 'min-h-32 resize-y')}
              value={prompt}
              maxLength={2000}
              placeholder="Create a Hindi course for Class 1 focused on Swar, Vyanjan, simple words, reading practice and basic sentence formation."
              onChange={(e) => setPrompt(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Learning goals (optional)" htmlFor="g-goals">
              <textarea id="g-goals" className={cn(field, 'min-h-20 resize-y')} value={goals} maxLength={1000} onChange={(e) => setGoals(e.target.value)} />
            </Field>
            <Field label="Topics to cover (optional)" htmlFor="g-inc">
              <textarea id="g-inc" className={cn(field, 'min-h-20 resize-y')} value={include} maxLength={1000} onChange={(e) => setInclude(e.target.value)} />
            </Field>
            <Field label="Topics to avoid (optional)" htmlFor="g-avoid">
              <textarea id="g-avoid" className={cn(field, 'min-h-20 resize-y')} value={avoid} maxLength={1000} onChange={(e) => setAvoid(e.target.value)} />
            </Field>
            <Field label="Special instructions (optional)" htmlFor="g-ins">
              <textarea id="g-ins" className={cn(field, 'min-h-20 resize-y')} value={instructions} maxLength={1000} onChange={(e) => setInstructions(e.target.value)} />
            </Field>
          </div>
          <div role="radiogroup" aria-label="Generator" className="grid gap-2 sm:grid-cols-2">
            {(['ai', 'template'] as const).map((e) => {
              const disabled = e === 'ai' && !aiReady;
              const on = chosenEngine === e;
              return (
                <button
                  key={e}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={disabled}
                  onClick={() => setEngine(e)}
                  className={cn('flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60', on ? 'border-accent bg-accent/10' : 'border-border bg-surface hover:bg-surface-hover')}
                >
                  {e === 'ai' ? <Bot aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> : <FileText aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />}
                  <span>
                    <span className="block text-sm font-semibold text-foreground">{e === 'ai' ? 'AI generator' : 'Template generator'}</span>
                    <span className="block text-xs text-muted">
                      {e === 'ai'
                        ? aiReady
                          ? `${engineQuery.data!.ai.provider} · ${engineQuery.data!.ai.model}`
                          : (engineQuery.data?.ai.problem ?? 'Not configured.')
                        : 'Offline, free and instant. Built from the app’s own curriculum library; labelled as template-generated.'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {!aiReady && engineQuery.data && (
            <p className="text-xs text-muted">
              To use AI, set <code>AI_PROVIDER</code>, <code>AI_API_KEY</code> (and <code>AI_MODEL</code> for OpenAI or Gemini) on the server. Content made without it is never labelled as AI.
            </p>
          )}
        </Section>
      )}

      {step === 2 && brief && (
        <Section title={stages.length ? 'Generating your course…' : 'Ready to generate'} hint={stages.length ? undefined : 'Check the summary, then generate. Nothing is saved yet.'}>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ['Class', cls?.title ?? ''],
              ['Subject', brief.subject.title],
              ['Chapters', String(brief.chapters)],
              ['Lessons', `${brief.lessonsPerChapter} per chapter`],
              ['Questions', `${brief.questionsPerLesson} per lesson`],
              ['Language', LANGUAGES.find((l) => l.value === language)!.label],
              ['Difficulty', LEVELS.find((l) => l.value === level)!.label],
              ['Generator', chosenEngine === 'ai' ? `AI (${engineQuery.data?.ai.provider} · ${engineQuery.data?.ai.model})` : chosenEngine === 'template' ? 'Template (no AI)' : 'Checking…'],
            ].map(([k2, v]) => (
              <div key={k2} className="rounded-xl border border-border bg-surface-elevated/60 px-3 py-2">
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{k2}</dt>
                <dd className="truncate font-medium text-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          {mode === 'new-version' && <p className="text-xs text-muted">This is a new version: it is saved as drafts beside the current course and replaces it only when published.</p>}
          {!chosenEngine && (
            <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface-elevated/60 px-4 py-3 text-sm text-foreground">
              {engineQuery.isError ? (
                <>
                  <span>Could not check the AI provider, so generation waits (it never falls back to the template).</span>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void engineQuery.refetch()}>
                    Try again
                  </Button>
                </>
              ) : (
                <span className="inline-flex items-center gap-2 text-muted">
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                  Checking the AI provider…
                </span>
              )}
            </div>
          )}
          {stages.length > 0 && (
            <ol className="space-y-1.5" aria-live="polite">
              {stages.map((s, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {s.state === 'done' ? (
                    <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
                  ) : s.state === 'running' ? (
                    <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-accent" />
                  ) : s.state === 'failed' ? (
                    <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-danger" />
                  ) : (
                    <Circle aria-hidden className="h-4 w-4 shrink-0 text-subtle" />
                  )}
                  <span className="min-w-0">
                    <span className={cn(s.state === 'waiting' ? 'text-muted' : 'text-foreground')}>{s.label}</span>
                    {s.state === 'running' && wait && (
                      <span className="block text-xs text-warning" role="status">
                        {providerLabel} is temporarily rate limiting requests. Your completed chapters are saved. We will automatically retry shortly.{' '}
                        <span className="text-muted">
                          ({wait.chapter ? `Chapter ${wait.chapter}` : 'Course plan'}: {wait.secondsLeft > 0 ? `retrying in ${wait.secondsLeft} s` : 'retrying now'} · attempt {wait.attempt} of {wait.of})
                        </span>
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {genError && (
            <div role="alert" className="rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-foreground">
              <p className="font-semibold">
                {failure?.rateLimited ? 'Generation paused' : failure?.chapter != null ? `Chapter ${failure.chapter + 1} of ${job?.total ?? brief?.chapters ?? ''} could not be written` : 'Generation stopped'}
              </p>
              {/* The server's words, e.g. "Gemini is still rate limiting requests after 5 automatic retries. Your completed chapters are saved — …" */}
              <p className="mt-1">{genError}</p>
              <p className="mt-1 text-xs text-muted">
                {job && job.done > 0
                  ? `Chapters 1–${job.done} of ${job.total} are saved and will not be written again. Retrying continues from chapter ${job.done + 1}${failure?.rateLimited ? ' — now, or later from this page' : ''}.`
                  : 'Nothing is lost. Retrying continues from where it stopped.'}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {/* Retries the same AI step — Gemini content is never swapped for the template. */}
                <Button type="button" size="sm" className="gap-1.5" onClick={() => void generate(false)}>
                  <RefreshCw aria-hidden className="h-4 w-4" />
                  {failure?.chapter != null ? 'Retry from failed chapter' : 'Retry'}
                </Button>
              </div>
            </div>
          )}
        </Section>
      )}

      {step === 3 && draft && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-success/40 bg-success/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm text-foreground">
              <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0 text-success" />
              <span>
                <strong>Course generated successfully.</strong> {c!.chapters} chapters · {c!.lessons} lessons · {c!.questions} questions. Review, edit and regenerate anything below.
              </span>
            </p>
            <span className="shrink-0 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground-soft">{sourceLabel(by)}</span>
          </div>
          <CourseEditor value={draft} onChange={setDraft} regenerate={regenerate} statusEditable={false} />
          {problems.length > 0 && (
            <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              <p className="font-semibold">Fix before saving:</p>
              <ul className="mt-1 list-disc pl-5">
                {problems.slice(0, 6).map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 4 && saved && (
        <div className="surface-card mx-auto max-w-xl rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
          <CheckCircle2 aria-hidden className="mx-auto h-12 w-12 text-success" />
          <h2 className="mt-3 text-xl font-semibold text-foreground">{saved.published ? 'Course published' : 'Saved as a draft'}</h2>
          <p className="mt-1 text-sm text-muted">
            {saved.published
              ? cls?.status === 'draft'
                ? `It is live as soon as ${cls.title} is published.`
                : 'Learners can open it now on the website, /classes, the dashboard and Courses.'
              : 'Only administrators can see it. Review it in the course editor, then publish.'}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href={`/admin/courses/${classLevel}/${subject!.key}`} className="btn-primary inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-accent-foreground">
              Open Course Editor
            </Link>
            <Link href="/admin/courses" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover">
              Manage Courses
            </Link>
            {saved.published && cls?.status === 'visible' && (
              <a href={`/classes/${cls.slug}/${subject!.key}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover">
                <ExternalLink aria-hidden className="h-4 w-4" />
                View public page
              </a>
            )}
          </div>
        </div>
      )}

      {step < 4 && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <Button type="button" variant="secondary" className="gap-1.5" disabled={step === 0 || running || save.isPending} onClick={() => setStep((s) => (s === 3 ? 1 : s - 1))}>
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Back
          </Button>
          <div className="flex flex-wrap gap-2">
            {step < 2 && (
              <Button type="button" className="gap-1.5" disabled={step === 0 ? !step1Ready : !brief} onClick={() => setStep((s) => s + 1)}>
                Continue
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Button>
            )}
            {step === 2 && (
              <Button type="button" className="gap-1.5" disabled={running || !chosenEngine} isLoading={stages.some((s) => s.state === 'running')} onClick={() => void generate(!genError)}>
                <Wand2 aria-hidden className="h-4 w-4" />
                Generate Course
              </Button>
            )}
            {step === 3 && (
              <>
                <Button type="button" variant="ghost" className="gap-1.5" disabled={save.isPending} onClick={() => setStep(2)}>
                  <RefreshCw aria-hidden className="h-4 w-4" />
                  Regenerate
                </Button>
                <Button type="button" variant="secondary" className="gap-1.5" disabled={problems.length > 0} isLoading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>
                  <Save aria-hidden className="h-4 w-4" />
                  Save as Draft
                </Button>
                <Button type="button" className="gap-1.5" disabled={problems.length > 0} isLoading={save.isPending && save.variables === true} onClick={() => save.mutate(true)}>
                  <Send aria-hidden className="h-4 w-4" />
                  Publish
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
