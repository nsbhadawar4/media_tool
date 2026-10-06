'use client';

import Link from 'next/link';
import { ArrowRight, GraduationCap } from 'lucide-react';
import { SUBJECTS, SUBJECT_INFO, findLearningGame, gameHref } from '@/lib/kid-games/catalog';
import { activeClass, summarise, useKidProgress, useSavedSession } from '@/lib/kid-games/progress';
import { classStyle, subjectStyle } from './theme';
import { KidProgressBar } from './shared/KidUi';

/**
 * A small Kid Games card for the main dashboard: the active class, its three subjects, and a way
 * back in. Deliberately compact, so it never competes with the library overview around it.
 */
export function KidGamesDashboardCard() {
  const progress = useKidProgress();
  const saved = useSavedSession();
  const level = activeClass(progress);
  const resume = saved ? findLearningGame(saved.gameId) : progress.lastGameId ? findLearningGame(progress.lastGameId) : undefined;
  const href = resume ? gameHref(resume) : `/kid-games/class-${level}`;

  return (
    <section
      aria-label="Kid Games"
      style={classStyle(level)}
      className="kg-wash flex min-w-0 flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:gap-6"
    >
      <div className="flex min-w-0 items-center gap-3 sm:w-56 sm:shrink-0">
        <span className="kg-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-card">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-foreground">Kid Games</h2>
          <p className="text-xs text-muted">Learn while you play • Class {level}</p>
        </div>
      </div>

      <ul className="grid flex-1 grid-cols-3 gap-3">
        {SUBJECTS.map((subject) => {
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
    </section>
  );
}
