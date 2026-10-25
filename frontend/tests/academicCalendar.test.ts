/**
 * The academic calendar in the address: ?year=2026-27&month=04 must mean one thing everywhere — parsed,
 * written back, sent to the API — and a class page must open on a sensible year and month without being
 * asked. Also that only the class and subject addresses carry the choice; a chapter and a lesson have one
 * address each, so no link to them can drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MONTHS,
  UNSCHEDULED,
  academicYearChoices,
  academicYearOf,
  hasCalendar,
  isAcademicYear,
  parseSchedule,
  resolveSchedule,
  scheduleApiSearch,
  scheduleLabel,
  scheduleOfChapter,
  scheduleSearch,
  type ClassSchedule,
  type Schedule,
} from '../lib/content/academicCalendar';
import { chapterPath, classPath, lessonPath, parseLessonParam, subjectPath } from '../lib/content/learnPaths';

const slot = (subjects = 1, chapters = 1, lessons = 3, minutes = 0) => ({ subjects, chapters, lessons, minutes });
const calendar = (years: Record<string, number[]>, unscheduled = slot(0, 0, 0)): ClassSchedule => ({
  currentYear: '2026-27',
  currentMonth: 4,
  years: Object.entries(years).map(([academicYear, months]) => ({ academicYear, ...slot(2, months.length, months.length * 3), months: months.map((month) => ({ month, ...slot() })) })),
  unscheduled,
  totals: { subjects: 3, chapters: 12, games: 0 },
});
const at = (y: number, m: number) => new Date(y, m - 1, 15);

test('the academic year is April to March, written 2026-27, and months are listed April first', () => {
  assert.equal(academicYearOf(at(2026, 4)), '2026-27');
  assert.equal(academicYearOf(at(2027, 3)), '2026-27');
  assert.equal(academicYearOf(at(2027, 4)), '2027-28');
  assert.equal(academicYearOf(at(2026, 1)), '2025-26');
  assert.deepEqual(MONTHS.map((m) => m.n), [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  assert.deepEqual(MONTHS.map((m) => m.short).slice(0, 4), ['Apr', 'May', 'Jun', 'Jul']);
  for (const y of ['2026-27', '2099-00']) assert.ok(isAcademicYear(y));
  for (const y of ['2026-28', '2026', '26-27', '2026-2027', 'unscheduled', '']) assert.ok(!isAcademicYear(y), y);
  assert.deepEqual(academicYearChoices(at(2026, 5), ['2031-32', 'bogus', null]), ['2025-26', '2026-27', '2027-28', '2028-29', '2031-32']);
});

test('the address round-trips: what is written is what is read, and a month has exactly one spelling', () => {
  for (const s of [{ year: '2026-27', month: 4 }, { year: '2026-27', month: 12 }, { year: '2026-27', month: null }, { year: UNSCHEDULED, month: null }] satisfies Schedule[]) {
    const query = Object.fromEntries(new URLSearchParams(scheduleSearch(s)));
    assert.deepEqual(parseSchedule(query), s, scheduleSearch(s));
  }
  assert.equal(scheduleSearch({ year: '2026-27', month: 4 }), '?year=2026-27&month=04', 'April is always 04');
  assert.equal(scheduleSearch({ year: '2026-27', month: null }), '?year=2026-27');
  assert.equal(scheduleSearch(null), '');
  assert.deepEqual(parseSchedule({ year: '2026-27', month: '4' }), { year: '2026-27', month: 4 }, 'a hand-typed 4 is April too');
  assert.deepEqual(parseSchedule({ year: ['2026-27', '2027-28'], month: ['05'] }), { year: '2026-27', month: 5 }, 'a repeated parameter reads its first');
  assert.equal(parseSchedule({}), null, 'nothing asked');
  for (const bad of [{ month: '04' }, { year: '2026' }, { year: '2026-28' }, { year: '2026-27', month: '13' }, { year: '2026-27', month: '0' }, { year: '2026-27', month: 'apr' }, { year: UNSCHEDULED, month: '04' }, { year: '2026-27', month: '4.5' }]) {
    assert.equal(parseSchedule(bad), 'invalid', JSON.stringify(bad));
  }
  assert.equal(scheduleApiSearch({ year: '2026-27', month: 4 }), '?academicYear=2026-27&month=04');
  assert.equal(scheduleApiSearch({ year: '2026-27', month: null }), '?academicYear=2026-27');
  assert.equal(scheduleApiSearch({ year: UNSCHEDULED, month: null }), '?schedule=unscheduled');
  assert.equal(scheduleApiSearch(null), '');
  assert.equal(scheduleLabel({ year: '2026-27', month: 4 }), 'April 2026-27');
  assert.equal(scheduleLabel({ year: UNSCHEDULED, month: null }), 'Anytime');
  assert.deepEqual(scheduleOfChapter({ academicYear: '2026-27', month: 5 }), { year: '2026-27', month: 5 });
  assert.equal(scheduleOfChapter({ academicYear: null, month: null }), null);
});

test('a class page opens on the current academic year and month when it has content there', () => {
  const c = calendar({ '2025-26': [4, 5], '2026-27': [4, 5, 6] });
  assert.deepEqual(resolveSchedule(c, null, at(2026, 5)).selected, { year: '2026-27', month: 5 }, 'this year, this month');
  assert.deepEqual(resolveSchedule(c, null, at(2026, 8)).selected, { year: '2026-27', month: 4 }, 'this year; August is empty, so its first month');
  assert.deepEqual(resolveSchedule(c, null, at(2027, 2)).selected, { year: '2026-27', month: 4 }, 'still the year it is');
  assert.equal(resolveSchedule(c, null, at(2026, 5)).fromAddress, false);
});

test('without content in the current year the latest year opens, at its first month', () => {
  const c = calendar({ '2024-25': [4], '2025-26': [9, 10] });
  assert.deepEqual(resolveSchedule(c, null, at(2026, 5)).selected, { year: '2025-26', month: 9 });
  // A year that is not the current one never defaults to "this month" of another year.
  assert.deepEqual(resolveSchedule(calendar({ '2025-26': [4, 5, 6] }), null, at(2026, 5)).selected, { year: '2025-26', month: 4 });
});

test('an address that names a real place is honoured, even an empty month; an invalid one falls back to the default', () => {
  const c = calendar({ '2026-27': [4, 5] });
  assert.deepEqual(resolveSchedule(c, { year: '2026-27', month: 5 }, at(2026, 4)).selected, { year: '2026-27', month: 5 });
  const empty = resolveSchedule(c, { year: '2026-27', month: 9 }, at(2026, 4));
  assert.deepEqual(empty.selected, { year: '2026-27', month: 9 }, 'September is empty: the page says so rather than jumping elsewhere');
  assert.equal(empty.fromAddress, true);
  assert.deepEqual(resolveSchedule(c, { year: '2030-31', month: 4 }, at(2026, 4)).selected, { year: '2030-31', month: 4 }, 'a year with nothing: an honest empty page');
  assert.deepEqual(resolveSchedule(c, 'invalid', at(2026, 4)).selected, { year: '2026-27', month: 4 }, 'a malformed address is ignored');
  assert.deepEqual(resolveSchedule(c, { year: UNSCHEDULED, month: null }, at(2026, 4)).selected, { year: UNSCHEDULED, month: null }, 'Anytime');
  // Choosing a year alone (the year selector) lands on one of its months.
  const two = calendar({ '2025-26': [7, 8], '2026-27': [4, 5] });
  assert.deepEqual(resolveSchedule(two, { year: '2025-26', month: null }, at(2026, 5)).selected, { year: '2025-26', month: 7 }, 'another year: its first month');
  assert.deepEqual(resolveSchedule(two, { year: '2026-27', month: null }, at(2026, 5)).selected, { year: '2026-27', month: 5 }, 'this year: this month');
});

test('a class with nothing scheduled has no calendar: everything is shown as before scheduling existed', () => {
  const none = calendar({}, slot(2, 10, 30));
  assert.equal(hasCalendar(none), false);
  assert.equal(resolveSchedule(none, null).selected, null);
  assert.equal(resolveSchedule(none, 'invalid').selected, null);
  assert.equal(resolveSchedule(none, { year: '2026-27', month: 4 }).selected, null, 'a month asked of a class with no calendar is ignored, not an empty page');
  assert.deepEqual(resolveSchedule(none, { year: UNSCHEDULED, month: null }).selected, { year: UNSCHEDULED, month: null });
});

test('only a class and a subject carry the calendar; a chapter and a lesson have one address each', () => {
  const when: Schedule = { year: '2026-27', month: 4 };
  assert.equal(classPath('class-1', when), '/classes/class-1?year=2026-27&month=04');
  assert.equal(subjectPath('class-1', 'math', when), '/classes/class-1/math?year=2026-27&month=04');
  assert.equal(classPath('class-1'), '/classes/class-1');
  assert.equal(classPath('class-1', null), '/classes/class-1');
  assert.equal(subjectPath('class-1', 'math'), '/classes/class-1/math');
  // The same subject, the same chapter, the same lesson — whichever month it was reached through.
  assert.equal(chapterPath('class-1', 'math', 'c1-math-count'), '/classes/class-1/math/c1-math-count');
  assert.equal(lessonPath('class-1', 'math', 'c1-math-count', 2), '/classes/class-1/math/c1-math-count/2');
  for (const p of [chapterPath('class-1', 'math', 'c'), lessonPath('class-1', 'math', 'c', 1)]) assert.ok(!p.includes('?'), p);
  // The path part of a scheduled address is exactly the unscheduled one: the same route, only a query.
  assert.equal(subjectPath('class-1', 'math', when).split('?')[0], subjectPath('class-1', 'math'));
  assert.equal(parseLessonParam('2'), 2);
});
