/**
 * The academic calendar a chapter can be scheduled in: an academic year ("2026-27") and a month
 * (1–12). The year runs April to March, so April comes first and March last — `monthOrder` is a
 * month's place in that year, which is how months are listed everywhere.
 *
 * Both fields live on the chapter (Course) record; a chapter with neither is simply "not scheduled",
 * which is how everything written before scheduling existed reads. Nothing here guesses a schedule.
 */

/** First month of the academic year (April). */
export const ACADEMIC_YEAR_START_MONTH = 4;

export const ACADEMIC_YEAR_PATTERN = /^(\d{4})-(\d{2})$/;

/** "2026-27": a start year and the last two digits of the year after it. */
export function isAcademicYear(value: string): boolean {
  const m = ACADEMIC_YEAR_PATTERN.exec(value);
  if (!m) return false;
  const start = Number(m[1]);
  return start >= 2000 && start <= 2099 && Number(m[2]) === (start + 1) % 100;
}

export const academicYearLabel = (startYear: number) => `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;

/** The academic year a date falls in (April 2026 – March 2027 is "2026-27"). */
export function academicYearOf(date: Date): string {
  const month = date.getMonth() + 1;
  return academicYearLabel(month >= ACADEMIC_YEAR_START_MONTH ? date.getFullYear() : date.getFullYear() - 1);
}

/** A month's place in the academic year: April 1 … March 12. */
export const monthOrder = (month: number) => ((month - ACADEMIC_YEAR_START_MONTH + 12) % 12) + 1;

/** 1–12, April first. */
export const MONTHS_IN_ORDER = Array.from({ length: 12 }, (_, i) => ((ACADEMIC_YEAR_START_MONTH - 1 + i) % 12) + 1);

export const isMonth = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;

/** A month with no year is not a place in the calendar; a year alone is allowed (the whole year). */
export function scheduleProblem(academicYear: string | null | undefined, month: number | null | undefined): string | null {
  if (month != null && !isMonth(month)) return 'Choose a month from 1 to 12';
  if (academicYear != null && !isAcademicYear(academicYear)) return 'Use an academic year like 2026-27';
  if (month != null && academicYear == null) return 'Choose an academic year for the month';
  return null;
}
