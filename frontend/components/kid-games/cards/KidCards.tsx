'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { ArrowRight, CheckCircle2, Play, Sparkles, Star, Trophy } from 'lucide-react';
import { cn } from '@/utils/cn';
import { CLASS_INFO, SUBJECT_INFO, gameHref } from '@/lib/kid-games/catalog';
import type { GameRecord, ProgressSummary } from '@/lib/kid-games/progress';
import type { ClassLevel, LearningGame, Subject } from '@/lib/kid-games/types';
import { classStyle, DIFFICULTY_DOT, DIFFICULTY_LABEL, subjectStyle } from '../theme';
import { KidProgressBar, KidProgressRing, KidStars } from '../shared/KidUi';

const stagger = (index: number) => ({ '--i': index }) as CSSProperties;

/** The whole card is one link; the button inside is its visible affordance, not a second target. */
function CardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="absolute inset-0 z-10 rounded-3xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--kg)"
    />
  );
}

/** Confetti-like dots on a card's artwork: decoration that makes a gradient read as a picture. */
function ArtDots() {
  return (
    <>
      <span aria-hidden className="absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/20" />
      <span aria-hidden className="absolute -bottom-10 left-4 h-24 w-24 rounded-full bg-black/15" />
      <span aria-hidden className="absolute left-[18%] top-[22%] h-2.5 w-2.5 rounded-full bg-white/70" />
      <span aria-hidden className="absolute right-[24%] bottom-[20%] h-2 w-2 rotate-45 bg-white/60" />
      <span aria-hidden className="absolute right-[14%] top-[38%] h-1.5 w-1.5 rounded-full bg-white/80" />
    </>
  );
}

