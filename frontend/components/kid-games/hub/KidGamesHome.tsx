'use client';

import { useMemo, useState } from 'react';
import { Flame, Gamepad2, GraduationCap, Layers, Rocket, Search, Sparkles, Star, Trophy } from 'lucide-react';
import { SearchInput } from '@/components/ui/SearchInput';
import { Select } from '@/components/ui/Select';
import { ALL_GAMES, CLASS_LEVELS, SUBJECT_INFO } from '@/lib/kid-games/catalog';
import { ACHIEVEMENTS, currentStreak, recommendations, summarise, useKidProgress, useSavedSession } from '@/lib/kid-games/progress';
import type { LearningGame } from '@/lib/kid-games/types';
import { ClassCard, KidGameCard } from '../cards/KidCards';
import { AchievementsGrid, ContinueSection, DailyGoalCard, LevelCard, LearningJourney, StreakCard } from '../progress/ProgressWidgets';
import { KidEmptyState, KidFloatingShapes, KidSectionTitle, KidStat, SubjectIcon } from '../shared/KidUi';
import { ProgressLoadError } from './ProgressLoadError';
import { dayCount } from '../theme';

const CLASS_OPTIONS = [{ label: 'All classes', value: '' }, ...CLASS_LEVELS.map((l) => ({ label: `Class ${l}`, value: String(l) }))];
const SUBJECT_OPTIONS = [
  { label: 'All subjects', value: '' },
  { label: 'Hindi', value: 'hindi' },
  { label: 'English', value: 'english' },
  { label: 'Maths', value: 'math' },
];
const DIFFICULTY_OPTIONS = [
  { label: 'Any level', value: '' },
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' },
];
const STATUS_OPTIONS = [
  { label: 'All games', value: '' },
  { label: 'Completed', value: 'done' },
  { label: 'Not completed', value: 'todo' },
];

/** What search matches against: title (and its English gloss), description, subject and class. */
function haystack(game: LearningGame): string {
  return [game.title, game.gloss, game.description, SUBJECT_INFO[game.subject].name, SUBJECT_INFO[game.subject].native, `class ${game.classLevel}`, game.subject === 'math' ? 'maths math' : '']
    .join(' ')
    .toLowerCase();
}

