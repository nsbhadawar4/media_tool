'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { BarChart3, Check, ChevronRight, Circle, Flame, Lock, Map as MapIcon, PartyPopper, Play, Rocket, Target, Trophy } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CLASS_INFO, CLASS_LEVELS, SUBJECTS, SUBJECT_INFO, findLearningGame, gameHref } from '@/lib/kid-games/catalog';
import {
  ACHIEVEMENTS,
  activeClass,
  continueList,
  currentStreak,
  dayKey,
  levelFor,
  summarise,
  weekStrip,
  type KidProgress,
  type SavedSession,
} from '@/lib/kid-games/progress';
import type { ClassLevel, Subject } from '@/lib/kid-games/types';
import { classStyle, subjectStyle } from '../theme';
import { ClassIcon, KidProgressBar, KidStars, SubjectIcon } from '../shared/KidUi';

const panel = 'rounded-3xl border border-border bg-surface p-4 shadow-card sm:p-5';

/** Level badge and the XP still needed for the next one. */
export function LevelCard({ progress }: { progress: KidProgress }) {
  const level = levelFor(progress.xp);
  return (
    <div className="flex items-center gap-4">
      <span className="kg-gradient relative flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-white shadow-lift">
        <span className="text-[10px] font-bold uppercase tracking-wider opacity-85">Level</span>
        <span className="text-2xl font-bold leading-none">{level.level}</span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Level {level.level} Learner</p>
        <p className="mb-2 text-xs tabular-nums text-muted">
          {level.needed - level.current} XP to level {level.level + 1}
        </p>
        <KidProgressBar value={(level.current / level.needed) * 100} label={`Level ${level.level} progress`} />
      </div>
    </div>
  );
}

