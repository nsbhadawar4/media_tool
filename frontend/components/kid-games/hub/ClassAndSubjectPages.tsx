'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { BookOpen, Flame, Gamepad2, Search, SearchX, Sparkles, Target, Trophy } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { SearchInput } from '@/components/ui/SearchInput';
import { Tabs } from '@/components/ui/Tabs';
import { CLASS_INFO, SUBJECT_INFO, classFromSlug, gameHref, isSubject } from '@/lib/kid-games/catalog';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { GenericSubjectCard } from '../cards/GenericCards';
import { CoursesSection, GenericClassPage, GenericSubjectPage } from './GenericPages';
import { currentStreak, nextInSubject, summarise, useKidProgress } from '@/lib/kid-games/progress';
import type { ClassLevel, Difficulty, Subject } from '@/lib/kid-games/types';
import { KidGameCard, SubjectCard } from '../cards/KidCards';
import { classStyle, subjectStyle } from '../theme';
import { KidBackLink, KidEmptyState, KidFloatingShapes, KidProgressBar, KidProgressRing, KidStars, KidStat } from '../shared/KidUi';
import { ProgressLoadError } from './ProgressLoadError';
import { dayCount } from '../theme';

function NotFound({ unavailable = false }: { unavailable?: boolean }) {
  return (
    <EmptyState
      icon={SearchX}
      title={unavailable ? 'Not available right now' : 'Page not found'}
      description={unavailable ? 'This class or subject has been switched off for now. Pick another from Kid Games.' : 'There is no such class or subject. Pick one from Kid Games.'}
      action={
        <Link href="/kid-games" className="btn-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-medium text-accent-foreground">
          Back to Kid Games
        </Link>
      }
    />
  );
}