/** One class on the hub: artwork, a progress ring, what is done and what it has earned. */
export function ClassCard({ level, summary, index }: { level: ClassLevel; summary: ProgressSummary; index: number }) {
  const info = CLASS_INFO[level];
  const started = summary.completed > 0;
  return (
    <article style={{ ...classStyle(level), ...stagger(index) }} className="kg-card kg-enter group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <CardLink href={`/kid-games/${info.slug}`} label={`Class ${level}: ${info.tagline}. ${summary.completed} of ${summary.total} games completed.`} />
      <div className="kg-gradient relative flex h-28 items-center justify-center overflow-hidden sm:h-32">
        <ArtDots />
        <info.icon aria-hidden className={cn('kg-bob relative text-white drop-shadow-lg', level <= 2 ? 'h-14 w-14' : 'h-12 w-12')} strokeWidth={1.75} />
        <span className="absolute left-3 top-3 rounded-full bg-black/25 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">Class {level}</span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <KidProgressRing value={summary.percent} label={`Class ${level} progress`} size={56} stroke={6} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold tracking-tight text-foreground">{info.tagline}</h3>
            <p className="text-xs tabular-nums text-muted">
              {summary.completed} / {summary.total} games
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1 font-semibold text-amber-500">
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            {summary.xp} XP
          </span>
          <span className="flex items-center gap-1 tabular-nums text-muted">
            <Star aria-hidden className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {summary.stars} / {summary.maxStars}
          </span>
        </div>
        <span className="kg-btn mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold">
          {started ? 'Continue' : 'Start Learning'}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

const SUBJECT_TAGLINE: Record<Subject, string> = {
  hindi: 'Letters, words and stories',
  english: 'Words, grammar and reading',
  math: 'Numbers, shapes and puzzles',
};

/** A subject inside a class: what it covers, how far along, what it has earned. */
export function SubjectCard({ classLevel, subject, summary, index }: { classLevel: ClassLevel; subject: Subject; summary: ProgressSummary; index: number }) {
  const info = SUBJECT_INFO[subject];
  return (
    <article style={{ ...subjectStyle(subject), ...stagger(index) }} className="kg-card kg-enter group relative flex flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-card">
      <CardLink href={`/kid-games/class-${classLevel}/${subject}`} label={`${info.name}: ${summary.completed} of ${summary.total} games completed, ${summary.xp} XP`} />
      <div className="kg-gradient relative flex h-32 items-center justify-between overflow-hidden px-5 sm:h-36">
        <ArtDots />
        <span aria-hidden className="kg-bob relative text-5xl font-bold tracking-wide text-white drop-shadow-lg sm:text-6xl" lang={subject === 'hindi' ? 'hi' : 'en'}>
          {info.glyph}
        </span>
        <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/30 bg-white/15 backdrop-blur-sm">
          <info.icon aria-hidden className="h-7 w-7 text-white" strokeWidth={1.75} />
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">{info.name}</h3>
          <p className="text-sm text-muted">{SUBJECT_TAGLINE[subject]}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface-hover/70 px-1 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Games</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{summary.total}</p>
          </div>
          <div className="rounded-xl bg-surface-hover/70 px-1 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">XP</p>
            <p className="text-sm font-bold tabular-nums text-amber-500">{summary.xp}</p>
          </div>
          <div className="rounded-xl bg-surface-hover/70 px-1 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Best</p>
            <p className="text-sm font-bold tabular-nums text-foreground">{summary.bestScore ?? '—'}</p>
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground-soft">
              {summary.completed} / {summary.total} completed
            </span>
            <KidStars value={Math.round((summary.stars / Math.max(1, summary.maxStars)) * 3)} />
          </div>
          <KidProgressBar value={summary.percent} label={`${info.name} progress`} />
        </div>
        <span className="kg-btn mt-auto inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold">
          {summary.completed > 0 ? 'Continue Learning' : 'Start Playing'}
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </span>
      </div>
    </article>
  );
}

/** One game in a grid: what it teaches, how hard, what it pays, and how the child has done. */
export function KidGameCard({ game, record, index, showContext = false }: { game: LearningGame; record?: GameRecord; index: number; showContext?: boolean }) {
  const subject = SUBJECT_INFO[game.subject];
  const lang = game.subject === 'hindi' ? 'hi' : 'en';
  const status = record?.completed ? 'completed' : record ? 'played' : 'new';
  return (
    <article style={{ ...subjectStyle(game.subject), ...stagger(index) }} className="kg-card kg-enter group relative flex flex-col gap-3 overflow-hidden rounded-3xl border border-border bg-surface p-4 shadow-card">
      <CardLink
        href={gameHref(game)}
        label={`Play ${game.title}. ${DIFFICULTY_LABEL[game.difficulty]}, ${game.xp} XP.${record ? ` Best score ${record.bestScore}.` : ''}${record?.completed ? ' Completed.' : ''}`}
      />
      <div aria-hidden className="kg-wash pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70" />
      <div className="relative flex items-start justify-between gap-3">
        <span aria-hidden className="kg-gradient kg-bob flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lift">
          <game.icon className="h-7 w-7" strokeWidth={2} />
        </span>
        {status === 'completed' ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/14 px-2.5 py-1 text-xs font-bold text-emerald-500">
            <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
            Completed
          </span>
        ) : status === 'played' ? (
          <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-xs font-semibold text-amber-500">Keep trying</span>
        ) : (
          <span className="rounded-full bg-surface-hover px-2.5 py-1 text-xs font-semibold text-muted">New</span>
        )}
      </div>
      <div className="relative min-w-0">
        {showContext && (
          <p className="kg-text mb-0.5 text-[11px] font-bold uppercase tracking-wider">
            Class {game.classLevel} • {subject.name}
          </p>
        )}
        <h3 className="text-lg font-bold leading-snug tracking-tight text-foreground" lang={lang}>
          {game.title}
        </h3>
        <p className="mt-1 text-sm text-muted" lang={lang}>
          {game.description}
        </p>
      </div>
      <div className="relative flex flex-wrap items-center gap-2 text-xs">
        <span className="flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-1 font-bold text-amber-500">
          <Sparkles aria-hidden className="h-3.5 w-3.5" />+{game.xp} XP
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-hover px-2.5 py-1 font-semibold text-foreground-soft">
          <span aria-hidden className={cn('h-2 w-2 rounded-full', DIFFICULTY_DOT[game.difficulty])} />
          {DIFFICULTY_LABEL[game.difficulty]}
        </span>
        <span className="ml-auto">
          <KidStars value={record?.stars ?? 0} />
        </span>
      </div>
      <div className="relative mt-auto space-y-3">
        <div className="flex items-center gap-2">
          <Trophy aria-hidden className="h-4 w-4 shrink-0 text-amber-500" />
          <KidProgressBar value={record?.bestScore ?? 0} label={`${game.title} best score`} size="sm" />
          <span className="shrink-0 text-xs font-bold tabular-nums text-foreground-soft">{record ? `Best ${record.bestScore}` : 'Best —'}</span>
        </div>
        <span className="kg-btn inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold tracking-wider">
          <Play className="h-4 w-4 fill-current" />
          {record ? 'PLAY AGAIN' : 'PLAY NOW'}
        </span>
      </div>
    </article>
  );
}
