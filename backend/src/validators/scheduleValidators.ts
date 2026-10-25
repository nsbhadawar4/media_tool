import { z } from 'zod';
import { isAcademicYear } from '../services/academicCalendar';

/**
 * A chapter's place in the academic calendar, as it is written (admin forms) and asked for (filters).
 * In a body, `undefined` leaves the stored value alone and `null` clears it; a month never travels
 * without its year.
 */
export const academicYearField = z
  .string()
  .trim()
  .refine(isAcademicYear, 'Use an academic year like 2026-27');

/** 1–12. A query string says "04", a form says 4 — both are April. */
export const monthField = z.coerce.number().int('Choose a month from 1 to 12').min(1, 'Choose a month from 1 to 12').max(12, 'Choose a month from 1 to 12');

export const scheduleBody = {
  academicYear: academicYearField.nullable().optional(),
  month: z.number().int('Choose a month from 1 to 12').min(1, 'Choose a month from 1 to 12').max(12, 'Choose a month from 1 to 12').nullable().optional(),
};

/** For a body that carries the whole schedule: a month needs its year. */
export function monthNeedsYear(v: { academicYear?: string | null; month?: number | null }, ctx: z.RefinementCtx, path: (string | number)[] = []) {
  if (v.month != null && v.academicYear == null) ctx.addIssue({ code: 'custom', path: [...path, 'academicYear'], message: 'Choose an academic year for the month' });
}

/** Admin list filter: a year, a month in it, or the chapters still waiting to be scheduled. */
export const scheduleFilter = {
  academicYear: academicYearField.optional(),
  month: monthField.optional(),
  schedule: z.enum(['scheduled', 'unscheduled']).optional(),
};

/**
 * Public reads of a class through a schedule: ?academicYear=2026-27&month=04, or ?schedule=unscheduled for
 * what has no place in the calendar yet. Anything else is a 400, so a mistyped filter never reads as "all".
 */
export const publicScheduleQuerySchema = z
  .object({ academicYear: academicYearField.optional(), month: monthField.optional(), schedule: z.literal('unscheduled').optional() })
  .superRefine((q, ctx) => {
    if (q.month !== undefined && !q.academicYear) ctx.addIssue({ code: 'custom', path: ['academicYear'], message: 'Choose an academic year for the month' });
    if (q.schedule && (q.academicYear || q.month !== undefined)) ctx.addIssue({ code: 'custom', path: ['schedule'], message: 'Unscheduled content has no year or month' });
  });
