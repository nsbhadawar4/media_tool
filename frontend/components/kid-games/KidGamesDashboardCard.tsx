'use client';

import Link from 'next/link';
import { ArrowRight, GraduationCap, Star } from 'lucide-react';
import { useContentCatalog } from '@/lib/content/useContentCatalog';
import { SUBJECTS, SUBJECT_INFO, findLearningGame, gameHref } from '@/lib/kid-games/catalog';
import { activeClass, summarise, useKidProgress, useSavedSession } from '@/lib/kid-games/progress';
import { classStyle, subjectStyle } from './theme';
import { KidProgressBar } from './shared/KidUi';

/**
 * A small Kid Games card for the main dashboard: the active class, its subjects, and a way back
 * in. Deliberately compact, so it never competes with the library overview around it.
 *
 * Follows the catalog at every level: a class, subject or game switched off (or hidden) isn't
 * offered here, and with no class left the card isn't shown at all.
 */
export function KidGamesDashboardCard() {
  const progress = useKidProgress();
  const saved = useSavedSession();
  const catalog = useContentCatalog();
  const preferred = activeClass(progress);
  const level = catalog.classes.includes(preferred) ? preferred : catalog.classes[0];
  if (level === undefined) return null;
  const subjects = SUBJECTS.filter((s) => catalog.subjectsFor(level).some((v) => v.key === s));
  const last = saved ? findLearningGame(saved.gameId) : progress.lastGameId ? findLearningGame(progress.lastGameId) : undefined;
  const resume = last && catalog.isGamePlayable(last.id) ? last : undefined;
  const href = resume ? gameHref(resume) : `/kid-games/class-${level}`;
  // Games an administrator featured for the active class (/admin/content/kid-games).
  const featured = catalog.featuredKidGames.filter((g) => g.classLevel === level).slice(0, 4);

  return (
    <section
      aria-label="Kid Games"
      style={classStyle(level)}
      className="kg-wash flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card"
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex min-w-0 items-center gap-3 sm:w-56 sm:shrink-0">
          <span className="kg-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-card">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold tracking-tight text-foreground">Kid Games</h2>
            <p className="text-xs text-muted">Learn while you play • Class {level}</p>
          </div>
        </div>

        <ul className="grid flex-1 gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(subjects.length, 1)}, minmax(0, 1fr))` }}>
          {subjects.map((subject) => {
            const summary = summarise(progress, level, subject);
            return (
              <li key={subject} style={subjectStyle(subject)} className="min-w-0">
                <div className="mb-1 flex items-baseline justify-between gap-1 text-xs">
                  <span className="truncate font-medium text-foreground-soft">{subject === 'math' ? 'Maths' : SUBJECT_INFO[subject].name}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-foreground">{summary.percent}%</span>
                </div>
                <KidProgressBar value={summary.percent} label={`${SUBJECT_INFO[subject].name} progress`} size="sm" />
              </li>
            );
          })}
        </ul>

        <Link href={href} className="kg-btn inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold">
          Continue Learning
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {featured.length > 0 && (
        <ul aria-label="Featured games" className="flex flex-wrap gap-2 border-t border-border pt-4">
          {featured.map((game) => (
            <li key={game.id} className="min-w-0">
              <Link
                href={gameHref(game)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface-hover/40 px-3 py-1.5 text-xs font-medium text-foreground-soft transition hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                <span className="truncate">{game.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
