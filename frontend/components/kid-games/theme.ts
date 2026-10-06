import type { CSSProperties } from 'react';
import type { ClassLevel, Difficulty, Subject } from '@/lib/kid-games/types';

/*
 * Kid Games colour identity. The colours themselves are tokens in globals.css (--kid-hindi,
 * --kid-class-3, …); components only ever set `--kg` / `--kg-2` to one of them and style against
 * those, so a subject or class colour is defined in exactly one place.
 */

type KidStyle = CSSProperties & Record<'--kg' | '--kg-2', string>;

export function subjectStyle(subject: Subject): KidStyle {
  return { '--kg': `var(--kid-${subject})`, '--kg-2': `var(--kid-${subject}-2)` };
}

export function classStyle(level: ClassLevel): KidStyle {
  return { '--kg': `var(--kid-class-${level})`, '--kg-2': `var(--kid-class-${level}-2)` };
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

/** Dot colour per level, matching the existing games hub. */
export const DIFFICULTY_DOT: Record<Difficulty, string> = {
  easy: 'bg-emerald-400',
  medium: 'bg-amber-400',
  hard: 'bg-rose-400',
};

/** Kind, varied praise. Never "wrong" or "failed". */
export const PRAISE = ['Great job!', 'Excellent!', 'Well done!', 'Super!', 'Keep going!'] as const;
export const PRAISE_HI = ['बहुत बढ़िया!', 'शाबाश!', 'बहुत अच्छे!', 'कमाल कर दिया!'] as const;
export const ENCOURAGE = ['Almost! Try once more.', 'Good try! Think again.', 'So close! One more go.'] as const;
export const ENCOURAGE_HI = ['लगभग सही! एक बार फिर कोशिश करो।', 'अच्छी कोशिश! फिर से सोचो।'] as const;

export function pick<T>(list: readonly T[], seed: number): T {
  return list[Math.abs(seed) % list.length];
}

/** "1 day", "3 days". */
export function dayCount(n: number): string {
  return `${n} ${n === 1 ? 'day' : 'days'}`;
}
