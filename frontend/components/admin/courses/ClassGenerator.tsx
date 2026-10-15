'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Eye,
  ImagePlus,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import {
  ADMIN_CLASSES_KEY,
  adminClassesApi,
  type AdminClass,
  type ChapterDifficulty,
  type ClassBrief,
  type ClassDifficulty,
  type ClassLanguage,
  type CurriculumChapter,
  type CurriculumSubject,
  type CurriculumType,
  type FreeResource,
} from '@/lib/api/adminClasses';
import { ApiError } from '@/lib/api/client';
import { adminContentApi } from '@/lib/api/adminContent';
import { CONTENT_CATALOG_KEY } from '@/lib/content/useContentCatalog';
import { useNavigationRouter } from '@/lib/navigation/progress';
import { useToast } from '@/lib/toast/ToastContext';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { classPicture } from '@/components/kid-games/cards/ClassCourseCard';
import { CurriculumView, formatMinutes } from '@/components/courses/CurriculumView';
import { UPLOAD_MAX_BYTES, shrinkImage } from './ClassEditor';
import { cn } from '@/utils/cn';

const field =
  'w-full rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus-glow hover:border-border-strong';

const STEPS = ['Basic Info', 'Smart Subjects', 'Courses', 'Resources', 'Preview', 'Publish'] as const;

const LANGUAGES: Array<{ value: ClassLanguage; label: string }> = [
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'bilingual', label: 'Hindi + English' },
  { value: 'other', label: 'Other' },
];
const CURRICULA: Array<{ value: CurriculumType; label: string }> = [
  { value: 'general', label: 'General School Curriculum' },
  { value: 'mathematics', label: 'Mathematics Focus' },
  { value: 'science', label: 'Science Focus' },
  { value: 'language', label: 'Language Focus' },
  { value: 'competitive', label: 'Competitive Learning' },
  { value: 'skills', label: 'Skill Development' },
  { value: 'custom', label: 'Custom' },
];
const LEVELS: Array<{ value: ClassDifficulty; label: string }> = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];
const CHAPTER_LEVELS: Array<{ value: ChapterDifficulty; label: string }> = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Challenging' },
];

/** The stages shown while the generator works (the real request runs underneath). */
const STAGES_SUBJECTS = ['Analyzing your class...', 'Detecting subjects...', 'Building curriculum...'];
const STAGES_CHAPTERS = ['Creating course structure...', 'Preparing learning activities...', 'Ready to publish'];
const STAGES_RESOURCES = ['Finding free resources...'];

interface SubjectDraft {
  id: string;
  key: string;
  title: string;
  description: string;
  glyph: string;
  difficulty: ChapterDifficulty;
  estimatedMinutes: number;
  chapterCount: number;
  activityCount: number;
  reason: string;
  /** A shared subject that already exists: its name stays as it is everywhere. */
  existing: boolean;
  /** Added by the administrator: keyed by its name (suggestions keep the generator's key). */
  manual?: boolean;
}

interface ResourceState {
  status: 'idle' | 'loading' | 'done' | 'error';
  items: FreeResource[];
  chosen: string[];
  unavailable: string[];
}

/** Common names for the shared subjects' keys. */
const SUBJECT_ALIASES: Record<string, string> = {
  maths: 'math',
  mathematics: 'math',
  math: 'math',
  'हिंदी': 'hindi',
  'हिन्दी': 'hindi',
  'social-studies': 'social-science',
  sst: 'social-science',
  gk: 'general-knowledge',
  evs: 'environment',
};

let seq = 0;
const nextId = () => `s${seq++}`;

/** "Computer Science" → "computer-science" (the server derives new subject keys the same way). */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** Cycles through progress messages while `active`, then holds on the last one. */
function useStages(active: boolean, stages: readonly string[]) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setI((n) => Math.min(n + 1, stages.length - 1)), 650);
    return () => {
      window.clearInterval(id);
      setI(0);
    };
  }, [active, stages]);
  return stages[i]!;
}

/**
 * Admin → Manage Courses → Create Class (and "Generate Curriculum" for an existing class).
 *
 * The administrator describes the class; the server's curriculum generator suggests subjects from
 * what was written, then builds chapters with lessons, practice and quizzes; free resources can be
 * attached; everything is previewed; then the class is saved as a draft or published. Nothing is
 * stored before the last step, and publishing happens only after the curriculum is saved.
 */