/** /kid-games: the learning hub. */
export function KidGamesHome() {
  const progress = useKidProgress();
  const saved = useSavedSession();
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [status, setStatus] = useState('');

  const filtering = query.trim() !== '' || classFilter !== '' || subjectFilter !== '' || difficulty !== '' || status !== '';

  const results = useMemo(() => {
    if (!filtering) return [];
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return ALL_GAMES.filter((game) => {
      const done = Boolean(progress.games[game.id]?.completed);
      return (
        (!classFilter || game.classLevel === Number(classFilter)) &&
        (!subjectFilter || game.subject === subjectFilter) &&
        (!difficulty || game.difficulty === difficulty) &&
        (!status || (status === 'done' ? done : !done)) &&
        terms.every((term) => haystack(game).includes(term))
      );
    });
  }, [filtering, query, classFilter, subjectFilter, difficulty, status, progress.games]);

  const recommended = useMemo(() => recommendations(progress), [progress]);
  const overall = summarise(progress);
  const earned = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;

  const clear = () => {
    setQuery('');
    setClassFilter('');
    setSubjectFilter('');
    setDifficulty('');
    setStatus('');
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      {/* Hero */}
      <section className="gradient-border relative overflow-hidden rounded-4xl border border-border bg-surface p-5 shadow-card sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_120%_at_100%_0%,color-mix(in_srgb,var(--kid-hindi)_20%,transparent),transparent_60%),radial-gradient(45%_100%_at_50%_120%,color-mix(in_srgb,var(--kid-english)_18%,transparent),transparent_70%),radial-gradient(40%_90%_at_0%_0%,color-mix(in_srgb,var(--kid-math)_16%,transparent),transparent_70%)]"
        />
        <KidFloatingShapes />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_minmax(0,400px)] lg:items-center">
          <div className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-accent-2">
              <GraduationCap aria-hidden className="h-4 w-4" />
              Kid Games
            </p>
            <h1 className="flex flex-wrap items-center gap-x-3 text-[34px] font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
              <span>
                Learn. Play. <span className="bg-linear-to-r from-(--kid-hindi) via-(--kid-english) to-(--kid-math) bg-clip-text text-transparent">Grow!</span>
              </span>
              <Rocket aria-hidden className="kg-bob h-9 w-9 text-(--kid-hindi) sm:h-11 sm:w-11" />
            </h1>
            <p className="mt-2 max-w-lg text-base text-muted sm:text-lg">Fun educational games for curious minds.</p>
            <ul className="mt-4 flex flex-wrap gap-2 text-sm font-semibold" aria-label="What is inside">
              <li className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated/80 px-3 py-1.5 text-foreground-soft">
                <Gamepad2 aria-hidden className="h-4 w-4 text-(--kid-hindi)" />
                150 Games
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated/80 px-3 py-1.5 text-foreground-soft">
                <Layers aria-hidden className="h-4 w-4 text-(--kid-english)" />5 Classes
              </li>
              <li className="flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated/80 px-3 py-1.5 text-foreground-soft">
                <Sparkles aria-hidden className="h-4 w-4 text-(--kid-math)" />3 Subjects
              </li>
              {(['hindi', 'english', 'math'] as const).map((subject) => (
                <li key={subject} className="hidden items-center gap-1.5 rounded-full border border-border bg-surface-elevated/80 px-3 py-1.5 text-foreground-soft sm:flex">
                  <SubjectIcon subject={subject} className="h-4 w-4" />
                  {SUBJECT_INFO[subject].name}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl border border-border bg-surface-elevated/80 p-4 shadow-card backdrop-blur-sm">
            <LevelCard progress={progress} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <KidStat icon={Sparkles} label="Total XP" value={progress.xp.toLocaleString('en-IN')} tone="bg-amber-400/15 text-amber-500" />
              <KidStat icon={Flame} label="Daily Streak" value={dayCount(currentStreak(progress))} tone="bg-orange-500/15 text-orange-500" />
              <KidStat icon={Trophy} label="Achievements" value={`${earned} / ${ACHIEVEMENTS.length}`} tone="bg-violet-500/15 text-violet-400" />
              <KidStat icon={Star} label="Completed" value={`${overall.completed} / ${overall.total}`} tone="bg-emerald-500/15 text-emerald-500" />
            </div>
          </div>
        </div>
      </section>

      {progress.isError && <ProgressLoadError onRetry={progress.refetch} />}

      {/* Continue + today */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr]" aria-label="Your learning today">
        <div className="md:col-span-2 xl:col-span-1">
          <ContinueSection progress={progress} saved={saved} />
        </div>
        <DailyGoalCard progress={progress} />
        <StreakCard progress={progress} />
      </section>

      {/* Classes */}
      <section aria-labelledby="kg-classes">
        <KidSectionTitle id="kg-classes" icon={GraduationCap} title="Choose Your Class" hint="Every class has 30 games: 10 Hindi, 10 English and 10 Maths." />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {CLASS_LEVELS.map((level, i) => (
            <ClassCard key={level} level={level} summary={summarise(progress, level)} index={i} />
          ))}
        </div>
      </section>

      {/* Search, filters, and either results or recommendations */}
      <section aria-labelledby="kg-find">
        <KidSectionTitle id="kg-find" icon={Search} title={filtering ? 'Search results' : 'Find a game'} />
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput value={query} onChange={setQuery} placeholder="Search games, subjects or classes…" className="lg:max-w-sm" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Select aria-label="Class" options={CLASS_OPTIONS} value={classFilter} onChange={(e) => setClassFilter(e.target.value)} className="h-11 lg:h-9" />
            <Select aria-label="Subject" options={SUBJECT_OPTIONS} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} className="h-11 lg:h-9" />
            <Select aria-label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="h-11 lg:h-9" />
            <Select aria-label="Completed" options={STATUS_OPTIONS} value={status} onChange={(e) => setStatus(e.target.value)} className="h-11 lg:h-9" />
          </div>
          {filtering && (
            <button type="button" onClick={clear} className="min-h-11 rounded-xl px-3 text-sm font-semibold text-accent transition hover:underline lg:ml-auto">
              Clear filters
            </button>
          )}
        </div>

        {filtering ? (
          results.length === 0 ? (
            <KidEmptyState
              icon={Search}
              title="No games found"
              description="Try another word, or clear the filters to see every game."
              actions={
                <button type="button" onClick={clear} className="kg-btn min-h-11 rounded-2xl px-5 text-sm font-bold">
                  Show all games
                </button>
              }
            />
          ) : (
            <>
              <p className="mb-3 text-sm font-medium text-muted" aria-live="polite">
                {results.length} {results.length === 1 ? 'game' : 'games'} found
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {results.slice(0, 60).map((game, i) => (
                  <KidGameCard key={game.id} game={game} record={progress.games[game.id]} index={i} showContext />
                ))}
              </div>
              {results.length > 60 && <p className="mt-4 text-center text-sm text-muted">Showing the first 60. Add a filter to narrow it down.</p>}
            </>
          )
        ) : (
          <>
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-foreground">
              <Star aria-hidden className="h-4 w-4 fill-amber-400 text-amber-400" />
              Recommended for you
            </h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {recommended.map((game, i) => (
                <KidGameCard key={game.id} game={game} record={progress.games[game.id]} index={i} showContext />
              ))}
            </div>
          </>
        )}
      </section>

      <LearningJourney progress={progress} />
      <AchievementsGrid progress={progress} />
    </div>
  );
}