/** /kid-games/class-N: the class's numbers, then its three subjects. */
export function KidClassPage({ classSlug }: { classSlug: string }) {
  const progress = useKidProgress();
  const catalog = useContentCatalog();
  // Any class the catalog has (Classes 1–5, or one an administrator added), if it's enabled.
  const view = catalog.classBySlug(classSlug);
  if (!view) {
    if (!catalog.settled) return <FullPageSpinner />;
    return <NotFound unavailable={classFromSlug(classSlug) !== null} />;
  }
  if (!view.isCode) return <GenericClassPage view={view} />;
  const level = view.level as ClassLevel;
  const subjects = catalog.subjectsFor(level);
  const info = CLASS_INFO[level];
  const summary = summarise(progress, level);

  return (
    <div style={classStyle(level)} className="space-y-8">
      <div>
        <KidBackLink href="/kid-games" label="All classes" />
        <section className="kg-wash relative overflow-hidden rounded-4xl border border-border bg-surface p-5 shadow-card sm:p-8">
          <KidFloatingShapes />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span aria-hidden className="kg-gradient kg-bob flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lift sm:h-20 sm:w-20">
                <info.icon className="h-9 w-9 sm:h-11 sm:w-11" strokeWidth={1.75} />
              </span>
              <div>
                <p className="kg-text text-xs font-bold uppercase tracking-[0.16em]">Class {level}</p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Let&apos;s Learn &amp; Play!</h1>
                <p className="text-sm text-muted sm:text-base">{info.tagline} • 30 games in Hindi, English and Maths</p>
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-3xl border border-border bg-surface-elevated/80 p-4 shadow-card">
              <KidProgressRing value={summary.percent} label={`Class ${level} progress`} size={84} stroke={9}>
                <span>
                  <span className="block text-lg leading-none">{summary.percent}%</span>
                  <span className="text-[10px] font-medium text-muted">done</span>
                </span>
              </KidProgressRing>
              <div>
                <p className="text-sm font-bold text-foreground">Learning Progress</p>
                <p className="text-sm tabular-nums text-muted">
                  {summary.completed} / {summary.total} games completed
                </p>
                <div className="mt-1">
                  <KidStars value={Math.round((summary.stars / Math.max(1, summary.maxStars)) * 3)} size="md" />
                </div>
              </div>
            </div>
          </div>
          <div className="relative mt-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <KidStat icon={Sparkles} label="Class XP" value={summary.xp.toLocaleString('en-IN')} tone="bg-amber-400/15 text-amber-500" />
            <KidStat icon={Flame} label="Daily Streak" value={dayCount(currentStreak(progress))} tone="bg-orange-500/15 text-orange-500" />
            <KidStat icon={Trophy} label="Best Score" value={summary.bestScore ?? '—'} tone="bg-violet-500/15 text-violet-400" />
            <KidStat icon={Target} label="Completed" value={`${summary.completed} / ${summary.total}`} tone="bg-emerald-500/15 text-emerald-500" />
          </div>
        </section>
      </div>

      {progress.isError && <ProgressLoadError onRetry={progress.refetch} />}

      <section aria-labelledby="kg-subjects">
        <h2 id="kg-subjects" className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <BookOpen aria-hidden className="kg-text h-5 w-5" />
          Choose a subject
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
          {subjects.map((s, i) =>
            s.isCode ? (
              <SubjectCard key={s.key} classLevel={level} subject={s.key as Subject} summary={summarise(progress, level, s.key as Subject)} index={i} title={s.title} />
            ) : (
              <GenericSubjectCard
                key={s.key}
                classKey={view.key}
                view={s}
                courseCount={catalog.coursesFor(level, s.key).length}
                gameCount={catalog.listedGames(level, s.key).length}
                index={i}
              />
            ),
          )}
        </div>
        <ul className="mt-5 grid gap-2 text-sm md:grid-cols-3">
          {subjects.filter((s) => s.isCode).map(({ key }) => key as Subject).map((subject) => (
            <li key={subject} style={subjectStyle(subject)} className="kg-tint rounded-2xl px-4 py-3">
              <span className="kg-text font-bold">You will learn:</span>{' '}
              <span className="text-foreground-soft" lang={subject === 'hindi' ? 'hi' : 'en'}>
                {info.focus[subject]}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

type Tab = 'all' | Difficulty | 'completed';

const SUBJECT_HEADLINE: Record<Subject, string> = {
  hindi: 'Learn Hindi by Playing!',
  english: 'Learn English by Playing!',
  math: 'Learn Maths by Playing!',
};

/** /kid-games/class-N/subject: the ten games, with search and difficulty/completed tabs. */
export function KidSubjectPage({ classSlug, subjectSlug }: { classSlug: string; subjectSlug: string }) {
  const level = classFromSlug(classSlug);
  const progress = useKidProgress();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const subject: Subject | null = isSubject(subjectSlug) ? subjectSlug : null;
  const catalog = useContentCatalog();
  const classView = catalog.classBySlug(classSlug);
  const subjectView = catalog.subjectView(subjectSlug);
  const games = useMemo(() => (level && subject ? catalog.listedGames(level as ClassLevel, subject) : []), [level, subject, catalog]);

  const matchesTab = (value: Tab, gameId: string, difficulty: Difficulty) =>
    value === 'all' ? true : value === 'completed' ? Boolean(progress.games[gameId]?.completed) : difficulty === value;

  const tabs = (['all', 'easy', 'medium', 'hard', 'completed'] as const).map((value) => ({
    value,
    label: value[0].toUpperCase() + value.slice(1),
    count: games.filter((g) => matchesTab(value, g.id, g.difficulty)).length,
  }));

  const q = query.trim().toLowerCase();
  const visible = games.filter((g) => matchesTab(tab, g.id, g.difficulty) && (q === '' || `${g.title} ${g.gloss ?? ''} ${g.description}`.toLowerCase().includes(q)));

  if (!classView || !subjectView) {
    if (!catalog.settled) return <FullPageSpinner />;
    return <NotFound unavailable={Boolean(level && subject)} />;
  }
  // The class has to offer the subject, and both (and that link) be switched on.
  if (!catalog.isPairAvailable(classView.level, subjectView.key)) return <NotFound unavailable />;
  if (!level || !subject || !classView.isCode || !subjectView.isCode) return <GenericSubjectPage classView={classView} subject={subjectView} />;
  const info = SUBJECT_INFO[subject];
  const summary = summarise(progress, level, subject);
  const next = nextInSubject(progress, level, subject);

  return (
    <div style={subjectStyle(subject)} className="space-y-6">
      <div>
        <KidBackLink href={`/kid-games/class-${level}`} label={`Back to Class ${level}`} />
        <section className="kg-wash relative overflow-hidden rounded-4xl border border-border bg-surface p-5 shadow-card sm:p-7">
          <KidFloatingShapes />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4">
              <span aria-hidden className="kg-gradient kg-bob flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-lift sm:h-20 sm:w-20">
                <info.icon className="h-8 w-8 sm:h-10 sm:w-10" strokeWidth={1.75} />
              </span>
              <div>
                <p className="kg-text text-xs font-bold uppercase tracking-[0.16em]">
                  Class {level} • {games.length} Learning Games
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{info.name}</h1>
                <p className="text-sm font-medium text-foreground-soft sm:text-base">{SUBJECT_HEADLINE[subject]}</p>
              </div>
            </div>
            <div className="w-full rounded-3xl border border-border bg-surface-elevated/80 p-4 shadow-card lg:max-w-sm">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-bold text-foreground">Progress</span>
                <span className="font-semibold tabular-nums text-muted">
                  {summary.completed} / {summary.total} completed
                </span>
              </div>
              <KidProgressBar value={summary.percent} label={`${info.name} progress`} size="lg" />
              <Link href={gameHref(next)} className="kg-btn mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold">
                <Gamepad2 aria-hidden className="h-4 w-4" />
                <span className="truncate">
                  {summary.completed === 0 ? 'Start' : summary.completed === summary.total ? 'Play again' : 'Next up'}:{' '}
                  <span lang={subject === 'hindi' ? 'hi' : 'en'}>{next.title}</span>
                </span>
              </Link>
            </div>
          </div>
          <div className="relative mt-5 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <KidStat icon={Sparkles} label="XP earned" value={summary.xp.toLocaleString('en-IN')} tone="bg-amber-400/15 text-amber-500" />
            <KidStat icon={Trophy} label="Best Score" value={summary.bestScore ?? '—'} tone="bg-violet-500/15 text-violet-400" />
            <KidStat icon={Flame} label="Daily Streak" value={dayCount(currentStreak(progress))} tone="bg-orange-500/15 text-orange-500" />
            <KidStat icon={Gamepad2} label="Completed" value={`${summary.completed} / ${summary.total}`} tone="bg-emerald-500/15 text-emerald-500" />
          </div>
        </section>
      </div>

      {progress.isError && <ProgressLoadError onRetry={progress.refetch} />}

      <CoursesSection level={level} subject={subject} />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={query} onChange={setQuery} placeholder={`Search ${info.name} games…`} className="lg:max-w-xs" />
        <Tabs tabs={tabs} value={tab} onChange={setTab} aria-label="Filter games by difficulty" />
      </div>

      {visible.length === 0 ? (
        <KidEmptyState
          icon={tab === 'completed' && q === '' ? Trophy : Search}
          title={tab === 'completed' && q === '' ? 'No completed games yet' : 'No games here yet'}
          description={
            tab === 'completed' && q === ''
              ? 'Finish a game with at least one star and it will show up here.'
              : 'Try another difficulty or continue your learning journey.'
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  setTab('all');
                  setQuery('');
                }}
                className="kg-btn min-h-11 rounded-2xl px-5 text-sm font-bold"
              >
                View All Games
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab('easy');
                  setQuery('');
                }}
                className="min-h-11 rounded-2xl border border-border-strong bg-surface-elevated px-5 text-sm font-bold text-foreground transition hover:bg-surface-hover"
              >
                Easy games
              </button>
            </>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.map((game, i) => (
            <KidGameCard key={game.id} game={game} record={progress.games[game.id]} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