export function ClassGenerator({ cls, takenLevels }: { cls?: AdminClass; takenLevels: number[] }) {
  const router = useNavigationRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const editing = Boolean(cls);
  const firstFree = useMemo(() => {
    for (let n = 1; n <= 12; n++) if (!takenLevels.includes(n)) return n;
    return 12;
  }, [takenLevels]);

  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  // Step 1
  const [classLevel, setClassLevel] = useState(String(cls?.classLevel ?? firstFree));
  const [title, setTitle] = useState(cls?.title ?? `Class ${cls?.classLevel ?? firstFree}`);
  const [titleTouched, setTitleTouched] = useState(editing);
  const [subtitle, setSubtitle] = useState(cls?.subtitle ?? '');
  const [description, setDescription] = useState(cls?.description ?? '');
  const [details, setDetails] = useState(cls?.details ?? '');
  const [learningGoal, setLearningGoal] = useState(cls?.profile?.learningGoal ?? '');
  const [targetAge, setTargetAge] = useState(cls?.profile?.targetAge ?? '');
  const [language, setLanguage] = useState<ClassLanguage>(cls?.profile?.language ?? 'bilingual');
  const [curriculumType, setCurriculumType] = useState<CurriculumType>(cls?.profile?.curriculumType ?? 'general');
  const [difficulty, setDifficulty] = useState<ClassDifficulty>(cls?.profile?.difficulty ?? (Number(classLevel) <= 2 ? 'beginner' : Number(classLevel) <= 5 ? 'elementary' : 'intermediate'));
  const [image, setImage] = useState<string | null>(cls?.image ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Step 2
  const [subjects, setSubjects] = useState<SubjectDraft[]>(
    () =>
      cls?.subjects.map((s) => ({
        id: nextId(),
        key: s.key,
        title: s.title,
        description: s.classDescription || s.description,
        glyph: s.glyph ?? '',
        difficulty: s.difficulty ?? 'medium',
        estimatedMinutes: s.estimatedMinutes ?? 0,
        chapterCount: s.chapters,
        activityCount: 0,
        reason: 'Already in this class',
        existing: true,
      })) ?? [],
  );
  const [subjectsEdited, setSubjectsEdited] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  // Step 3
  const [chapters, setChapters] = useState<Record<string, CurriculumChapter[]>>({});
  const [chaptersEdited, setChaptersEdited] = useState<Record<string, boolean>>({});
  const [regenSubject, setRegenSubject] = useState<string | null>(null);
  const [openSubject, setOpenSubject] = useState<string | null>(null);
  // Step 4
  const [resources, setResources] = useState<Record<string, ResourceState>>({});
  // Step 6
  const [savedLevel, setSavedLevel] = useState<number | null>(editing ? cls!.classLevel : null);
  const [result, setResult] = useState<{ status: 'draft' | 'published'; level: number; slug: string } | null>(null);

  const level = Number(classLevel) || 1;
  const brief: ClassBrief = useMemo(
    () => ({ classLevel: level, title: title.trim() || `Class ${level}`, subtitle: subtitle.trim(), description: description.trim(), details: details.trim(), learningGoal: learningGoal.trim(), targetAge: targetAge.trim(), language, curriculumType, difficulty }),
    [level, title, subtitle, description, details, learningGoal, targetAge, language, curriculumType, difficulty],
  );

  // Subjects that already exist (shared by every class), to add them or match typed names to them.
  const catalogSubjects = useQuery({
    queryKey: ['admin', 'content', 'taxonomy', 'subject'],
    queryFn: async () => (await adminContentApi.list({ type: 'subject', status: 'live', sort: 'order', limit: 100 })).data,
    staleTime: 30_000,
  });

  // An existing class's saved chapters are the starting point for its courses step.
  const existingCurriculum = useQuery({
    queryKey: [...ADMIN_CLASSES_KEY, 'curriculum', cls?.classLevel],
    queryFn: async () => (await adminClassesApi.curriculum(cls!.classLevel)).data,
    enabled: editing,
  });
  const loadedExisting = useRef(false);
  useEffect(() => {
    if (!existingCurriculum.data || loadedExisting.current) return;
    loadedExisting.current = true;
    const next: Record<string, CurriculumChapter[]> = {};
    const res: Record<string, ResourceState> = {};
    for (const s of existingCurriculum.data.subjects) {
      if (s.chapters.length) next[s.key] = s.chapters;
      if (s.resources.length) res[s.key] = { status: 'done', items: s.resources, chosen: s.resources.map((r) => r.url), unavailable: [] };
    }
    setChapters((c) => ({ ...next, ...c }));
    setResources((r) => ({ ...res, ...r }));
  }, [existingCurriculum.data]);

  // ---------------------------------------------------------------- generation calls

  const suggest = useMutation({
    mutationFn: () => adminClassesApi.suggestSubjects(brief),
    onSuccess: (res) => {
      setSubjects(
        res.data.subjects.map((s) => ({
          id: nextId(),
          key: s.key,
          title: s.title,
          description: s.description,
          glyph: s.glyph,
          difficulty: s.difficulty,
          estimatedMinutes: s.estimatedMinutes,
          chapterCount: s.chapterCount,
          activityCount: s.activityCount,
          reason: s.reason,
          existing: s.existing,
        })),
      );
      setSubjectsEdited(false);
      // New subjects mean new courses: drop chapters of subjects no longer in the list.
      setChapters((c) => Object.fromEntries(Object.entries(c).filter(([k]) => res.data.subjects.some((s) => s.key === k))));
    },
    onError: (err) => toast.error(messageOf(err, 'Could not suggest subjects')),
  });

  const build = useMutation({
    mutationFn: (list: SubjectDraft[]) =>
      adminClassesApi.buildChapters(
        brief,
        list.map((s) => ({ key: s.key, title: s.title, difficulty: s.difficulty, ...(s.chapterCount > 0 ? { chapterCount: Math.min(15, s.chapterCount) } : {}) })),
      ),
    onSuccess: (res) => {
      setChapters((c) => ({ ...c, ...Object.fromEntries(res.data.subjects.map((s) => [s.key, s.chapters])) }));
      setChaptersEdited((e) => ({ ...e, ...Object.fromEntries(res.data.subjects.map((s) => [s.key, false])) }));
    },
    onError: (err) => toast.error(messageOf(err, 'Could not build the chapters')),
  });

  const findResources = async (list: SubjectDraft[]) => {
    for (const s of list) {
      setResources((r) => ({ ...r, [s.key]: { status: 'loading', items: [], chosen: [], unavailable: [] } }));
      try {
        const res = await adminClassesApi.findResources(s.title, { classLevel: level });
        const items = res.data.resources;
        setResources((r) => ({ ...r, [s.key]: { status: 'done', items, chosen: items.slice(0, 4).map((i) => i.url), unavailable: res.data.unavailable } }));
      } catch {
        setResources((r) => ({ ...r, [s.key]: { status: 'error', items: [], chosen: [], unavailable: ['Open Library', 'Wikimedia Commons'] } }));
      }
    }
  };
  const resourcesLoading = Object.values(resources).some((r) => r.status === 'loading');

  const subjectStage = useStages(suggest.isPending, STAGES_SUBJECTS);
  const chapterStage = useStages(build.isPending, STAGES_CHAPTERS);
  const resourceStage = useStages(resourcesLoading, STAGES_RESOURCES);

  // ---------------------------------------------------------------- image

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose a JPG, PNG, WebP or GIF image');
      const small = await shrinkImage(file);
      if (small.size > UPLOAD_MAX_BYTES) throw new Error('This image is too large. Choose one under 4 MB.');
      return adminClassesApi.uploadImage(small);
    },
    onMutate: () => setUploadError(''),
    onSuccess: (res) => {
      setImage(res.data.url);
      toast.success('Image uploaded');
    },
    onError: (err) => {
      setUploadError(`Upload failed: ${messageOf(err, 'please try again')}`);
      toast.error(messageOf(err, 'The image could not be uploaded'));
    },
  });

  // ---------------------------------------------------------------- validation & navigation

  /** A field's message goes as soon as the field is edited. */
  const clearError = (key: string) => setErrors((e) => (e[key] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== key)) : e));

  const validateBasics = (): boolean => {
    const e: Record<string, string> = {};
    const n = Number(classLevel);
    if (!editing) {
      if (!classLevel.trim()) e.classLevel = 'Class number is required';
      else if (!Number.isInteger(n) || n < 1) e.classLevel = 'Use a positive whole number';
      else if (n > 12) e.classLevel = 'Class numbers go up to 12';
      else if (takenLevels.includes(n) && n !== savedLevel) e.classLevel = `Class ${n} already exists (it may be archived)`;
    }
    if (!title.trim()) e.title = 'Title is required';
    if (!description.trim()) e.description = 'Description is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateSubjects = (): boolean => {
    const e: Record<string, string> = {};
    if (!subjects.length) e.subjects = 'Add at least one subject';
    const seen = new Map<string, number>();
    subjects.forEach((s, i) => {
      if (!s.title.trim()) e[`subject-${s.id}`] = 'Subject name is required';
      const k = keyFor(s);
      if (!k && s.title.trim()) e[`subject-${s.id}`] = 'Use letters or numbers in the name';
      if (k && seen.has(k)) e[`subject-${s.id}`] = 'This subject is already in the list';
      seen.set(k, i);
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goTo = (target: number) => {
    if (target > step) {
      if (step === 0 && !validateBasics()) return toast.error('Please fix the highlighted fields');
      if (step <= 1 && target >= 2 && !validateSubjects()) return toast.error('Please check the subjects');
    }
    setStep(target);
    setReached((r) => Math.max(r, target));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Entering a step starts its work when there is nothing yet.
    if (target === 1 && !subjects.length && !suggest.isPending) suggest.mutate();
    if (target === 2) {
      const missing = finalSubjects().filter((s) => !chapters[s.key]?.length);
      if (missing.length && !build.isPending) build.mutate(missing);
    }
    if (target === 3) {
      const missing = finalSubjects().filter((s) => !resources[s.key]);
      if (missing.length) void findResources(missing);
    }
  };

  /**
   * The key a subject is saved under. Suggestions keep the generator's key; a subject typed in by
   * the administrator reuses an existing shared subject with that name ("Mathematics", "Maths" →
   * the one Classes 1–5 use) and is otherwise keyed by its name.
   */
  const keyFor = (s: SubjectDraft) => {
    if (!s.manual) return s.key;
    const name = s.title.trim().toLowerCase();
    const slug = slugify(s.title);
    const alias = SUBJECT_ALIASES[name] ?? SUBJECT_ALIASES[slug];
    const shared = (catalogSubjects.data ?? []).find((c) => c.title.trim().toLowerCase() === name || c.key === slug || c.key === alias);
    return shared?.key ?? alias ?? slug;
  };
  const availableShared = (catalogSubjects.data ?? []).filter((c) => !subjects.some((s) => keyFor(s) === c.key));
  /** Subjects as they will be saved. */
  const finalSubjects = () => subjects.map((s) => ({ ...s, key: keyFor(s) || s.key }));

  const editSubject = (id: string, patch: Partial<SubjectDraft>) => {
    setSubjects((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setSubjectsEdited(true);
  };
  const moveSubject = (i: number, by: -1 | 1) => {
    setSubjects((list) => {
      const next = [...list];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row!);
      return next;
    });
    setSubjectsEdited(true);
  };

  const editChapter = (key: string, i: number, patch: Partial<CurriculumChapter>) => {
    setChapters((c) => ({ ...c, [key]: (c[key] ?? []).map((ch, j) => (j === i ? { ...ch, ...patch } : ch)) }));
    setChaptersEdited((e) => ({ ...e, [key]: true }));
  };
  const moveChapter = (key: string, i: number, by: -1 | 1) => {
    setChapters((c) => {
      const next = [...(c[key] ?? [])];
      const [row] = next.splice(i, 1);
      next.splice(i + by, 0, row!);
      return { ...c, [key]: next };
    });
    setChaptersEdited((e) => ({ ...e, [key]: true }));
  };

  // ---------------------------------------------------------------- saving

  const preview: CurriculumSubject[] = finalSubjects().map((s) => ({
    key: s.key,
    title: s.title,
    description: s.description,
    glyph: s.glyph || null,
    difficulty: s.difficulty,
    estimatedMinutes: (chapters[s.key] ?? []).reduce((n, c) => n + (c.estimatedMinutes ?? 0), 0) || null,
    games: 0,
    resources: (resources[s.key]?.items ?? []).filter((r) => resources[s.key]!.chosen.includes(r.url)),
    chapters: chapters[s.key] ?? [],
  }));
  const emptySubjects = preview.filter((s) => s.chapters.length === 0).map((s) => s.title);

  const save = useMutation({
    mutationFn: async (publish: boolean) => {
      const rows = preview.map((s, i) => {
        const draft = finalSubjects()[i]!;
        return {
          key: s.key,
          title: s.title.trim(),
          description: s.description.trim().slice(0, 500),
          glyph: draft.glyph.trim() ? draft.glyph.trim().slice(0, 12) : null,
          isVisible: true,
          difficulty: draft.difficulty,
          estimatedMinutes: s.estimatedMinutes,
        };
      });
      const classFields = {
        title: title.trim(),
        subtitle: subtitle.trim(),
        description: description.trim(),
        details: details.trim(),
        image,
        subjectMode: 'class' as const,
        profile: { learningGoal: learningGoal.trim(), targetAge: targetAge.trim(), language, curriculumType, difficulty },
        subjects: rows,
      };
      let target = savedLevel;
      if (target === null) {
        // A new class is created as a draft first; it is published only after its curriculum is saved.
        await adminClassesApi.create({ ...classFields, classLevel: level, isVisible: true, status: 'draft' });
        target = level;
        setSavedLevel(level);
      } else {
        await adminClassesApi.update(target, classFields);
      }
      await adminClassesApi.saveCurriculum(
        target,
        preview.map((s) => ({ key: s.key, chapters: s.chapters.map(stripForSave), resources: s.resources })),
      );
      const done = await adminClassesApi.setStatus(target, publish ? 'published' : 'draft');
      return done.data;
    },
    onSuccess: (data, publish) => {
      void queryClient.invalidateQueries({ queryKey: ADMIN_CLASSES_KEY });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'content'] });
      void queryClient.invalidateQueries({ queryKey: CONTENT_CATALOG_KEY });
      setResult({ status: publish ? 'published' : 'draft', level: data.classLevel, slug: data.slug });
      setStep(5);
      setReached(5);
      toast.success(publish ? `${data.title} is published` : `${data.title} saved as a draft`);
    },
    onError: (err) => {
      if (err instanceof ApiError && Array.isArray(err.details)) {
        const paths = (err.details as Array<{ path?: string; message?: string }>).map((d) => d.message).filter(Boolean);
        toast.error(paths.length ? `${err.message}: ${paths.join('; ')}` : err.message);
      } else toast.error(messageOf(err, 'Could not save the class'));
    },
  });

  // ---------------------------------------------------------------- render

  const picture = classPicture(level, image, title || `Class ${level}`, cls?.builtIn ?? false);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/courses" className="group mb-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          Manage Courses
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          <Wand2 aria-hidden className="h-6 w-6 text-accent" />
          {editing ? `Generate Curriculum — ${cls!.title}` : 'Create Class'}
        </h1>
        <p className="mt-1 text-sm text-muted">Describe the class; the generator suggests subjects and builds chapters, lessons, practice and quizzes for you to review.</p>
      </div>

      <Stepper step={step} reached={reached} onGo={(i) => (i <= reached && step !== 5 ? goTo(i) : undefined)} />

      {step === 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <Card title="Basic information" hint="The generator reads all of this to decide subjects and chapters.">
            <div className="grid gap-4 sm:grid-cols-[150px_minmax(0,1fr)]">
              <Field label="Class / Grade Number" id="g-level" required error={errors.classLevel} hint={editing ? 'Fixed for an existing class' : '1 to 12'}>
                <input
                  id="g-level"
                  type="number"
                  min={1}
                  max={12}
                  inputMode="numeric"
                  disabled={editing}
                  className={cn(field, editing && 'cursor-not-allowed opacity-70')}
                  value={classLevel}
                  onChange={(e) => {
                    setClassLevel(e.target.value);
                    if (!titleTouched) setTitle(`Class ${e.target.value}`.trim());
                    clearError('classLevel');
                  }}
                  aria-invalid={Boolean(errors.classLevel)}
                />
              </Field>
              <Field label="Class Title" id="g-title" required error={errors.title}>
                <input
                  id="g-title"
                  className={field}
                  maxLength={120}
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleTouched(true);
                    clearError('title');
                  }}
                  placeholder="Class 6"
                  aria-invalid={Boolean(errors.title)}
                />
              </Field>
            </div>
            <Field label="Display Title" id="g-subtitle" hint="e.g. Learn & Grow, Future Ready, Science Explorer">
              <input id="g-subtitle" className={field} maxLength={60} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Future Ready" />
            </Field>
            <Field label="Short Description" id="g-desc" required error={errors.description} hint={`${description.length}/500 — shown on class cards`}>
              <textarea id="g-desc" className={cn(field, 'min-h-20 resize-y')} maxLength={500} value={description} onChange={(e) => { setDescription(e.target.value); clearError('description'); }} aria-invalid={Boolean(errors.description)} />
            </Field>
            <Field label="Full Description" id="g-details" hint={`${details.length}/2000 — shown on the class page`}>
              <textarea id="g-details" className={cn(field, 'min-h-28 resize-y')} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            <Field label="Learning Goal" id="g-goal" hint="Optional — what learners should achieve">
              <textarea id="g-goal" className={cn(field, 'min-h-16 resize-y')} maxLength={1000} value={learningGoal} onChange={(e) => setLearningGoal(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Target Age" id="g-age" hint="Optional, e.g. 11–12 years">
                <input id="g-age" className={field} maxLength={40} value={targetAge} onChange={(e) => setTargetAge(e.target.value)} />
              </Field>
              <Field label="Language" id="g-lang">
                <select id="g-lang" className={field} value={language} onChange={(e) => setLanguage(e.target.value as ClassLanguage)}>
                  {LANGUAGES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Curriculum Type" id="g-type">
                <select id="g-type" className={field} value={curriculumType} onChange={(e) => setCurriculumType(e.target.value as CurriculumType)}>
                  {CURRICULA.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Difficulty" id="g-diff">
                <select id="g-diff" className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value as ClassDifficulty)}>
                  {LEVELS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <Card title="Class image" hint="Optional. Without one, a themed placeholder is shown.">
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-surface-hover">
              {picture ? (
                // eslint-disable-next-line @next/next/no-img-element -- a live preview of the chosen picture
                <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
              ) : (
                <ThemedPlaceholder level={level} marks={subjects.map((s) => s.glyph).filter(Boolean).slice(0, 4)} />
              )}
              {upload.isPending && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
                e.target.value = '';
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                {image ? <RefreshCw aria-hidden className="h-4 w-4" /> : <Upload aria-hidden className="h-4 w-4" />}
                {image ? 'Replace' : 'Upload'}
              </Button>
              {image && (
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setImage(null)}>
                  <X aria-hidden className="h-4 w-4" />
                  Remove
                </Button>
              )}
            </div>
            {uploadError && (
              <p role="alert" className="text-xs text-danger">
                {uploadError}
              </p>
            )}
          </Card>
        </div>
      )}

      {step === 1 && (
        <Card
          title="Smart Subject Generator"
          hint="Suggested from what you wrote. Edit, remove, reorder or add subjects before building the courses."
          action={
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled={suggest.isPending} onClick={() => (subjectsEdited || subjects.length ? setConfirmRegenerate(true) : suggest.mutate())}>
              <Sparkles aria-hidden className="h-4 w-4" />
              {subjects.length ? 'Regenerate Subjects' : 'Suggest Subjects'}
            </Button>
          }
        >
          {suggest.isPending ? (
            <Working text={subjectStage} />
          ) : (
            <>
              {errors.subjects && <p className="text-sm text-danger">{errors.subjects}</p>}
              {suggest.isError && !subjects.length && (
                <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
                  <span>Couldn&apos;t suggest subjects: {messageOf(suggest.error, 'please try again')}. You can try again or add subjects yourself.</span>
                  <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={() => suggest.mutate()}>
                    <RefreshCw aria-hidden className="h-4 w-4" />
                    Try again
                  </Button>
                </div>
              )}
              {!suggest.isError && !subjects.length && (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">No subjects yet — suggest them from your description, or add your own below.</p>
              )}
              <ol className="grid gap-3 lg:grid-cols-2">
                {subjects.map((s, i) => (
                  <li key={s.id} className="anim-rise rounded-2xl border border-border bg-surface-elevated/60 p-4" style={{ '--i': i } as React.CSSProperties}>
                    <div className="flex items-start gap-3">
                      <input
                        aria-label="Icon"
                        className="h-11 w-14 shrink-0 rounded-xl border border-border bg-surface text-center text-lg outline-none focus-glow"
                        maxLength={12}
                        value={s.glyph}
                        onChange={(e) => editSubject(s.id, { glyph: e.target.value })}
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <input
                          aria-label="Subject name"
                          className={cn(field, 'font-semibold', s.existing && 'cursor-not-allowed opacity-80')}
                          value={s.title}
                          maxLength={60}
                          readOnly={s.existing}
                          title={s.existing ? 'A shared subject — its name is the same in every class' : undefined}
                          onChange={(e) => editSubject(s.id, { title: e.target.value })}
                        />
                        {errors[`subject-${s.id}`] && <p className="text-xs text-danger">{errors[`subject-${s.id}`]}</p>}
                        <textarea
                          aria-label="Subject description"
                          className={cn(field, 'min-h-16 resize-y')}
                          maxLength={500}
                          value={s.description}
                          onChange={(e) => editSubject(s.id, { description: e.target.value })}
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <label className="text-xs text-muted">
                            Difficulty
                            <select className={cn(field, 'mt-1 py-2')} value={s.difficulty} onChange={(e) => editSubject(s.id, { difficulty: e.target.value as ChapterDifficulty })}>
                              {CHAPTER_LEVELS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="text-xs text-muted">
                            Chapters
                            <input type="number" min={1} max={15} className={cn(field, 'mt-1 py-2')} value={s.chapterCount || ''} onChange={(e) => editSubject(s.id, { chapterCount: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })} />
                          </label>
                          <div className="text-xs text-muted">
                            Est. time
                            <p className="mt-1 py-2 text-sm font-medium text-foreground">{s.estimatedMinutes ? formatMinutes(s.estimatedMinutes) : '—'}</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted">
                          {s.activityCount ? `${s.activityCount} activities · ` : ''}
                          <span className="text-accent">{s.reason}</span>
                          {s.existing ? ' · shared subject' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-1 border-t border-border pt-3">
                      <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => moveSubject(i, -1)} aria-label={`Move ${s.title} up`}>
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" disabled={i === subjects.length - 1} onClick={() => moveSubject(i, 1)} aria-label={`Move ${s.title} down`}>
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:text-danger"
                        onClick={() => {
                          setSubjects((list) => list.filter((x) => x.id !== s.id));
                          setSubjectsEdited(true);
                        }}
                        aria-label={`Remove ${s.title}`}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="max-sm:sr-only">Remove</span>
                      </Button>
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                type="button"
                variant="secondary"
                className="gap-2"
                onClick={() => {
                  setSubjects((list) => [
                    ...list,
                    { id: nextId(), key: `new-${list.length}`, title: '', description: '', glyph: '📘', difficulty: 'medium', estimatedMinutes: 0, chapterCount: 5, activityCount: 0, reason: 'Added by you', existing: false, manual: true },
                  ]);
                  setSubjectsEdited(true);
                }}
              >
                <Plus aria-hidden className="h-4 w-4" />
                Add Subject
              </Button>
              {availableShared.length > 0 && (
                <select
                  aria-label="Add an existing subject"
                  className={cn(field, 'sm:ml-2 sm:inline-block sm:w-72')}
                  value=""
                  onChange={(e) => {
                    const c = availableShared.find((x) => x.key === e.target.value);
                    if (!c) return;
                    setSubjects((list) => [
                      ...list,
                      { id: nextId(), key: c.key, title: c.title, description: c.description, glyph: c.glyph ?? '', difficulty: 'medium', estimatedMinutes: 0, chapterCount: 0, activityCount: 0, reason: 'Shared subject you added', existing: true },
                    ]);
                    setSubjectsEdited(true);
                  }}
                >
                  <option value="">+ Add an existing subject…</option>
                  {availableShared.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
            </>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="Courses & chapters" hint="Each subject gets chapters with lessons, practice activities and a quiz. Rename, reorder, remove or regenerate them.">
          {build.isPending && <Working text={chapterStage} />}
          {build.isError && !build.isPending && (
            <div role="alert" className="flex flex-col gap-3 rounded-xl border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>Couldn&apos;t build the chapters: {messageOf(build.error, 'please try again')}.</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="gap-1.5"
                onClick={() => build.mutate(finalSubjects().filter((s) => !chapters[s.key]?.length))}
              >
                <RefreshCw aria-hidden className="h-4 w-4" />
                Try again
              </Button>
            </div>
          )}
          <div className="space-y-3">
            {finalSubjects().map((s) => {
              const list = chapters[s.key] ?? [];
              const open = openSubject === s.key;
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-surface-elevated/50">
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <span aria-hidden className="text-xl">
                      {s.glyph || '📘'}
                    </span>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenSubject(open ? null : s.key)} aria-expanded={open}>
                      <span className="block font-semibold text-foreground">{s.title}</span>
                      <span className="block text-xs text-muted">
                        {list.length} chapters · {list.reduce((n, c) => n + c.lessons.length, 0)} lessons · {list.reduce((n, c) => n + c.activities.length, 0)} activities
                        {list.length === 0 && !build.isPending ? ' — needs at least one chapter to publish' : ''}
                      </span>
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5"
                      disabled={build.isPending}
                      onClick={() => (chaptersEdited[s.key] ? setRegenSubject(s.key) : build.mutate([s]))}
                    >
                      <RefreshCw aria-hidden className="h-4 w-4" />
                      <span className="max-sm:sr-only">Regenerate</span>
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setOpenSubject(open ? null : s.key)} aria-expanded={open}>
                      {open ? 'Close' : 'Edit'}
                    </Button>
                  </div>
                  {open && (
                    <div className="space-y-2 border-t border-border p-4">
                      {list.map((c, i) => (
                        <div key={`${c.title}-${i}`} className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 sm:flex-row sm:items-start">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-xs font-bold text-accent">{i + 1}</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            <input aria-label="Chapter title" className={cn(field, 'py-2 font-medium')} maxLength={120} value={c.title} onChange={(e) => editChapter(s.key, i, { title: e.target.value })} />
                            <input aria-label="Chapter description" className={cn(field, 'py-2')} maxLength={500} value={c.description} onChange={(e) => editChapter(s.key, i, { description: e.target.value })} />
                            <p className="text-xs text-muted">
                              {c.lessons.length} lessons · {c.activities.length} activities · {c.quiz.length} quiz questions{c.estimatedMinutes ? ` · ${formatMinutes(c.estimatedMinutes)}` : ''}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button type="button" variant="ghost" size="sm" disabled={i === 0} onClick={() => moveChapter(s.key, i, -1)} aria-label="Move chapter up">
                              <ArrowUp className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" disabled={i === list.length - 1} onClick={() => moveChapter(s.key, i, 1)} aria-label="Move chapter down">
                              <ArrowDown className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-danger hover:text-danger"
                              onClick={() => {
                                setChapters((all) => ({ ...all, [s.key]: list.filter((_, j) => j !== i) }));
                                setChaptersEdited((e) => ({ ...e, [s.key]: true }));
                              }}
                              aria-label={`Remove chapter ${c.title}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          setChapters((all) => ({
                            ...all,
                            [s.key]: [...list, { title: `New chapter ${list.length + 1}`, description: '', objectives: [], estimatedMinutes: null, difficulty: s.difficulty, lessons: [], activities: [], quiz: [] }],
                          }));
                          setChaptersEdited((e) => ({ ...e, [s.key]: true }));
                        }}
                      >
                        <Plus aria-hidden className="h-4 w-4" />
                        Add chapter
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card
          title="Free Resources"
          hint="Optional open resources from Open Library and Wikimedia Commons. Only links and credits are saved; they open on their own sites."
          action={
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled={resourcesLoading} onClick={() => void findResources(finalSubjects())}>
              <RefreshCw aria-hidden className="h-4 w-4" />
              Search again
            </Button>
          }
        >
          {resourcesLoading && <Working text={resourceStage} />}
          <div className="space-y-4">
            {finalSubjects().map((s) => {
              const state = resources[s.key];
              return (
                <div key={s.id} className="rounded-2xl border border-border bg-surface-elevated/50 p-4">
                  <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
                    <Library aria-hidden className="h-4 w-4 text-accent" />
                    {s.title}
                    {state?.status === 'done' && <span className="text-xs font-normal text-muted">{state.chosen.length} selected</span>}
                  </p>
                  {!state || state.status === 'loading' ? (
                    <p className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Searching…
                    </p>
                  ) : state.items.length === 0 ? (
                    <p className="text-sm text-muted">
                      {state.unavailable.length ? `Couldn't reach ${state.unavailable.join(' and ')} right now — you can continue without resources.` : 'No free resources found for this subject.'}
                    </p>
                  ) : (
                    <>
                      {state.unavailable.length > 0 && <p className="mb-2 text-xs text-muted">{state.unavailable.join(' and ')} could not be reached; showing the rest.</p>}
                      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {state.items.map((r) => {
                          const on = state.chosen.includes(r.url);
                          return (
                            <li key={r.url}>
                              <label className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors', on ? 'border-accent bg-accent/5' : 'border-border bg-surface')}>
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                                  checked={on}
                                  onChange={() =>
                                    setResources((all) => ({ ...all, [s.key]: { ...state, chosen: on ? state.chosen.filter((u) => u !== r.url) : [...state.chosen, r.url] } }))
                                  }
                                />
                                <span className="min-w-0">
                                  <span className="block text-[11px] uppercase tracking-wider text-muted">{r.type === 'book' ? '📚 Book' : '🖼️ Image'} · {r.source}</span>
                                  <span className="line-clamp-2 text-sm font-medium text-foreground">{r.title}</span>
                                  <span className="block truncate text-xs text-muted">{r.license}</span>
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {step === 4 && (
        <div className="space-y-6">
          <div className="surface-card overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
            <div className="grid gap-0 md:grid-cols-[320px_minmax(0,1fr)]">
              <div className="relative aspect-[4/3] md:aspect-auto">
                {picture ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a preview of the chosen picture
                  <img src={picture.src} alt={picture.alt} className="absolute inset-0 h-full w-full object-cover" style={picture.focus ? { objectPosition: picture.focus } : undefined} />
                ) : (
                  <ThemedPlaceholder level={level} marks={subjects.map((s) => s.glyph).filter(Boolean).slice(0, 4)} />
                )}
              </div>
              <div className="p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-accent">Preview</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
                  {title}
                  {subtitle && <span className="text-muted"> — {subtitle}</span>}
                </h2>
                <p className="mt-2 text-sm text-foreground-soft">{description}</p>
                {details && <p className="mt-2 whitespace-pre-line text-sm text-muted">{details}</p>}
                <ul className="mt-4 flex flex-wrap gap-2 text-xs text-foreground-soft">
                  <Pill>{preview.length} subjects</Pill>
                  <Pill>{preview.reduce((n, s) => n + s.chapters.length, 0)} chapters</Pill>
                  <Pill>{preview.reduce((n, s) => n + s.chapters.reduce((m, c) => m + c.lessons.length, 0), 0)} lessons</Pill>
                  <Pill>{LANGUAGES.find((l) => l.value === language)?.label}</Pill>
                  <Pill>{LEVELS.find((l) => l.value === difficulty)?.label}</Pill>
                  {targetAge && <Pill>{targetAge}</Pill>}
                </ul>
                {learningGoal && <p className="mt-3 text-sm text-muted">Goal: {learningGoal}</p>}
              </div>
            </div>
          </div>
          <CurriculumView subjects={preview} showAnswers />
          {emptySubjects.length > 0 && (
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
              To publish, add at least one chapter to: {emptySubjects.join(', ')}. You can still save it as a draft.
            </p>
          )}
        </div>
      )}

      {step === 5 && result && (
        <div className="surface-card mx-auto max-w-xl rounded-3xl border border-border bg-surface p-8 text-center shadow-card">
          <CheckCircle2 aria-hidden className="mx-auto h-12 w-12 text-success" />
          <h2 className="mt-3 text-xl font-semibold text-foreground">{result.status === 'published' ? 'Class published' : 'Saved as a draft'}</h2>
          <p className="mt-1 text-sm text-muted">
            {result.status === 'published'
              ? 'It now appears on the landing page, its class page and the user dashboard.'
              : 'Only administrators can see it. Publish it from Manage Courses when it is ready.'}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href="/admin/courses" className="btn-primary inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-accent-foreground">
              Back to Manage Courses
            </Link>
            <Link href={`/admin/courses/${result.level}/preview`} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover">
              <Eye aria-hidden className="h-4 w-4" />
              Preview
            </Link>
            {result.status === 'published' && (
              <a href={`/classes/${result.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-surface px-4 text-sm font-medium text-foreground hover:bg-surface-hover">
                Open public page
              </a>
            )}
          </div>
        </div>
      )}

      {step < 5 && (
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border sm:px-4">
          <Button type="button" variant="secondary" className="gap-1.5" onClick={() => (step === 0 ? router.push('/admin/courses') : goTo(step - 1))} disabled={save.isPending}>
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {step === 0 ? 'Cancel' : step === 4 ? 'Back & Edit' : 'Back'}
          </Button>
          {step < 4 ? (
            <Button type="button" className="gap-1.5" onClick={() => goTo(step + 1)} disabled={suggest.isPending || build.isPending || upload.isPending}>
              {step === 3 ? 'Preview' : 'Continue'}
              <ArrowRight aria-hidden className="h-4 w-4" />
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => save.mutate(false)} isLoading={save.isPending && save.variables === false} disabled={save.isPending}>
                Save as Draft
              </Button>
              <Button
                type="button"
                onClick={() => save.mutate(true)}
                isLoading={save.isPending && save.variables === true}
                disabled={save.isPending || emptySubjects.length > 0 || preview.length === 0}
                title={emptySubjects.length ? 'Every subject needs at least one chapter' : undefined}
              >
                Publish Class
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmRegenerate}
        onClose={() => setConfirmRegenerate(false)}
        onConfirm={() => {
          setConfirmRegenerate(false);
          suggest.mutate();
        }}
        title="Regenerate subjects?"
        description="Regenerating will replace the automatically generated subjects. Your manual changes may be lost."
        confirmLabel="Regenerate"
      />
      <ConfirmDialog
        isOpen={regenSubject !== null}
        onClose={() => setRegenSubject(null)}
        onConfirm={() => {
          const s = finalSubjects().find((x) => x.key === regenSubject);
          setRegenSubject(null);
          if (s) build.mutate([s]);
        }}
        title="Regenerate chapters?"
        description="Regenerating will replace this subject's chapters. Your manual changes may be lost."
        confirmLabel="Regenerate"
      />
    </div>
  );
}

/** What is saved for a chapter (the server takes these fields only). */
function stripForSave(c: CurriculumChapter): CurriculumChapter {
  return {
    title: c.title.trim() || 'Untitled chapter',
    description: c.description,
    objectives: c.objectives,
    estimatedMinutes: c.estimatedMinutes,
    difficulty: c.difficulty,
    lessons: c.lessons,
    activities: c.activities,
    quiz: c.quiz.map((q) => ({ prompt: q.prompt, options: q.options, answer: q.answer ?? '' })),
  };
}

function Stepper({ step, reached, onGo }: { step: number; reached: number; onGo: (i: number) => void }) {
  return (
    <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Steps">
      {STEPS.map((label, i) => {
        const done = i < step || (i <= reached && i !== step && i < 5);
        const current = i === step;
        return (
          <li key={label} className="shrink-0">
            <button
              type="button"
              onClick={() => onGo(i)}
              disabled={i > reached}
              aria-current={current ? 'step' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm transition-colors disabled:cursor-default',
                current ? 'border-accent bg-accent/10 font-semibold text-foreground' : done ? 'border-border bg-surface text-foreground-soft hover:bg-surface-hover' : 'border-border bg-surface/50 text-muted',
              )}
            >
              <span className={cn('flex h-6 w-6 items-center justify-center rounded-lg text-[11px] font-bold', current ? 'bg-accent text-accent-foreground' : done ? 'bg-success/15 text-success' : 'bg-surface-hover text-muted')}>
                {done && !current ? <Check aria-hidden className="h-3.5 w-3.5" /> : String(i + 1).padStart(2, '0')}
              </span>
              {label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Card({ title, hint, action, children }: { title: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="anim-rise surface-card rounded-2xl border border-border bg-surface p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, id, hint, error, required, children }: { label: string; id: string; hint?: string; error?: string; required?: boolean; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Pill({ children }: { children: ReactNode }) {
  return <li className="rounded-full border border-border bg-surface-hover/60 px-2.5 py-1">{children}</li>;
}

function Working({ text }: { text: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-foreground">
      <Loader2 aria-hidden className="h-4 w-4 animate-spin text-accent" />
      {text}
    </div>
  );
}

/** A picture-free class card face: the class colours with its subjects' marks. */
export function ThemedPlaceholder({ level, marks }: { level: number; marks: string[] }) {
  const slot = ((Math.max(1, level) - 1) % 5) + 1;
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden" style={{ background: `linear-gradient(135deg, var(--kid-class-${slot}), var(--kid-class-${slot}-2))` }}>
      <span className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/20" />
      <span className="absolute -bottom-12 left-4 h-32 w-32 rounded-full bg-black/10" />
      <span className="absolute inset-0 flex items-center justify-center gap-2 p-6">
        {(marks.length ? marks : ['📘']).map((m, i) => (
          <span key={`${m}-${i}`} className="flex h-14 min-w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15 px-2 text-xl font-bold text-white backdrop-blur-sm">
            {m}
          </span>
        ))}
      </span>
      <span className="absolute bottom-3 left-4 text-sm font-bold uppercase tracking-[0.2em] text-white/90">
        <BookOpen className="mr-1 inline h-4 w-4" />
        Class {level}
      </span>
      <ImagePlus className="sr-only" />
    </div>
  );
}

/** Loads the class list (and, for an existing class, the class), then shows the generator. */
export function ClassGeneratorPage({ level }: { level?: number }) {
  const list = useQuery({ queryKey: [...ADMIN_CLASSES_KEY, 'all'], queryFn: async () => (await adminClassesApi.list('all')).data });
  if (list.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin" />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }
  if (list.isError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">Unable to load classes</p>
        <Button className="mt-4 gap-2" onClick={() => void list.refetch()}>
          <RefreshCw aria-hidden className="h-4 w-4" />
          Try Again
        </Button>
      </div>
    );
  }
  const rows = list.data ?? [];
  const cls = level ? rows.find((c) => c.classLevel === level) : undefined;
  if (level && (!cls || cls.status === 'archived')) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <p className="font-semibold text-foreground">{cls ? 'This class is archived' : 'There is no such class'}</p>
        <Link href="/admin/courses" className="btn-primary mt-4 inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
          Back to Manage Courses
        </Link>
      </div>
    );
  }
  return <ClassGenerator key={cls?.id ?? 'new'} cls={cls} takenLevels={rows.map((c) => c.classLevel)} />;
}
