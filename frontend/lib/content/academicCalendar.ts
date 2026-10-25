/**
 * The academic calendar learners and administrators pick from: a year written "2026-27" that runs April
 * to March, and a month in it. The address carries the choice (?year=2026-27&month=04) so a refresh, a
 * shared link or the back button lands on the same month; the database says what each month holds.
 *
 * Relative imports only: the frontend tests run this outside Next.js.
 */

export const UNSCHEDULED = 'unscheduled';

/** April first, March last. */
export const MONTHS = [
  { n: 4, short: 'Apr', long: 'April' },
  { n: 5, short: 'May', long: 'May' },
  { n: 6, short: 'Jun', long: 'June' },
  { n: 7, short: 'Jul', long: 'July' },
  { n: 8, short: 'Aug', long: 'August' },
  { n: 9, short: 'Sep', long: 'September' },
  { n: 10, short: 'Oct', long: 'October' },
  { n: 11, short: 'Nov', long: 'November' },
  { n: 12, short: 'Dec', long: 'December' },
  { n: 1, short: 'Jan', long: 'January' },
  { n: 2, short: 'Feb', long: 'February' },
  { n: 3, short: 'Mar', long: 'March' },
] as const;

export const monthName = (n: number, form: 'long' | 'short' = 'long') => MONTHS.find((m) => m.n === n)?.[form] ?? '';

export const isAcademicYear = (value: string): boolean => {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return false;
  const start = Number(m[1]);
  return start >= 2000 && start <= 2099 && Number(m[2]) === (start + 1) % 100;
};

/** The academic year a date falls in: April 2026 – March 2027 is "2026-27". */
export function academicYearOf(date: Date): string {
  const start = date.getMonth() + 1 >= 4 ? date.getFullYear() : date.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** A place in the calendar: a year (or "unscheduled") and a month in it (null = the whole year). */
export interface Schedule {
  year: string;
  month: number | null;
}

/** One month's worth of published content, as the schedule endpoint counts it. */
export interface ScheduleSlot {
  subjects: number;
  chapters: number;
  lessons: number;
  minutes: number;
}

/** GET /api/content/classes/:slug/schedule — what the picker is drawn from. */
export interface ClassSchedule {
  currentYear: string;
  currentMonth: number;
  years: Array<ScheduleSlot & { academicYear: string; months: Array<ScheduleSlot & { month: number | null }> }>;
  unscheduled: ScheduleSlot;
  /** The whole class, scheduled or not. */
  totals: { subjects: number; chapters: number; games: number };
}

type Raw = string | string[] | undefined;

/**
 * The schedule asked for in the address. `null` = none asked for; `'invalid'` = something was there
 * but is not a calendar place (so the page falls back to its default rather than guessing).
 */
export function parseSchedule(query: { year?: Raw; month?: Raw }): Schedule | null | 'invalid' {
  const one = (v: Raw) => (Array.isArray(v) ? v[0] : v);
  const year = one(query.year)?.trim();
  const rawMonth = one(query.month)?.trim();
  if (!year && !rawMonth) return null;
  if (!year) return 'invalid'; // a month needs its year
  if (year === UNSCHEDULED) return rawMonth ? 'invalid' : { year, month: null };
  if (!isAcademicYear(year)) return 'invalid';
  if (!rawMonth) return { year, month: null };
  if (!/^\d{1,2}$/.test(rawMonth)) return 'invalid';
  const month = Number(rawMonth);
  return month >= 1 && month <= 12 ? { year, month } : 'invalid';
}

/** "?year=2026-27&month=04" — month always two digits, so one month has one address. */
export function scheduleSearch(s?: Schedule | null): string {
  if (!s) return '';
  const params = new URLSearchParams({ year: s.year });
  if (s.month !== null) params.set('month', String(s.month).padStart(2, '0'));
  return `?${params.toString()}`;
}

/** The same place as the API asks for it. */
export function scheduleApiQuery(s?: Schedule | null): Record<string, string> {
  if (!s) return {};
  if (s.year === UNSCHEDULED) return { schedule: UNSCHEDULED };
  return { academicYear: s.year, ...(s.month !== null ? { month: String(s.month).padStart(2, '0') } : {}) };
}

/** The query string the API reads a schedule from ("?academicYear=2026-27&month=04"), or "". */
export function scheduleApiSearch(s?: Schedule | null): string {
  const q = scheduleApiQuery(s);
  return Object.keys(q).length ? `?${new URLSearchParams(q).toString()}` : '';
}

/** "April 2026-27", "2026-27", "Anytime". */
export function scheduleLabel(s: Schedule): string {
  if (s.year === UNSCHEDULED) return 'Anytime';
  return s.month !== null ? `${monthName(s.month)} ${s.year}` : s.year;
}

/** Years an administrator can schedule into: last year, this one and the next two, plus any already in use. */
export function academicYearChoices(today: Date = new Date(), inUse: Array<string | null | undefined> = []): string[] {
  const start = Number(academicYearOf(today).slice(0, 4));
  const label = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  return [...new Set([...[-1, 0, 1, 2].map((d) => label(start + d)), ...inUse.filter((y): y is string => Boolean(y) && isAcademicYear(y as string))])].sort();
}

/** A chapter's own place, from what the database says (null when it has none). */
export const scheduleOfChapter = (c: { academicYear?: string | null; month?: number | null }): Schedule | null => (c.academicYear ? { year: c.academicYear, month: c.month ?? null } : null);

export const sameSchedule = (a: Schedule | null | undefined, b: Schedule | null | undefined) => (a?.year ?? null) === (b?.year ?? null) && (a?.month ?? null) === (b?.month ?? null);

/** True when the class has anything in the calendar to choose from. */
export const hasCalendar = (schedule: ClassSchedule) => schedule.years.length > 0;

/**
 * Which place a class page opens on. An address that names a real calendar place is honoured (even an
 * empty one — the page says so kindly). Otherwise: the current academic year if the class has content in
 * it, else its latest year; in it the current month if it has content, else the first month that does.
 * A class with nothing scheduled has no calendar: `null` (show everything, as before scheduling existed),
 * unless only unscheduled content exists and nothing is asked for — also `null`.
 */
export function resolveSchedule(schedule: ClassSchedule, asked: Schedule | null | 'invalid', today: Date = new Date()): { selected: Schedule | null; fromAddress: boolean } {
  if (!hasCalendar(schedule)) return { selected: asked && asked !== 'invalid' && asked.year === UNSCHEDULED ? asked : null, fromAddress: Boolean(asked && asked !== 'invalid') };
  if (asked && asked !== 'invalid') {
    if (asked.year !== UNSCHEDULED && asked.month === null) {
      // A year alone: land on a month of it, as the picker would.
      const year = schedule.years.find((y) => y.academicYear === asked.year);
      if (year) return { selected: { year: asked.year, month: defaultMonth(year.months, asked.year === academicYearOf(today) ? today.getMonth() + 1 : null) }, fromAddress: true };
    }
    return { selected: asked, fromAddress: true };
  }
  const current = academicYearOf(today);
  const year = schedule.years.find((y) => y.academicYear === current) ?? schedule.years[schedule.years.length - 1]!;
  return { selected: { year: year.academicYear, month: defaultMonth(year.months, year.academicYear === current ? today.getMonth() + 1 : null) }, fromAddress: false };
}

function defaultMonth(months: Array<{ month: number | null }>, now: number | null): number | null {
  const open = months.map((m) => m.month).filter((m): m is number => m !== null);
  if (now !== null && open.includes(now)) return now;
  return open[0] ?? null;
}