/** The unfinished game on this device first, then recently played games that are not yet perfect. */
export function ContinueSection({ progress, saved }: { progress: KidProgress; saved: SavedSession | null }) {
  const savedGame = saved ? findLearningGame(saved.gameId) : undefined;
  const recent = continueList(progress, 4)
    .filter((g) => g.id !== savedGame?.id)
    .slice(0, savedGame ? 3 : 4);

  if (!savedGame && recent.length === 0) {
    return (
      <section aria-label="Continue learning" className={cn(panel, 'kg-wash relative flex flex-col items-center justify-center overflow-hidden text-center')} style={classStyle(1)}>
        <span className="kg-gradient kg-bob mb-3 flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lift">
          <Rocket aria-hidden className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-bold text-foreground">Your learning journey starts here!</h2>
        <p className="mt-1 text-sm text-muted">Pick a class below, or jump straight into a first game.</p>
        <Link href="/kid-games/class-1/hindi/chitra-shabd" className="kg-btn mt-4 inline-flex min-h-11 items-center gap-2 rounded-2xl px-5 text-sm font-bold">
          <Play className="h-4 w-4 fill-current" />
          Start your first game
        </Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="kg-continue" className={cn(panel, 'flex flex-col gap-3')}>
      <h2 id="kg-continue" className="flex items-center gap-2 text-base font-bold text-foreground">
        <Play aria-hidden className="h-4 w-4 fill-current text-accent-2" />
        Continue Learning
      </h2>
      <ul className="grid gap-2">
        {savedGame && saved && (
          <li style={subjectStyle(savedGame.subject)}>
            <Link href={gameHref(savedGame)} className="kg-tint group flex items-center gap-3 rounded-2xl border border-transparent p-2.5 transition hover:border-(--kg)">
              <span className="kg-gradient flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white">
                <savedGame.icon aria-hidden className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-foreground" lang={savedGame.subject === 'hindi' ? 'hi' : 'en'}>
                  {savedGame.title}
                </span>
                <span className="block truncate text-xs text-muted">
                  Class {savedGame.classLevel} • {SUBJECT_INFO[savedGame.subject].name} • Question {saved.index + 1} of {saved.questions.length}
                </span>
                <KidProgressBar value={(saved.index / saved.questions.length) * 100} label="Game progress" size="sm" className="mt-1.5" />
              </span>
              <span className="kg-btn inline-flex min-h-10 shrink-0 items-center rounded-xl px-3 text-xs font-bold">CONTINUE</span>
            </Link>
          </li>
        )}
        {recent.map((game) => {
          const record = progress.games[game.id];
          return (
            <li key={game.id} style={subjectStyle(game.subject)}>
              <Link href={gameHref(game)} className="group flex items-center gap-3 rounded-2xl border border-border p-2.5 transition hover:border-(--kg) hover:bg-surface-hover/60">
                <span className="kg-tint kg-text flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                  <game.icon aria-hidden className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground" lang={game.subject === 'hindi' ? 'hi' : 'en'}>
                    {game.title}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    Class {game.classLevel} • {SUBJECT_INFO[game.subject].name}
                    {record && <KidStars value={record.stars} />}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-foreground-soft">{record ? `Best ${record.bestScore}` : ''}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const DAILY_GOAL = 3;

/** Today's games per subject against a small daily goal. Encouragement only: nothing is lost by missing it. */
export function DailyGoalCard({ progress }: { progress: KidProgress }) {
  const today = progress.days[dayKey()] ?? { hindi: 0, english: 0, math: 0 };
  const played = today.hindi + today.english + today.math;
  const met = played >= DAILY_GOAL;
  return (
    <section aria-label="Today's learning" className={panel}>
      <div className="flex items-center gap-2">
        <Target aria-hidden className="h-5 w-5 text-emerald-500" />
        <h2 className="text-base font-bold text-foreground">Today&apos;s Learning</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        {played} {played === 1 ? 'game' : 'games'} today
      </p>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {SUBJECTS.map((subject) => (
          <li key={subject} style={subjectStyle(subject)} className="kg-tint rounded-2xl px-2 py-2.5 text-center">
            <SubjectIcon subject={subject} className="kg-text mx-auto mb-1 h-4 w-4" />
            <p className="text-[11px] font-semibold text-muted">{subject === 'math' ? 'Maths' : SUBJECT_INFO[subject].name}</p>
            <p className="kg-text flex items-center justify-center gap-1 text-base font-bold tabular-nums">
              {today[subject] > 0 ? (
                <>
                  <Check aria-hidden className="h-4 w-4" strokeWidth={3} />
                  {today[subject]}
                </>
              ) : (
                '—'
              )}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-2" style={subjectStyle('math')}>
        <KidProgressBar value={(Math.min(played, DAILY_GOAL) / DAILY_GOAL) * 100} label="Daily goal" size="sm" />
        <span className="shrink-0 whitespace-nowrap text-xs font-semibold tabular-nums text-muted">
          {Math.min(played, DAILY_GOAL)} / {DAILY_GOAL}
        </span>
      </div>
      {met && (
        <p className="kg-feedback mt-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-500">
          <PartyPopper aria-hidden className="h-4 w-4" />
          Daily goal completed!
        </p>
      )}
    </section>
  );
}

/** This week at a glance. No countdowns and no "you will lose your streak" pressure. */
export function StreakCard({ progress }: { progress: KidProgress }) {
  const streak = currentStreak(progress);
  const week = weekStrip(progress);
  return (
    <section aria-label="Daily streak" className={panel}>
      <div className="flex items-center gap-2">
        <Flame aria-hidden className="h-5 w-5 text-orange-500" />
        <h2 className="text-base font-bold text-foreground">Daily Streak</h2>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
        {streak} {streak === 1 ? 'day' : 'days'}
        {progress.dailyStreak.best > streak && <span className="ml-2 text-xs font-medium text-muted">Best {progress.dailyStreak.best}</span>}
      </p>
      <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="This week">
        {week.map((day) => (
          <li key={day.key} className="flex flex-col items-center gap-1">
            <span className={cn('text-[10px] font-semibold', day.isToday ? 'text-foreground' : 'text-subtle')}>{day.label}</span>
            <span
              aria-label={`${day.label}: ${day.done ? 'played' : day.isFuture ? 'coming up' : 'no games'}`}
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                day.done ? 'bg-orange-500 text-white' : 'border border-border-strong text-subtle',
                day.isToday && !day.done && 'border-orange-400',
              )}
            >
              {day.done ? <Check aria-hidden className="h-4 w-4" strokeWidth={3} /> : <Circle aria-hidden className="h-2.5 w-2.5" />}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function AchievementsGrid({ progress }: { progress: KidProgress }) {
  const earned = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]).length;
  return (
    <section aria-labelledby="kg-achievements">
      <div className="mb-3 flex items-end justify-between gap-3">
        <h2 id="kg-achievements" className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <Trophy aria-hidden className="h-5 w-5 text-amber-500" />
          Achievements
        </h2>
        <span className="text-sm font-semibold tabular-nums text-muted">
          {earned} / {ACHIEVEMENTS.length} unlocked
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-9">
        {ACHIEVEMENTS.map((achievement, i) => {
          const unlocked = Boolean(progress.achievements[achievement.id]);
          return (
            <li
              key={achievement.id}
              style={{ ['--i' as string]: i }}
              className={cn('kg-enter flex flex-col items-center rounded-3xl border p-3 text-center', unlocked ? 'border-amber-400/40 bg-amber-400/10' : 'border-border bg-surface')}
            >
              <span className={cn('mb-1.5 flex h-12 w-12 items-center justify-center rounded-2xl', unlocked ? 'bg-amber-400/20 text-amber-500' : 'bg-surface-hover text-subtle')}>
                <achievement.icon aria-hidden className="h-6 w-6" />
              </span>
              <p className="text-sm font-bold leading-tight text-foreground">{achievement.title}</p>
              <p className="mt-0.5 text-xs text-muted">{achievement.description}</p>
              <p className={cn('mt-1.5 flex items-center gap-1 text-[11px] font-semibold', unlocked ? 'text-amber-500' : 'text-subtle')}>
                {unlocked ? <Check aria-hidden className="h-3 w-3" strokeWidth={3} /> : <Lock aria-hidden className="h-3 w-3" />}
                {unlocked ? 'Unlocked' : 'Locked'}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SUBJECT_ROW: Record<Subject, { glyph: string; blurb: string }> = {
  hindi: { glyph: 'अ', blurb: 'Words & language' },
  english: { glyph: 'A', blurb: 'Words & grammar' },
  math: { glyph: '123', blurb: 'Numbers & puzzles' },
};

const CLASS_OPTIONS = CLASS_LEVELS.map((level) => ({ label: `Class ${level}`, value: String(level) }));

/**
 * "Your Learning Journey": every class as a tappable progress row, beside the subjects of one class
 * (the one the child last played, switchable in place without a reload). Real figures only: zero
 * shows as zero, with a friendly line so an empty bar does not look dead.
 */
export function LearningJourney({ progress }: { progress: KidProgress }) {
  const [chosen, setChosen] = useState<ClassLevel | null>(null);
  const selected = chosen ?? activeClass(progress);

  return (
    <section aria-labelledby="kg-journey">
      <div className="mb-4">
        <h2 id="kg-journey" className="flex items-center gap-2 text-lg font-bold tracking-tight text-foreground sm:text-xl">
          <MapIcon aria-hidden className="h-5 w-5 text-accent-2" />
          Your Learning Journey
        </h2>
        <p className="mt-0.5 text-sm text-muted">See how you&apos;re progressing across classes and subjects.</p>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Class progress */}
        <div className="kg-journey-card rounded-3xl border border-border p-4 shadow-card sm:p-5" style={classStyle(selected)}>
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <BarChart3 aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-foreground">Class Progress</h3>
              <p className="text-xs text-muted">Tap a class to open it.</p>
            </div>
          </div>
          <ul className="grid grid-cols-1 gap-1.5">
            {CLASS_LEVELS.map((level) => {
              const summary = summarise(progress, level);
              const info = CLASS_INFO[level];
              return (
                <li key={level} style={classStyle(level)}>
                  <Link
                    href={`/kid-games/${info.slug}`}
                    aria-label={`Class ${level}: ${summary.completed} of ${summary.total} games completed, ${summary.percent}%`}
                    className="kg-row group flex min-h-16 items-center gap-3 rounded-2xl border border-transparent px-3 py-2.5"
                  >
                    <span className="kg-gradient kg-row-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-card">
                      <ClassIcon level={level} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-bold uppercase tracking-wide text-foreground">Class {level}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          <span className="font-semibold text-foreground-soft">
                            {summary.completed} / {summary.total}
                          </span>
                          <span className="ml-2 font-bold text-foreground">{summary.percent}%</span>
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">{summary.completed === 0 ? `${info.tagline} • Ready to begin!` : info.tagline}</span>
                      <KidProgressBar value={summary.percent} label={`Class ${level} progress`} size="sm" className="mt-1.5" />
                    </span>
                    <ChevronRight aria-hidden className="kg-row-arrow h-4 w-4 shrink-0 text-muted opacity-60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Subjects of one class */}
        <div className="kg-journey-card rounded-3xl border border-border p-4 shadow-card sm:p-5" style={classStyle(selected)}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-foreground">Class {selected} Subjects</h3>
              <p className="text-xs text-muted">Pick a subject and keep learning.</p>
            </div>
            <Select
              aria-label="Choose a class"
              options={CLASS_OPTIONS}
              value={String(selected)}
              onChange={(e) => setChosen(Number(e.target.value) as ClassLevel)}
              className="h-11 lg:h-9"
            />
          </div>
          <ul className="grid grid-cols-1 gap-2.5">
            {SUBJECTS.map((subject) => {
              const summary = summarise(progress, selected, subject);
              const row = SUBJECT_ROW[subject];
              return (
                <li key={subject} style={subjectStyle(subject)}>
                  <Link
                    href={`/kid-games/class-${selected}/${subject}`}
                    aria-label={`Class ${selected} ${SUBJECT_INFO[subject].name}: ${summary.completed} of ${summary.total} games completed`}
                    className="kg-row group flex items-center gap-3 rounded-2xl border border-border bg-surface-elevated/60 px-3 py-3"
                  >
                    <span
                      aria-hidden
                      lang={subject === 'hindi' ? 'hi' : 'en'}
                      className={cn(
                        'kg-gradient kg-row-icon flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-white shadow-card',
                        row.glyph.length > 1 ? 'text-base' : 'text-xl',
                      )}
                    >
                      {row.glyph}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-bold uppercase tracking-wide text-foreground">{SUBJECT_INFO[subject].name}</span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-foreground-soft">
                          {summary.completed} / {summary.total}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {row.blurb}
                        {summary.completed === 0 ? ' • Start your first game' : ` • ${summary.percent}% done`}
                      </span>
                      <KidProgressBar value={summary.percent} label={`${SUBJECT_INFO[subject].name} progress`} size="sm" className="mt-1.5" />
                    </span>
                    <ChevronRight aria-hidden className="kg-row-arrow h-4 w-4 shrink-0 text-muted opacity-60" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
