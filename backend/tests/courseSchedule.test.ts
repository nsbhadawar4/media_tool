/**
 * Academic year + month scheduling, and learners' persistent progress through it: the calendar rules,
 * what administrators can set and are refused, what visitors and learners are shown for a year and
 * month (never an empty month, never a draft), and that progress is kept in the database against the
 * session's user — lesson by lesson, step by step — and resumes where the learner stopped.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ContentItem } from '../src/models/ContentItem';
import { Course } from '../src/models/Course';
import { CourseProgress } from '../src/models/CourseProgress';
import { academicYearOf, isAcademicYear, monthOrder, MONTHS_IN_ORDER, scheduleProblem } from '../src/services/academicCalendar';

const PASSWORD = 'Strong-Passw0rd';
const YEAR = '2026-27';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let admin: string;
let kid: string;
let other: string;

async function signIn(email: string, role: 'user' | 'admin') {
  await User.create({ name: `Name of ${email}`, email, role, passwordHash: await bcrypt.hash(PASSWORD, 4) });
  const res = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (res.headers.get('set-cookie') ?? '').match(/mt_session=[^;]+/)![0];
}

async function call(method: string, path: string, body?: unknown, cookie?: string) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, data: json?.data, message: json?.message as string | undefined, details: json?.error?.details as Array<{ path: string; message: string }> | undefined };
}

interface When {
  academicYear?: string | null;
  month?: number | null;
}
const lesson = (title: string) => ({
  title,
  explanation: 'Read and think.',
  examples: ['An example'],
  keyPoints: ['A key point'],
  questions: [{ type: 'mcq', prompt: 'Which?', options: ['A', 'B'], answer: 'A', difficulty: 'easy', explanation: 'A is right.' }],
  practice: [],
});
const chapter = (title: string, when: When = {}, lessons = 3) => ({
  title,
  description: `All about ${title}`,
  objectives: [`Understand ${title}`],
  difficulty: 'easy',
  status: 'draft',
  ...when,
  lessons: Array.from({ length: lessons }, (_, i) => lesson(`${title} ${i + 1}`)),
  quiz: [{ type: 'mcq', prompt: 'Quick check', options: ['Yes', 'No'], answer: 'Yes', difficulty: 'easy', explanation: '' }],
});
const saveSubject = (level: number, subject: string, chapters: unknown[], mode: 'new' | 'new-version' | 'edit' = 'new') =>
  call('PUT', `/api/admin/courses/${level}/${subject}`, { mode, course: { title: `${subject} course` }, chapters, source: { kind: 'manual', provider: null, model: null } }, admin);

const schedule = (slug: string) => call('GET', `/api/content/classes/${slug}/schedule`);
const subjectsIn = async (slug: string, query: string) => {
  const res = await call('GET', `/api/content/classes/${slug}/curriculum${query}`);
  return res.status === 200 ? (res.data.subjects as Array<{ key: string; chapters: Array<{ title: string; academicYear: string | null; month: number | null }> }>) : res;
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init(), CourseProgress.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');
  kid = await signIn('kid@example.com', 'user');
  other = await signIn('other@example.com', 'user');

  // Class 8, as an administrator builds it: Math in April (two chapters) and May, English in April only,
  // and one chapter nobody has scheduled yet — as every chapter written before scheduling reads.
  const created = await call(
    'POST',
    '/api/admin/classes',
    { classLevel: 8, title: 'Class 8', subtitle: 'Scheduled', description: 'A scheduled class', subjects: [{ key: 'math', title: 'Mathematics', description: '', isVisible: true }, { key: 'english', title: 'English', description: '', isVisible: true }] },
    admin,
  );
  assert.equal(created.status, 201, created.message);
  const math = await saveSubject(8, 'math', [chapter('Numbers Around Us', { academicYear: YEAR, month: 4 }), chapter('Counting Games', { academicYear: YEAR, month: 4 }, 2), chapter('Addition Fun', { academicYear: YEAR, month: 5 }), chapter('Old Chapter')]);
  assert.equal(math.status, 201, `${math.message} ${JSON.stringify(math.details)}`);
  const english = await saveSubject(8, 'english', [chapter('Alphabet', { academicYear: YEAR, month: 4 }, 1)]);
  assert.equal(english.status, 201, english.message);
  assert.equal((await call('PATCH', '/api/admin/classes/8/status', { status: 'published' }, admin)).status, 200);
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ the calendar

test('the academic year runs April to March, and a year is written 2026-27', () => {
  assert.ok(isAcademicYear('2026-27') && isAcademicYear('2099-00'));
  for (const bad of ['2026-28', '2026', '26-27', '2026/27', '2026-2027', '1999-00', '']) assert.ok(!isAcademicYear(bad), bad);
  assert.equal(academicYearOf(new Date(2026, 3, 1)), '2026-27', 'April 2026 opens 2026-27');
  assert.equal(academicYearOf(new Date(2027, 2, 31)), '2026-27', 'March 2027 closes it');
  assert.equal(academicYearOf(new Date(2027, 3, 1)), '2027-28');
  assert.deepEqual(MONTHS_IN_ORDER, [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]);
  assert.equal(monthOrder(4), 1);
  assert.equal(monthOrder(3), 12);
  assert.equal(scheduleProblem(null, 4) !== null, true, 'a month needs its year');
  assert.equal(scheduleProblem('2026-27', null), null, 'a year alone is the whole year');
  assert.equal(scheduleProblem(null, null), null);
});

// ------------------------------------------------------------------------------------ admin

test('admin: a chapter saved with a year and month keeps them in the database, and editing without them leaves them alone', async () => {
  const stored = await Course.find({ classLevel: 8, subject: 'math' }).sort({ order: 1 }).lean();
  assert.deepEqual(stored.map((c) => [c.title, c.academicYear, c.month]), [['Numbers Around Us', YEAR, 4], ['Counting Games', YEAR, 4], ['Addition Fun', YEAR, 5], ['Old Chapter', null, null]]);
  const view = await call('GET', '/api/admin/courses/8/math', undefined, admin);
  assert.deepEqual(view.data.chapters.map((c: When) => [c.academicYear, c.month]), [[YEAR, 4], [YEAR, 4], [YEAR, 5], [null, null]]);

  // The editor saves every chapter back; chapters that do not mention a schedule keep theirs.
  type Ch = { id: string; title: string; description: string; summary: string; objectives: string[]; difficulty: string | null; status: string; quiz: unknown[]; lessons: Array<Record<string, unknown>> };
  const echo = (view.data.chapters as Ch[]).map((c) => ({
    id: c.id, title: c.title, description: c.description, summary: c.summary, objectives: c.objectives, difficulty: c.difficulty, status: c.status, quiz: c.quiz,
    lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, explanation: l.explanation, examples: l.examples, keyPoints: l.keyPoints, questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes })),
  }));
  const saved = await saveSubject(8, 'math', echo, 'edit');
  assert.equal(saved.status, 200, saved.message);
  assert.deepEqual((await Course.find({ classLevel: 8, subject: 'math' }).sort({ order: 1 }).lean()).map((c) => [c.academicYear, c.month]), [[YEAR, 4], [YEAR, 4], [YEAR, 5], [null, null]]);
});

test('admin: a month without a year, a malformed year or an impossible month is refused, everywhere it can be written', async () => {
  const course = { title: 'Bad Schedule', classLevel: 8, subject: 'math', summary: '', lessons: [] };
  for (const [when, why] of [[{ month: 4 }, 'month without year'], [{ academicYear: '2026-28', month: 4 }, 'year not consecutive'], [{ academicYear: YEAR, month: 13 }, 'month 13'], [{ academicYear: YEAR, month: 0 }, 'month 0'], [{ academicYear: YEAR, month: 4.5 }, 'fractional month']] as const) {
    const res = await call('POST', '/api/admin/content/courses', { ...course, ...when }, admin);
    assert.equal(res.status, 400, `${why}: ${res.status} ${res.message}`);
    const edit = await saveSubject(8, 'english', [chapter('Bad', when as When)], 'edit');
    assert.equal(edit.status, 400, `${why} (chapter editor)`);
  }
  assert.equal(await Course.countDocuments({ title: 'Bad Schedule' }), 0, 'nothing was stored');
  assert.equal((await call('POST', '/api/admin/content/courses', { ...course, academicYear: YEAR }, admin)).status, 201, 'a year alone is fine');
  await Course.deleteOne({ title: 'Bad Schedule' });
});

test('admin: create, edit, move between months and unschedule a course; the same chapter cannot be scheduled twice in one month', async () => {
  const made = await call('POST', '/api/admin/content/courses', { title: 'Shapes', classLevel: 8, subject: 'math', summary: '', lessons: [], academicYear: YEAR, month: 6 }, admin);
  assert.equal(made.status, 201, made.message);
  assert.equal(made.data.academicYear, YEAR);
  assert.equal(made.data.month, 6);
  const id = made.data.id as string;

  const twin = await call('POST', '/api/admin/content/courses', { title: ' shapes ', classLevel: 8, subject: 'math', summary: '', lessons: [], academicYear: YEAR, month: 6 }, admin);
  assert.equal(twin.status, 409, 'same class, subject, year, month and title');
  const elsewhere = await call('POST', '/api/admin/content/courses', { title: 'Shapes', classLevel: 8, subject: 'math', summary: '', lessons: [], academicYear: YEAR, month: 7 }, admin);
  assert.equal(elsewhere.status, 201, 'the same title in another month is a different slot');

  assert.equal((await call('PATCH', `/api/admin/content/courses/${elsewhere.data.id}`, { month: 6 }, admin)).status, 409, 'moving into an occupied slot');
  const moved = await call('PATCH', `/api/admin/content/courses/${id}`, { month: 8 }, admin);
  assert.equal(moved.status, 200, moved.message);
  assert.equal(moved.data.month, 8);
  assert.equal((await call('PATCH', `/api/admin/content/courses/${id}`, { academicYear: null }, admin)).data.month, null, 'clearing the year clears the month');
  assert.equal((await call('PATCH', `/api/admin/content/courses/${id}`, { month: 5 }, admin)).status, 400, 'a month cannot be set on an unscheduled course');
  for (const c of [id, elsewhere.data.id]) await call('DELETE', `/api/admin/content/courses/${c}`, undefined, admin);
});

test('admin: filters by year, month and class/subject, and lists what still needs a schedule', async () => {
  const titles = async (q: string) => ((await call('GET', `/api/admin/content/courses?classLevel=8&limit=100${q}`, undefined, admin)).data as Array<{ title: string }>).map((c) => c.title).sort();
  assert.deepEqual(await titles(`&academicYear=${YEAR}&month=4`), ['Alphabet', 'Counting Games', 'Numbers Around Us']);
  assert.deepEqual(await titles(`&academicYear=${YEAR}&month=5`), ['Addition Fun']);
  assert.deepEqual(await titles(`&academicYear=${YEAR}&month=4&subject=english`), ['Alphabet']);
  assert.deepEqual(await titles(`&academicYear=${YEAR}`), ['Addition Fun', 'Alphabet', 'Counting Games', 'Numbers Around Us']);
  assert.deepEqual(await titles('&schedule=unscheduled'), ['Old Chapter'], 'the course that needs mapping');
  assert.deepEqual(await titles('&academicYear=2027-28'), []);
  assert.equal((await call('GET', '/api/admin/content/courses?academicYear=oops', undefined, admin)).status, 400);
  assert.equal((await call('GET', '/api/admin/content/courses', undefined, kid)).status, 403, 'administrators only');
});

test('admin: bulk scheduling maps existing chapters, all or nothing, and only for administrators', async () => {
  const old = await Course.findOne({ title: 'Old Chapter' }).lean();
  const ids = [String(old!._id)];
  assert.equal((await call('POST', '/api/admin/content/courses/schedule', { ids, academicYear: YEAR, month: 9 }, kid)).status, 403);
  assert.equal((await call('POST', '/api/admin/content/courses/schedule', { ids, academicYear: null, month: 9 }, admin)).status, 400, 'a month needs a year');
  assert.equal((await call('POST', '/api/admin/content/courses/schedule', { ids: ['0'.repeat(24)], academicYear: YEAR, month: 9 }, admin)).status, 404);
  const ok = await call('POST', '/api/admin/content/courses/schedule', { ids, academicYear: YEAR, month: 9 }, admin);
  assert.equal(ok.status, 200, ok.message);
  assert.deepEqual(ok.data, { changed: 1 });
  assert.deepEqual([(await Course.findById(old!._id).lean())!.academicYear, (await Course.findById(old!._id).lean())!.month], [YEAR, 9]);
  const back = await call('POST', '/api/admin/content/courses/schedule', { ids, academicYear: null, month: null }, admin);
  assert.equal(back.status, 200);
  assert.equal((await Course.findById(old!._id).lean())!.academicYear, null, 'unscheduled again');

  // A conflict changes nothing: moving "Alphabet" onto an occupied slot fails and leaves the rest alone.
  const a = await Course.findOne({ title: 'Alphabet' }).lean();
  const dup = await Course.create({ title: 'Alphabet', slug: 'c8-english-alphabet-dup', classLevel: 8, subject: 'english', order: 99, academicYear: YEAR, month: 10 });
  const clash = await call('POST', '/api/admin/content/courses/schedule', { ids: [String(dup._id), String(old!._id)], academicYear: YEAR, month: 4 }, admin);
  assert.equal(clash.status, 409, clash.message);
  assert.equal((await Course.findById(dup._id).lean())!.month, 10, 'nothing moved');
  assert.equal((await Course.findById(old!._id).lean())!.academicYear, null, 'nothing moved');
  await Course.deleteOne({ _id: dup._id });
  assert.ok(a);
});

// ------------------------------------------------------------------------------------ public reading

test('public: the year/month picker lists only months that have published content, and never a draft', async () => {
  const res = await schedule('class-8');
  assert.equal(res.status, 200);
  assert.equal(res.data.currentYear, academicYearOf(new Date()));
  assert.deepEqual(res.data.years.map((y: { academicYear: string }) => y.academicYear), [YEAR]);
  assert.deepEqual(res.data.years[0].months.map((m: { month: number; subjects: number; chapters: number; lessons: number }) => [m.month, m.subjects, m.chapters, m.lessons]), [[4, 2, 3, 6], [5, 1, 1, 3]], 'April and May only, in academic order — no empty June');
  assert.deepEqual(res.data.unscheduled, { subjects: 1, chapters: 1, lessons: 3, minutes: 0 }, 'the unscheduled chapter is still reachable');
  assert.deepEqual(res.data.totals, { subjects: 2, chapters: 5, games: 0 }, 'the whole class, for its headline figures: 5 chapters in 2 subjects');

  // A chapter an administrator adds as a draft is invisible, however it is scheduled.
  await saveSubject(8, 'math', [{ ...chapter('Secret', { academicYear: YEAR, month: 12 }), status: 'draft' }], 'new-version');
  const after = await schedule('class-8');
  assert.deepEqual(after.data.years[0].months.map((m: { month: number }) => m.month), [4, 5], 'a draft opens no month');
  assert.ok(!JSON.stringify(after.data).includes('Secret'));
  await Course.deleteMany({ title: 'Secret' });
  assert.equal((await schedule('class-99')).status, 400);
  assert.equal((await schedule('class-9')).status, 404, 'a class that does not exist');
});

test('public: a month shows exactly its subjects and chapters — filtered by the API, not by the page', async () => {
  const april = (await subjectsIn('class-8', `?academicYear=${YEAR}&month=04`)) as Awaited<ReturnType<typeof subjectsIn>> & Array<{ key: string; chapters: Array<{ title: string }> }>;
  assert.deepEqual(april.map((s) => [s.key, s.chapters.map((c) => c.title)]), [['math', ['Numbers Around Us', 'Counting Games']], ['english', ['Alphabet']]]);
  const may = (await subjectsIn('class-8', `?academicYear=${YEAR}&month=5`)) as Array<{ key: string; chapters: Array<{ title: string }> }>;
  assert.deepEqual(may.map((s) => [s.key, s.chapters.map((c) => c.title)]), [['math', ['Addition Fun']]], 'no empty English card for May');
  assert.deepEqual(await subjectsIn('class-8', `?academicYear=${YEAR}&month=6`), [], 'a month with nothing lists no subjects');
  assert.deepEqual(await subjectsIn('class-8', '?academicYear=2025-26'), [], 'another year has nothing');
  const year = (await subjectsIn('class-8', `?academicYear=${YEAR}`)) as Array<{ key: string; chapters: unknown[] }>;
  assert.deepEqual(year.map((s) => [s.key, s.chapters.length]), [['math', 3], ['english', 1]], 'the whole year');
  const unscheduled = (await subjectsIn('class-8', '?schedule=unscheduled')) as Array<{ key: string; chapters: Array<{ title: string }> }>;
  assert.deepEqual(unscheduled.map((s) => [s.key, s.chapters.map((c) => c.title)]), [['math', ['Old Chapter']]]);
  // Without a schedule everything is shown, exactly as before scheduling existed.
  const all = (await subjectsIn('class-8', '')) as Array<{ key: string; chapters: unknown[] }>;
  assert.deepEqual(all.map((s) => [s.key, s.chapters.length]), [['math', 4], ['english', 1]]);
  // One subject, through a month.
  const one = await call('GET', `/api/content/classes/class-8/subjects/math?academicYear=${YEAR}&month=5`);
  assert.deepEqual(one.data.subject.chapters.map((c: { title: string }) => c.title), ['Addition Fun']);
  assert.equal((await call('GET', `/api/content/classes/class-8/subjects/english?academicYear=${YEAR}&month=5`)).status, 404, 'English has nothing in May');
  // A mistyped filter is an error, never "everything".
  for (const q of ['?month=4', '?academicYear=2026', '?academicYear=2026-27&month=13', `?schedule=unscheduled&academicYear=${YEAR}`, '?schedule=all']) {
    assert.equal((await call('GET', `/api/content/classes/class-8/curriculum${q}`)).status, 400, q);
  }
});

test('public: a chapter\'s previous/next stay inside its own month', async () => {
  const slugs = Object.fromEntries((await Course.find({ classLevel: 8, subject: 'math' }).lean()).map((c) => [c.title, c.slug]));
  const res = await call('GET', `/api/content/classes/class-8/subjects/math/chapters/${slugs['Numbers Around Us']}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.data.chapters.map((c: { title: string }) => c.title), ['Numbers Around Us', 'Counting Games'], 'April only');
  assert.equal(res.data.chapter.academicYear, YEAR);
  assert.equal(res.data.chapter.month, 4);
  const may = await call('GET', `/api/content/classes/class-8/subjects/math/chapters/${slugs['Addition Fun']}`);
  assert.deepEqual(may.data.chapters.map((c: { title: string }) => c.title), ['Addition Fun']);
  // Its direct address works without any query (a refresh, a bookmark, a shared link).
  assert.equal((await call('GET', `/api/content/classes/class-8/subjects/math/chapters/${slugs['Old Chapter']}`)).status, 200);
});

// ------------------------------------------------------------------------------------ learner progress

const where = async (title: string) => {
  const c = (await Course.findOne({ classLevel: 8, title }).lean())!;
  return { class: 'class-8', subject: c.subject!, chapter: c.slug };
};
const report = async (title: string, lessonNo: number, event: 'start' | 'position' | 'complete', extra: Record<string, unknown> = {}, cookie = kid) =>
  call('POST', '/api/progress/lessons', { ...(await where(title)), lesson: lessonNo, event, ...extra }, cookie);

test('progress is saved lesson by lesson in the database, and "Continue" opens the exact next lesson — even on a later visit', async () => {
  assert.equal((await call('GET', '/api/progress/continue')).status, 401, 'signed in only');
  assert.equal((await call('GET', `/api/progress/continue?class=class-8&subject=math&academicYear=${YEAR}&month=4`, undefined, kid)).data.lesson, 1, 'nothing started: the first lesson of the month');

  assert.equal((await report('Numbers Around Us', 1, 'complete', { score: 80 })).status, 200);
  assert.equal((await report('Numbers Around Us', 2, 'complete', { score: 100 })).data.completedLessons, 2);
  // "Browser closed": every later request is a fresh one — the database is all that is left.
  const next = await call('GET', '/api/progress/continue', undefined, kid);
  assert.equal(next.status, 200);
  assert.deepEqual([next.data.chapter.title, next.data.lesson, next.data.lessonTitle, next.data.completedLessons, next.data.lessonCount], ['Numbers Around Us', 3, 'Numbers Around Us 3', 2, 3]);
  assert.deepEqual([next.data.academicYear, next.data.month, next.data.chapter.number], [YEAR, 4, 1]);

  // Opening a lesson over and over never makes a second record.
  for (let i = 0; i < 3; i++) await report('Numbers Around Us', 3, 'start');
  assert.equal(await CourseProgress.countDocuments({ chapterId: (await Course.findOne({ title: 'Numbers Around Us' }).lean())!._id }), 1, 'one record per user and chapter');
  const record = (await CourseProgress.findOne({}).lean())!;
  assert.equal(record.lessons.length, 3, 'one entry per lesson');
});

test('leaving a lesson part-way saves the step, and the lesson resumes there; finishing it clears the step', async () => {
  const saved = await report('Numbers Around Us', 3, 'position', { position: 4 });
  assert.equal(saved.status, 200, saved.message);
  assert.equal(saved.data.position, 4);
  const resume = await call('GET', '/api/progress/continue', undefined, kid);
  assert.deepEqual([resume.data.lesson, resume.data.position], [3, 4], 'resumes lesson 3 at step 4');
  const cls = await call('GET', '/api/progress/classes/class-8', undefined, kid);
  const row = cls.data.chapters.find((c: { chapter: string }) => c.chapter.includes('numbers'));
  assert.deepEqual([row.positions, row.nextLesson, row.completedLessons], [{ '3': 4 }, 3, [1, 2]]);
  // Another learner has none of it.
  assert.equal((await call('GET', '/api/progress/continue', undefined, other)).data, null);
  assert.deepEqual((await call('GET', '/api/progress/classes/class-8', undefined, other)).data.chapters.find((c: { chapter: string }) => c.chapter.includes('numbers')).positions, {});

  const done = await report('Numbers Around Us', 3, 'complete', { score: 60 });
  assert.deepEqual([done.data.completed, done.data.position, done.data.chapterCompleted, done.data.score, done.data.attempts], [true, 0, true, 60, 1]);
  // Replaying and doing worse keeps the best score and counts the attempt.
  const again = await report('Numbers Around Us', 3, 'complete', { score: 20 });
  assert.deepEqual([again.data.score, again.data.attempts], [60, 2]);
  // A step is not remembered for a lesson already finished.
  await report('Numbers Around Us', 3, 'position', { position: 2 });
  assert.equal((await CourseProgress.findOne({}).lean())!.lessons.find((l) => l.position)?.position, undefined, 'no step kept on a finished lesson');
  // Finished: nothing left to continue in that chapter.
  assert.notEqual((await call('GET', '/api/progress/continue', undefined, kid)).data?.chapter?.title, 'Numbers Around Us');
});

test('progress is counted from the lessons: per subject, per month, per year — never stored percentages', async () => {
  await report('Counting Games', 1, 'complete');
  const april = await call('GET', `/api/progress/classes/class-8?academicYear=${YEAR}&month=4`, undefined, kid);
  assert.deepEqual([april.data.lessons, april.data.completed, april.data.percent], [6, 4, 67], 'April: 3 + 2 + 1 lessons, 4 done');
  assert.deepEqual(april.data.subjects.map((s: { subject: string; lessons: number; completed: number; percent: number }) => [s.subject, s.lessons, s.completed, s.percent]), [['math', 5, 4, 80], ['english', 1, 0, 0]]);
  const may = await call('GET', `/api/progress/classes/class-8?academicYear=${YEAR}&month=5`, undefined, kid);
  assert.deepEqual([may.data.lessons, may.data.completed, may.data.percent], [3, 0, 0], 'May is untouched by April');
  const whole = await call('GET', '/api/progress/classes/class-8', undefined, kid);
  assert.deepEqual([whole.data.lessons, whole.data.completed], [12, 4], 'every chapter, scheduled or not: 3 + 2 + 3 + 3 + 1 lessons');
  // The subject's own continue: resumes the subject and month asked for.
  const sub = await call('GET', `/api/progress/continue?class=class-8&subject=math&academicYear=${YEAR}&month=4`, undefined, kid);
  assert.deepEqual([sub.data.chapter.title, sub.data.lesson], ['Counting Games', 2]);
  // A month with every lesson done offers the next unfinished chapter of the subject instead of nothing.
  await report('Counting Games', 2, 'complete');
  const spill = await call('GET', `/api/progress/continue?class=class-8&subject=math&academicYear=${YEAR}&month=5`, undefined, kid);
  assert.deepEqual([spill.data.chapter.title, spill.data.lesson, spill.data.fresh], ['Addition Fun', 1, true]);
  assert.equal((await call('GET', `/api/progress/continue?class=class-8&subject=english&academicYear=${YEAR}&month=5`, undefined, kid)).data, null);
});

test('the dashboard overview comes from the records: this month, the subjects in it, recent chapters and where to continue', async () => {
  const may = await call('GET', `/api/progress/overview?academicYear=${YEAR}&month=5`, undefined, kid);
  assert.equal(may.status, 200, may.message);
  assert.deepEqual([may.data.academicYear, may.data.month, may.data.scope], [YEAR, 5, 'month']);
  assert.deepEqual(may.data.subjects.map((s: { subject: { key: string }; lessons: number; completed: number; percent: number }) => [s.subject.key, s.lessons, s.completed, s.percent]), [['math', 3, 0, 0]]);
  assert.deepEqual([may.data.monthProgress.lessons, may.data.yearProgress.lessons], [3, 9]);
  assert.ok(may.data.recent.length >= 1 && may.data.recent.every((r: { percent: number }) => r.percent >= 0 && r.percent <= 100));
  assert.equal(may.data.continue.chapter.title, 'Addition Fun', 'everything started is finished: the next chapter is offered');
  assert.equal(may.data.continue.fresh, true);
  // A month with nothing scheduled falls back to everything the learner can study, and says so.
  const empty = await call('GET', `/api/progress/overview?academicYear=${YEAR}&month=12`, undefined, kid);
  assert.equal(empty.data.scope, 'all');
  assert.ok(empty.data.subjects.length > 0);
  // Another learner's overview is their own.
  const theirs = await call('GET', `/api/progress/overview?academicYear=${YEAR}&month=4`, undefined, other);
  assert.ok(theirs.data.subjects.every((s: { completed: number }) => s.completed === 0));
  assert.equal(theirs.data.recent.length, 0);
  assert.deepEqual([theirs.data.continue.fresh, theirs.data.continue.completedLessons, theirs.data.continue.lesson], [true, 0, 1], 'nothing started: "Start learning" at the first lesson');
  assert.equal((await call('GET', '/api/progress/overview')).status, 401);
});

// ------------------------------------------------------------------------------------ security

test('security: the learner is the session — no request can name another user, and unpublished chapters cannot be progressed', async () => {
  const kidUser = (await User.findOne({ email: 'kid@example.com' }).lean())!;
  const otherUser = (await User.findOne({ email: 'other@example.com' }).lean())!;
  const before = await CourseProgress.countDocuments({ userId: otherUser._id });
  // A userId in the body is refused outright (strict), and nothing is written for anyone.
  const spoof = await report('Addition Fun', 1, 'complete', { userId: String(otherUser._id) });
  assert.equal(spoof.status, 400);
  assert.equal(await CourseProgress.countDocuments({ userId: otherUser._id }), before);
  assert.equal((await call('GET', `/api/progress/classes/class-8?userId=${otherUser._id}`, undefined, kid)).data.chapters.length, 5, 'a userId in the query is ignored, not obeyed');
  // Every record belongs to the learner whose cookie reported it.
  await report('Addition Fun', 1, 'start', {}, other);
  const owners = await CourseProgress.find({}).lean();
  assert.ok(owners.every((r) => [String(kidUser._id), String(otherUser._id)].includes(String(r.userId))));
  assert.equal((await CourseProgress.findOne({ userId: otherUser._id }).lean())!.lessons.length, 1);
  assert.deepEqual((await call('GET', '/api/progress/classes/class-8', undefined, other)).data.chapters.filter((c: { startedLessons: number[] }) => c.startedLessons.length).map((c: { startedLessons: number[] }) => c.startedLessons), [[1]], 'the other learner sees only their own lesson');
  // Malformed input is refused.
  for (const extra of [{ position: -1 }, { position: 1000 }, { score: 101 }, { score: -1 }, { position: 1.5 }]) {
    assert.equal((await report('Addition Fun', 1, 'position', extra)).status, 400, JSON.stringify(extra));
  }
  assert.equal((await report('Addition Fun', 1, 'start', { position: 3 })).status, 400, 'only a position event carries a position');
  assert.equal((await report('Addition Fun', 9, 'start')).status, 404, 'a lesson the chapter does not have');
  assert.equal((await report('Addition Fun', 99, 'start')).status, 400, 'a lesson number no chapter can have');
  // A chapter that is unpublished cannot be progressed or continued.
  const c = (await Course.findOne({ title: 'Addition Fun' }).lean())!;
  await Course.updateOne({ _id: c._id }, { $set: { isVisible: false } });
  assert.equal((await report('Addition Fun', 1, 'complete')).status, 404);
  assert.ok(!JSON.stringify((await call('GET', `/api/progress/overview?academicYear=${YEAR}&month=5`, undefined, other)).data).includes('Addition Fun'));
  assert.equal((await call('GET', `/api/content/classes/class-8/subjects/math/chapters/${c.slug}`)).status, 404, 'and cannot be read publicly');
  assert.ok(!JSON.stringify(await subjectsIn('class-8', `?academicYear=${YEAR}&month=5`)).includes('Addition Fun'));
  assert.deepEqual((await schedule('class-8')).data.years[0].months.map((m: { month: number }) => m.month), [4], 'and May is gone from the picker');
  await Course.updateOne({ _id: c._id }, { $set: { isVisible: true } });
});

// ------------------------------------------------------------------------------------ statistics

test('admin statistics: learners, started, in progress, completed, average progress and score — per course, for a year and month', async () => {
  const q = (s: string) => call('GET', `/api/admin/content/courses/stats?${s}`, undefined, admin);
  assert.equal((await call('GET', '/api/admin/content/courses/stats', undefined, kid)).status, 403);
  assert.equal((await call('GET', '/api/admin/content/courses/stats')).status, 401);
  await call('POST', '/api/progress/quiz', { ...(await where('Numbers Around Us')), answers: ['Yes'] }, kid);

  const april = await q(`classLevel=8&academicYear=${YEAR}&month=4`);
  assert.equal(april.status, 200, april.message);
  const numbers = april.data.courses.find((c: { title: string }) => c.title === 'Numbers Around Us');
  assert.deepEqual([numbers.started, numbers.completed, numbers.inProgress, numbers.averageProgress, numbers.averageScore, numbers.lessons], [1, 1, 0, 100, 100, 3]);
  const counting = april.data.courses.find((c: { title: string }) => c.title === 'Counting Games');
  assert.deepEqual([counting.started, counting.completed, counting.averageProgress, counting.averageScore], [1, 1, 100, null], 'nobody took its quiz');
  assert.equal(april.data.courses.find((c: { title: string }) => c.title === 'Alphabet').started, 0);
  assert.deepEqual([april.data.totals.courses, april.data.totals.started, april.data.totals.completed], [3, 2, 2]);

  // Addition Fun was only started (by the other learner), so it is in progress, not completed.
  const may = (await q(`classLevel=8&academicYear=${YEAR}&month=5`)).data.courses[0];
  assert.deepEqual([may.title, may.started, may.inProgress, may.completed, may.averageProgress], ['Addition Fun', 1, 1, 0, 0]);
  const old = await q('classLevel=8&schedule=unscheduled');
  assert.deepEqual(old.data.courses.map((c: { title: string }) => c.title), ['Old Chapter']);
  assert.equal(old.data.unscheduled, 1, 'Year/Month needs mapping: 1');
  assert.equal((await q('academicYear=nope')).status, 400);
});
