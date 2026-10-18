/**
 * The AI Course Generator and course editor (Admin → Manage Courses), end to end over the API:
 * generation (template and AI — the real provider code against a local stand-in server, so a
 * malformed reply, invalid content, a timeout or a refusal are all exercised), validation, the
 * draft → publish workflow, duplicate protection, editing one chapter without touching the others,
 * public reading, learner progress, authorization and the safety of existing data.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http, { type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ContentItem } from '../src/models/ContentItem';
import { Course } from '../src/models/Course';
import { CourseProgress } from '../src/models/CourseProgress';
import { KidGameRecord } from '../src/models/KidGameProgress';

const PASSWORD = 'Strong-Passw0rd';
let mongo: MongoMemoryReplSet;
let server: Server;
let baseUrl: string;
let admin: string;
let user: string;
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
  return { status: res.status, data: json?.data, message: json?.message as string | undefined, code: json?.error?.code as string | undefined, details: json?.error?.details, raw: json };
}

// ------------------------------------------------------------------------------------ a stand-in AI provider

/** What the stand-in answers next: a reply body (JSON text, or a function of the request), a stop reason, or a delay. */
let next: { text?: string | ((body: Record<string, unknown>) => string); stop?: string; delayMs?: number; status?: number; errorMessage?: string; thought?: string } = {};
let aiCalls: Array<{ path: string; body: Record<string, unknown>; headers: http.IncomingHttpHeaders }> = [];
let ai: Server;
let aiUrl: string;

function startAi() {
  ai = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', async () => {
      const body = JSON.parse(raw || '{}') as Record<string, unknown>;
      aiCalls.push({ path: req.url ?? '', body, headers: req.headers });
      if (next.delayMs) await new Promise((r) => setTimeout(r, next.delayMs));
      if (next.status) {
        res.writeHead(next.status, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: next.errorMessage ?? 'upstream secret detail sk-should-not-leak' } }));
        return;
      }
      const text = typeof next.text === 'function' ? next.text(body) : (next.text ?? '{}');
      res.writeHead(200, { 'content-type': 'application/json' });
      if (req.url?.includes(':generateContent')) {
        res.end(JSON.stringify(next.stop === 'BLOCKED' ? { promptFeedback: { blockReason: 'SAFETY' } } : { candidates: text === '' ? [] : [{ finishReason: next.stop ?? 'STOP', content: { parts: [...(next.thought ? [{ text: next.thought, thought: true }] : []), { text }] } }] }));
      } else if (req.url?.includes('/chat/completions')) {
        res.end(JSON.stringify({ id: 'x', object: 'chat.completion', choices: [{ index: 0, finish_reason: next.stop ?? 'stop', message: { role: 'assistant', content: text, refusal: null } }] }));
      } else {
        res.end(JSON.stringify({ id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: next.stop ?? 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }));
      }
    });
  });
  return new Promise<void>((resolve) => ai.listen(0, () => ((aiUrl = `http://127.0.0.1:${(ai.address() as AddressInfo).port}`), resolve())));
}

function useAi(provider: 'anthropic' | 'openai' | 'gemini' | null, extra: Record<string, string> = {}) {
  for (const k of ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL', 'AI_BASE_URL', 'AI_TIMEOUT_MS']) delete process.env[k];
  if (!provider) return;
  Object.assign(process.env, { AI_PROVIDER: provider, AI_API_KEY: 'sk-test-secret-key', AI_BASE_URL: aiUrl, AI_TIMEOUT_MS: '3000', ...(provider !== 'anthropic' ? { AI_MODEL: 'test-model' } : {}), ...extra });
}

// ------------------------------------------------------------------------------------ content helpers

const brief = (over: Record<string, unknown> = {}) => ({
  classLevel: 1,
  subject: { key: 'hindi', title: 'Hindi' },
  title: 'Hindi for Class 1',
  description: 'स्वर, व्यंजन और सरल शब्द',
  language: 'hindi',
  level: 'beginner',
  chapters: 3,
  lessonsPerChapter: 2,
  questionsPerLesson: 4,
  prompt: 'Create a Hindi course for Class 1 focused on Swar, Vyanjan, simple words',
  goals: '',
  include: '',
  avoid: '',
  instructions: '',
  ...over,
});
const q = (n: number) => ({ type: 'mcq', prompt: `Question ${n}?`, options: ['A', 'B', 'C'], answer: 'A', difficulty: 'easy', explanation: 'Because A.' });
const lessonJson = (title: string, questions: number) => ({ title, explanation: `About ${title}.`, examples: ['Example one'], keyPoints: ['Point one'], questions: Array.from({ length: questions }, (_, i) => q(i + 1)), practice: [q(99)], estimatedMinutes: 10 });
const chapterJson = (title: string, lessons: number, questions: number) => ({
  title,
  description: `About ${title}`,
  summary: `We learned about ${title}.`,
  objectives: ['Learn it'],
  difficulty: 'easy',
  lessons: Array.from({ length: lessons }, (_, i) => lessonJson(`${title} lesson ${i + 1}`, questions)),
  quiz: [q(1), q(2), q(3)].map((x, i) => ({ ...x, prompt: `Quiz ${i + 1}?` })),
});
const outlineJson = (chapters: number, lessons: number, over: Record<string, unknown> = {}) => ({
  classLevel: 1,
  subject: 'Hindi',
  ...over,
  title: 'AI Hindi',
  description: 'A course.',
  objectives: ['Read letters'],
  chapters: Array.from({ length: chapters }, (_, i) => ({ title: `Chapter ${i + 1}`, description: `Part ${i + 1}`, lessonTitles: Array.from({ length: lessons }, (_, j) => `Lesson ${j + 1}`) })),
});

/** Generates a whole course with the template engine, as the generator page does (outline, then each chapter). */
async function generate(b = brief()) {
  const outline = await call('POST', '/api/admin/courses/generate/outline', { brief: b, engine: 'template' }, admin);
  assert.equal(outline.status, 200, outline.message);
  const chapters = [];
  for (let i = 0; i < outline.data.outline.chapters.length; i++) {
    const res = await call('POST', '/api/admin/courses/generate/chapter', { brief: b, engine: 'template', outline: outline.data.outline, index: i }, admin);
    assert.equal(res.status, 200, res.message);
    chapters.push(res.data.chapter);
  }
  return { outline: outline.data.outline, chapters, by: outline.data.by };
}
/** A generated chapter as the editor saves it. */
const toSave = (c: { title: string; description: string; objectives: string[]; difficulty: string; lessons: Array<Record<string, unknown>>; quiz: unknown[] }, status = 'draft') => ({
  title: c.title,
  description: c.description,
  objectives: c.objectives,
  difficulty: c.difficulty,
  status,
  lessons: c.lessons.map((l) => ({ title: l.title, explanation: l.explanation, examples: l.examples, keyPoints: l.keyPoints, questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes })),
  quiz: c.quiz,
});

before(async () => {
  // A replica set, like Atlas: course saves run in transactions here.
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  await Promise.all([ContentItem.init(), Course.init(), CourseProgress.init()]);
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  admin = await signIn('root@example.com', 'admin');
  user = await signIn('kid@example.com', 'user');
  other = await signIn('kid2@example.com', 'user');
  await startAi();
});
beforeEach(() => {
  useAi(null);
  next = {};
  aiCalls = [];
});
after(async () => {
  useAi(null);
  await new Promise((resolve) => ai.close(resolve));
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

// ------------------------------------------------------------------------------------ tests

test('only administrators generate, save, publish or unpublish courses (401 signed out, 403 for users)', async () => {
  const attempts: Array<[string, string, unknown?]> = [
    ['GET', '/api/admin/courses/engine'],
    ['POST', '/api/admin/courses/generate/outline', { brief: brief(), engine: 'template' }],
    ['POST', '/api/admin/courses/generate/chapter', { brief: brief(), engine: 'template', outline: outlineJson(1, 2), index: 0 }],
    ['GET', '/api/admin/courses/1/hindi'],
    ['PUT', '/api/admin/courses/1/hindi', { mode: 'new', course: { title: 'x' }, chapters: [] }],
    ['POST', '/api/admin/courses/1/hindi/publish'],
    ['POST', '/api/admin/courses/1/hindi/unpublish'],
  ];
  for (const [method, path, body] of attempts) {
    assert.equal((await call(method, path, body)).status, 401, `${method} ${path} signed out`);
    assert.equal((await call(method, path, body, user)).status, 403, `${method} ${path} as a user`);
  }
  assert.equal(await Course.countDocuments({}), 0, 'nothing was created');
});

test('without an AI provider: the template engine answers (labelled as template), and asking for AI is a clear 503', async () => {
  const engine = await call('GET', '/api/admin/courses/engine', undefined, admin);
  assert.equal(engine.data.ai.ready, false);
  assert.equal(engine.data.defaultEngine, 'template');
  assert.match(engine.data.ai.problem, /No AI provider/);
  const { chapters, by } = await generate();
  assert.deepEqual(by, { kind: 'template', provider: null, model: null }, 'never claimed as AI');
  assert.equal(chapters.length, 3);
  const res = await call('POST', '/api/admin/courses/generate/outline', { brief: brief(), engine: 'ai' }, admin);
  assert.equal(res.status, 503);
  assert.equal(res.code, 'AI_NOT_CONFIGURED');
});

test('template content is real and class-appropriate: Class 1 Hindi in Devanagari with checked answers; Class 1 vs Class 5 maths differ', async () => {
  const { outline, chapters } = await generate();
  assert.equal(outline.chapters[0].title, 'स्वर', 'the requested topics first');
  const lesson = chapters[0].lessons[0];
  assert.match(lesson.explanation, /स्वर/);
  assert.ok(lesson.questions.length === 4 && lesson.questions.every((x: { answer: string }) => x.answer));
  for (const c of chapters)
    for (const l of c.lessons)
      for (const x of [...l.questions, ...l.practice]) if (x.type === 'mcq' || x.type === 'match') assert.ok(x.options.includes(x.answer), `${x.prompt}: answer among options`);
  // Maths: bigger numbers and longer lessons for Class 5.
  const maths = async (classLevel: number) =>
    (await generate(brief({ classLevel, subject: { key: 'math', title: 'Mathematics' }, title: 'Maths', language: 'english', prompt: 'addition', chapters: 2 }))).chapters;
  const big = (cs: Array<{ lessons: Array<{ questions: Array<{ prompt: string }> }> }>) => Math.max(...cs.flatMap((c) => c.lessons.flatMap((l) => l.questions.flatMap((x) => (x.prompt.match(/\d+/g) ?? []).map(Number)))));
  assert.ok(big(await maths(5)) > big(await maths(1)), 'Class 5 numbers are bigger than Class 1');
});

test('AI (Anthropic, through the SDK): a valid reply is validated and labelled; the key goes in a header and never back to the browser', async () => {
  useAi('anthropic');
  next = { text: (body) => JSON.stringify(String((body.messages as Array<{ content: string }>)[0]!.content).includes('Plan the course') ? outlineJson(2, 2) : chapterJson('Chapter 1', 2, 4)) };
  const outline = await call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 2 }), engine: 'ai' }, admin);
  assert.equal(outline.status, 200, outline.message);
  assert.deepEqual(outline.data.by, { kind: 'ai', provider: 'anthropic', model: 'claude-opus-5-5' });
  const chapter = await call('POST', '/api/admin/courses/generate/chapter', { brief: brief({ chapters: 2 }), engine: 'ai', outline: outline.data.outline, index: 0 }, admin);
  assert.equal(chapter.status, 200, chapter.message);
  assert.equal(chapter.data.chapter.lessons.length, 2);
  // What was sent: the class level and the request, the model, structured output; the key only as a header.
  const sent = aiCalls[0]!;
  assert.equal(sent.headers['x-api-key'], 'sk-test-secret-key');
  assert.equal(sent.body.model, 'claude-opus-5-5');
  assert.match(String(sent.body.system), /Class 1/);
  assert.ok((sent.body.output_config as { format?: unknown })?.format, 'structured output requested');
  assert.ok(!JSON.stringify(outline.raw).includes('sk-test-secret-key') && !JSON.stringify(chapter.raw).includes('sk-test-secret-key'));
  const engine = await call('GET', '/api/admin/courses/engine', undefined, admin);
  assert.ok(!JSON.stringify(engine.raw).includes('sk-test-secret-key'));
});

test('AI failures are clear errors and nothing is used: malformed, invalid (after one retry), refusal, cut-off, timeout, upstream', async () => {
  useAi('anthropic');
  const ask = () => call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 2 }), engine: 'ai' }, admin);

  next = { text: 'Sure! Here is your course: ...' };
  let res = await ask();
  assert.deepEqual([res.status, res.code], [502, 'AI_MALFORMED']);

  aiCalls = [];
  next = { text: JSON.stringify(outlineJson(5, 2)) }; // 5 chapters when 2 were asked for
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_INVALID']);
  assert.equal(aiCalls.length, 2, 'asked once more before giving up');
  assert.match(String((aiCalls[1]!.body.messages as Array<{ content: string }>)[0]!.content), /previous answer was rejected/);
  assert.ok(res.details.some((d: { message: string }) => /expected 2 chapters/.test(d.message)));

  next = { text: '{}', stop: 'refusal' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_REFUSED']);

  next = { text: '{"title":', stop: 'max_tokens' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_TRUNCATED']);

  useAi('anthropic', { AI_TIMEOUT_MS: '1000' });
  next = { text: JSON.stringify(outlineJson(2, 2)), delayMs: 4000 };
  res = await ask();
  assert.deepEqual([res.status, res.code], [504, 'AI_TIMEOUT']);

  useAi('anthropic');
  next = { status: 500 };
  res = await ask();
  assert.equal(res.code, 'AI_UPSTREAM');
  assert.ok(!JSON.stringify(res.raw).includes('sk-should-not-leak') && !JSON.stringify(res.raw).includes('sk-test-secret-key'), 'no upstream detail or key in the reply');
  assert.equal(await Course.countDocuments({}), 0, 'nothing was saved by any of it');
});

test('AI (OpenAI, over REST) works through the same interface; AI_MODEL is required for it', async () => {
  useAi('openai', { AI_MODEL: '' });
  assert.equal((await call('GET', '/api/admin/courses/engine', undefined, admin)).data.ai.ready, false);
  useAi('openai');
  next = { text: JSON.stringify(outlineJson(2, 2)) };
  const res = await call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 2 }), engine: 'ai' }, admin);
  assert.equal(res.status, 200, res.message);
  assert.deepEqual(res.data.by, { kind: 'ai', provider: 'openai', model: 'test-model' });
  assert.equal(aiCalls[0]!.headers.authorization, 'Bearer sk-test-secret-key');
});

test('invalid requests are refused before any generation: counts out of range, unknown fields', async () => {
  for (const bad of [{ chapters: 0 }, { chapters: 13 }, { lessonsPerChapter: 9 }, { questionsPerLesson: 16 }, { classLevel: 13 }, { language: 'french' }, { surprise: true }]) {
    const res = await call('POST', '/api/admin/courses/generate/outline', { brief: brief(bad), engine: 'template' }, admin);
    assert.equal(res.status, 400, JSON.stringify(bad));
  }
});

test('the workflow: generate → save draft (not public) → publish (public); a duplicate first course is refused', async () => {
  const { outline, chapters, by } = await generate();
  const save = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'new', course: { title: outline.title, description: outline.description, objectives: outline.objectives, language: 'hindi', level: 'beginner' }, chapters: chapters.map((c) => toSave(c)), source: by }, admin);
  assert.equal(save.status, 201, save.message);
  assert.equal(save.data.counts.drafts, 3);
  assert.deepEqual(save.data.course.source.kind, 'template');
  // A draft is admin-only.
  assert.deepEqual((await call('GET', '/api/content/classes/class-1/subjects/hindi')).data.subject.chapters, []);
  assert.equal((await call('GET', `/api/content/classes/class-1/subjects/hindi/chapters/${save.data.chapters[0].slug}`)).status, 404);
  // A second "first" course for Class 1 Hindi: refused, with the existing course untouched.
  const dup = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'new', course: { title: 'Again' }, chapters: [toSave(chapters[0])] }, admin);
  assert.deepEqual([dup.status, dup.code], [409, 'COURSE_EXISTS']);
  assert.match(dup.message!, /A Hindi course already exists for Class 1/);
  // Publish.
  const pub = await call('POST', '/api/admin/courses/1/hindi/publish', undefined, admin);
  assert.equal(pub.status, 200, pub.message);
  const subject = (await call('GET', '/api/content/classes/class-1/subjects/hindi')).data.subject;
  assert.deepEqual(subject.chapters.map((c: { title: string }) => c.title), chapters.map((c) => c.title));
  assert.equal(subject.chapters[0].lessonCount, 2);
  assert.ok(!('questions' in subject.chapters[0]), 'subject pages stay light: no lesson content');
});

test('public chapter: lessons with questions and answers to study; the quiz without answers; wrong class or subject 404', async () => {
  const slug = (await Course.findOne({ classLevel: 1, subject: 'hindi', archivedAt: null }).sort({ order: 1 }))!.slug;
  const res = await call('GET', `/api/content/classes/class-1/subjects/hindi/chapters/${slug}`);
  assert.equal(res.status, 200, res.message);
  const ch = res.data.chapter;
  assert.ok(ch.lessons[0].questions.every((x: { answer: string }) => x.answer), 'lesson questions come with their answers');
  assert.ok(ch.quiz.length && ch.quiz.every((x: Record<string, unknown>) => !('answer' in x)), 'the quiz never does');
  assert.ok(!/"_?id"|createdBy|"draft"|"source"/.test(JSON.stringify(res.data)), 'no ids or admin fields');
  assert.equal((await call('GET', `/api/content/classes/class-2/subjects/hindi/chapters/${slug}`)).status, 404);
  assert.equal((await call('GET', `/api/content/classes/class-1/subjects/english/chapters/${slug}`)).status, 404);
});

test('editing: regenerate one chapter in place — the others are untouched; a removed chapter is archived, never deleted', async () => {
  const before = (await call('GET', '/api/admin/courses/1/hindi', undefined, admin)).data;
  const [c1, c2, c3] = before.chapters;
  const snapshot = async (id: string) => JSON.stringify((await Course.findById(id).lean())!.lessons);
  const [s1, s3] = [await snapshot(c1.id), await snapshot(c3.id)];
  // Regenerate chapter 2 only (as the editor's "Regenerate chapter" does), keeping its id.
  const regen = await call('POST', '/api/admin/courses/generate/chapter', { brief: brief(), engine: 'template', outline: { title: 'x', description: '', objectives: [], chapters: before.chapters.map((c: { title: string; description: string; lessons: unknown[] }) => ({ title: c.title, description: c.description, lessonTitles: c.lessons.map((_, i) => `L${i + 1}`) })) }, index: 1, seed: 'v2' }, admin);
  assert.equal(regen.status, 200, regen.message);
  const keep = (c: Record<string, unknown> & { lessons: Array<Record<string, unknown>> }) => ({ id: c.id, ...toSave(c as never, c.status as string), lessons: c.lessons.map((l) => ({ id: l.id, title: l.title, explanation: l.explanation, examples: l.examples, keyPoints: l.keyPoints, questions: l.questions, practice: l.practice, estimatedMinutes: l.estimatedMinutes })) });
  const edited = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'edit', course: { title: before.course.title, description: before.course.description }, chapters: [keep(c1), { id: c2.id, ...toSave(regen.data.chapter, 'published') }, keep(c3)] }, admin);
  assert.equal(edited.status, 200, edited.message);
  assert.equal(await snapshot(c1.id), s1, 'chapter 1 unchanged');
  assert.equal(await snapshot(c3.id), s3, 'chapter 3 unchanged');
  assert.notEqual(await snapshot(c2.id), JSON.stringify(c2.lessons), 'chapter 2 replaced');
  // Lesson ids survive an edit that keeps them (progress is recorded against them).
  assert.deepEqual(edited.data.chapters[0].lessons.map((l: { id: string }) => l.id), c1.lessons.map((l: { id: string }) => l.id));
  // Leaving chapter 3 out archives it.
  const dropped = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'edit', course: { title: before.course.title }, chapters: [keep(edited.data.chapters[0]), keep(edited.data.chapters[1])] }, admin);
  assert.equal(dropped.status, 200, dropped.message);
  assert.ok((await Course.findById(c3.id))!.archivedAt, 'archived, not deleted');
  // An edit can't claim another course's chapter.
  const stranger = await Course.create({ title: 'Other', slug: 'other-ch', classLevel: 2, subject: 'math', order: 1, lessons: [] });
  const res = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'edit', course: { title: 'x' }, chapters: [{ id: String(stranger._id), ...toSave(chapters0()) }] }, admin);
  assert.equal(res.status, 400);
});
const chapters0 = () => ({ title: 'X', description: '', objectives: [], difficulty: 'easy', lessons: [], quiz: [] });

test('a new version: drafts beside the published course; publishing archives the earlier generated chapters, keeps hand-written ones', async () => {
  const handWritten = await call('POST', '/api/admin/content/courses', { title: 'हमारा बगीचा', classLevel: 1, subject: 'hindi', lessons: [{ title: 'Garden' }] }, admin);
  assert.equal(handWritten.status, 201, handWritten.message);
  const live = async () => (await call('GET', '/api/content/classes/class-1/subjects/hindi')).data.subject.chapters.map((c: { title: string }) => c.title);
  const was = await live();
  const { chapters } = await generate(brief({ chapters: 2, prompt: 'मात्राएँ' }));
  const v2 = await call('PUT', '/api/admin/courses/1/hindi', { mode: 'new-version', course: { title: 'Hindi v2' }, chapters: chapters.map((c) => toSave(c)), source: { kind: 'template' } }, admin);
  assert.equal(v2.status, 201, v2.message);
  assert.deepEqual(await live(), was, 'learners see no change before publishing');
  await call('POST', '/api/admin/courses/1/hindi/publish', undefined, admin);
  const now = await live();
  assert.ok(chapters.every((c) => now.includes(c.title)) && now.includes('हमारा बगीचा'));
  assert.ok(await Course.exists({ classLevel: 1, subject: 'hindi', generated: true, archivedAt: { $ne: null } }), 'earlier generated chapters archived');
});

test('unpublish hides the subject in the class everywhere publicly; publish brings it back', async () => {
  await call('POST', '/api/admin/courses/1/hindi/unpublish', undefined, admin);
  assert.equal((await call('GET', '/api/content/classes/class-1/subjects/hindi')).status, 404);
  assert.ok(!((await call('GET', '/api/content/classes/class-1/curriculum')).data.subjects as Array<{ key: string }>).some((s) => s.key === 'hindi'));
  assert.equal((await call('GET', '/api/admin/courses/1/hindi', undefined, admin)).data.isVisible, false, 'still there for administrators');
  await call('POST', '/api/admin/courses/1/hindi/publish', undefined, admin);
  assert.equal((await call('GET', '/api/content/classes/class-1/subjects/hindi')).status, 200);
});

test('saved questions must make sense: an mcq answer not among its options is refused', async () => {
  const bad = { ...chapters0(), status: 'draft', quiz: [{ type: 'mcq', prompt: 'Which?', options: ['A', 'B'], answer: 'C', difficulty: 'easy', explanation: '' }] };
  const res = await call('PUT', '/api/admin/courses/2/hindi', { mode: 'new', course: { title: 'x' }, chapters: [bad] }, admin);
  assert.equal(res.status, 400);
  assert.equal(await Course.countDocuments({ classLevel: 2, subject: 'hindi' }), 0);
});

test('a course for a new class and a new subject (Class 7 → Science) works without code changes', async () => {
  assert.equal((await call('POST', '/api/admin/classes', { classLevel: 7, title: 'Class 7', description: 'Explorers', subjects: [] }, admin)).status, 201);
  const { chapters } = await generate(brief({ classLevel: 7, subject: { key: 'science', title: 'Science' }, title: 'Science 7', language: 'english', prompt: '' }));
  const save = await call('PUT', '/api/admin/courses/7/science', { mode: 'new', subjectTitle: 'Science', course: { title: 'Science 7' }, chapters: chapters.map((c) => toSave(c)), source: { kind: 'template' }, publish: true }, admin);
  assert.equal(save.status, 201, save.message);
  const subject = await call('GET', '/api/content/classes/class-7/subjects/science');
  assert.equal(subject.status, 200, subject.message);
  assert.equal(subject.data.subject.chapters.length, 3);
});

test('progress: lessons started and completed, quiz marked on the server, class percentage; each learner sees only their own', async () => {
  const ch = (await call('GET', '/api/content/classes/class-7/subjects/science')).data.subject.chapters[0];
  const where = { class: 'class-7', subject: 'science', chapter: ch.slug };
  assert.equal((await call('POST', '/api/progress/lessons', { ...where, lesson: 1, event: 'start' })).status, 401, 'signed-in only');
  assert.equal((await call('POST', '/api/progress/lessons', { ...where, lesson: 1, event: 'complete' }, user)).status, 200);
  const done = await call('POST', '/api/progress/lessons', { ...where, lesson: 2, event: 'complete' }, user);
  assert.equal(done.data.chapterCompleted, true);
  assert.equal((await call('POST', '/api/progress/lessons', { ...where, lesson: 9, event: 'start' }, user)).status, 404);
  const full = (await call('GET', `/api/content/classes/class-7/subjects/science/chapters/${ch.slug}`)).data.chapter;
  const right = (await Course.findOne({ slug: ch.slug }))!.quiz.map((x) => x.answer);
  const quiz = await call('POST', '/api/progress/quiz', { ...where, answers: right.map((a, i) => (i === 0 ? 'wrong' : ` ${a.toUpperCase()}.`)) }, user);
  assert.equal(quiz.status, 200, quiz.message);
  assert.equal(quiz.data.correct, full.quiz.length - 1, 'case, spaces and a final full stop do not matter');
  assert.equal(quiz.data.results[0].correct, false);
  const mine = await call('GET', '/api/progress/classes/class-7', undefined, user);
  assert.ok(mine.data.percent > 0);
  assert.deepEqual(mine.data.chapters.find((c: { chapter: string }) => c.chapter === ch.slug).completedLessons, [1, 2]);
  const theirs = await call('GET', '/api/progress/classes/class-7', undefined, other);
  assert.equal(theirs.data.percent, 0);
  const all = await call('GET', '/api/progress/classes', undefined, user);
  assert.ok(all.data.some((c: { slug: string; completed: number }) => c.slug === 'class-7' && c.completed === 2));
  // A hidden subject's chapters can't be recorded against.
  await call('POST', '/api/admin/courses/7/science/unpublish', undefined, admin);
  assert.equal((await call('POST', '/api/progress/lessons', { ...where, lesson: 1, event: 'start' }, user)).status, 404);
  await call('POST', '/api/admin/courses/7/science/publish', undefined, admin);
});

test('progress: simultaneous reports (refresh, two tabs) never fail — one entry per lesson, every quiz attempt counted', async () => {
  const ch = (await call('GET', '/api/content/classes/class-7/subjects/science')).data.subject.chapters[0];
  const where = { class: 'class-7', subject: 'science', chapter: ch.slug };
  // A learner with no record yet: the first reports also race to create it.
  const starts = await Promise.all(Array.from({ length: 6 }, () => call('POST', '/api/progress/lessons', { ...where, lesson: 1, event: 'start' }, other)));
  assert.deepEqual(starts.map((r) => r.status), [200, 200, 200, 200, 200, 200]);
  const mixed = await Promise.all([1, 1, 2, 2].map((lesson, i) => call('POST', '/api/progress/lessons', { ...where, lesson, event: i % 2 ? 'complete' : 'start' }, other)));
  assert.ok(mixed.every((r) => r.status === 200), JSON.stringify(mixed.map((r) => r.status)));
  const record = (await CourseProgress.findOne({ chapterId: (await Course.findOne({ slug: ch.slug }))!._id, userId: (await User.findOne({ email: 'kid2@example.com' }))!._id }).lean())!;
  assert.equal(record.lessons.length, 2, 'one entry per lesson');
  assert.ok(record.lessons.every((l) => l.completedAt), 'both completed');
  const quiz = (await Course.findOne({ slug: ch.slug }))!.quiz;
  const subs = await Promise.all([0, 1, 2].map(() => call('POST', '/api/progress/quiz', { ...where, answers: quiz.map((q) => q.answer) }, other)));
  assert.ok(subs.every((r) => r.status === 200), JSON.stringify(subs.map((r) => r.message)));
  const after = (await CourseProgress.findById(record._id).lean())!;
  assert.deepEqual([after.quiz!.attempts, after.quiz!.best], [3, 100]);
});

test('data safety: Classes 1–5 and their links stay; Kid Games progress is untouched by courses', async () => {
  const classes = await ContentItem.find({ type: 'class', archivedAt: null }).sort({ classLevel: 1 });
  assert.deepEqual(classes.map((c) => c.classLevel), [1, 2, 3, 4, 5, 7]);
  for (const level of [1, 2, 3, 4, 5]) assert.equal(await ContentItem.countDocuments({ type: 'class_subject', classLevel: level, archivedAt: null, subject: { $in: ['hindi', 'english', 'math'] } }), 3, `Class ${level} keeps its subjects`);
  assert.equal(await ContentItem.countDocuments({ type: 'kid_game', archivedAt: null }) > 0, true);
  assert.equal(await KidGameRecord.countDocuments({}), 0, 'courses never write Kid Games progress');
});

test('duplicate makes a draft under the next free number with everything copied; numbers stay unique', async () => {
  const dup = await call('POST', '/api/admin/classes/7/duplicate', {}, admin);
  assert.equal(dup.status, 201, dup.message);
  assert.equal(dup.data.classLevel, 8);
  assert.equal(dup.data.status, 'draft');
  assert.equal(dup.data.counts.chapters, await Course.countDocuments({ classLevel: 7, archivedAt: null, draft: { $ne: true } }));
  assert.equal((await call('GET', '/api/content/classes/class-8/curriculum')).status, 404, 'a duplicate is never published automatically');
  assert.equal((await call('POST', '/api/admin/classes/7/duplicate', { classLevel: 8 }, admin)).status, 409);
});

test('validation refuses placeholder text, unsafe words and content written for another class or subject', async () => {
  useAi('anthropic');
  const ask = () => call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 2 }), engine: 'ai' }, admin);
  const cases: Array<[unknown, RegExp]> = [
    [outlineJson(2, 2, { classLevel: 5 }), /not Class 1/],
    [outlineJson(2, 2, { subject: 'Science' }), /not "Hindi"/],
    [{ ...outlineJson(2, 2), description: 'Content will be added later' }, /placeholder/],
    [{ ...outlineJson(2, 2), title: 'Lorem ipsum course' }, /placeholder/],
    [{ ...outlineJson(2, 2), objectives: ['Learn about beer'] }, /not suitable/],
  ];
  for (const [bad, why] of cases) {
    next = { text: JSON.stringify(bad) };
    const res = await ask();
    assert.deepEqual([res.status, res.code], [422, 'AI_INVALID'], JSON.stringify(bad).slice(0, 60));
    assert.ok(res.details.some((d: { message: string }) => why.test(d.message)), `${why}: ${JSON.stringify(res.details)}`);
  }
  // A chapter whose lesson says "Coming soon" is refused too.
  next = { text: JSON.stringify({ ...chapterJson('Chapter 1', 2, 4), lessons: [lessonJson('L1', 4), { ...lessonJson('L2', 4), explanation: 'Coming soon' }] }) };
  const ch = await call('POST', '/api/admin/courses/generate/chapter', { brief: brief({ chapters: 2 }), engine: 'ai', outline: outlineJson(2, 2), index: 0 }, admin);
  assert.deepEqual([ch.status, ch.code], [422, 'AI_INVALID']);
});

test('AI (Gemini, over REST): valid reply works; safety stop, blocked prompt, cut-off, empty reply and rate limit are clear errors', async () => {
  useAi('gemini');
  const ask = () => call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 2 }), engine: 'ai' }, admin);
  next = { text: JSON.stringify(outlineJson(2, 2)) };
  let res = await ask();
  assert.equal(res.status, 200, res.message);
  assert.deepEqual(res.data.by, { kind: 'ai', provider: 'gemini', model: 'test-model' });
  assert.equal(aiCalls.at(-1)!.headers['x-goog-api-key'], 'sk-test-secret-key', 'the key goes in a header');
  assert.ok(!aiCalls.at(-1)!.path.includes('sk-test'), 'never in the URL');
  assert.equal((aiCalls.at(-1)!.body.generationConfig as { responseMimeType: string }).responseMimeType, 'application/json');
  next = { text: '{}', stop: 'SAFETY' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_REFUSED']);
  next = { text: '{}', stop: 'BLOCKED' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_REFUSED']);
  next = { text: '{"title":', stop: 'MAX_TOKENS' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [422, 'AI_TRUNCATED']);
  next = { text: '' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [502, 'AI_MALFORMED']);
  assert.match(res.message!, /empty/);
  next = { status: 429 };
  res = await ask();
  assert.deepEqual([res.status, res.code], [429, 'AI_RATE_LIMITED']);
});

test('Gemini: a retired model is a clear error naming the reason (key redacted), nothing is saved and no template is used; thought parts are ignored', async () => {
  useAi('gemini');
  const before = await Course.countDocuments();
  next = { status: 404, errorMessage: 'This model models/test-model is no longer available to new users. Please update your code to use models/newer-model. (key sk-test-secret-key)' };
  let res = await call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 1 }), engine: 'ai' }, admin);
  assert.deepEqual([res.status, res.code], [502, 'AI_UPSTREAM']);
  assert.match(res.message!, /\(404\): This model models\/test-model is no longer available to new users/);
  assert.ok(!JSON.stringify(res.raw).includes('sk-test-secret-key'), 'the key is redacted from the provider message');
  assert.ok(!res.data, 'no outline — not even a template one');
  assert.equal(await Course.countDocuments(), before, 'nothing saved');
  // Thinking models (Gemini 3.x) may send thought parts before the answer: only the answer is read.
  next = { text: JSON.stringify(outlineJson(1, 2)), thought: 'Planning the course… {"not":"json"' };
  res = await call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 1 }), engine: 'ai' }, admin);
  assert.equal(res.status, 200, res.message);
  assert.equal(res.data.by.kind, 'ai');
});

test('Gemini: one unparseable reply is retried once and the second answer is used; JSON wrapped in prose is read; two bad replies are a clear error', async () => {
  useAi('gemini');
  const ask = () => call('POST', '/api/admin/courses/generate/outline', { brief: brief({ chapters: 1 }), engine: 'ai' }, admin);
  const good = JSON.stringify(outlineJson(1, 2));
  aiCalls = [];
  let n = 0;
  next = { text: () => (n++ === 0 ? '{"title": "अधूरा", "chapters": [' : good) };
  let res = await ask();
  assert.equal(res.status, 200, res.message);
  assert.equal(aiCalls.length, 2, 'asked once more');
  const retryText = JSON.stringify(aiCalls[1]!.body.contents);
  assert.match(retryText, /not valid JSON/);
  assert.equal(res.data.by.kind, 'ai', 'still AI — never the template');

  aiCalls = [];
  next = { text: `Here is the course:\n${good}\nHope this helps!` };
  res = await ask();
  assert.equal(res.status, 200, res.message);
  assert.equal(aiCalls.length, 1, 'no retry needed');

  next = { text: 'not json at all' };
  res = await ask();
  assert.deepEqual([res.status, res.code], [502, 'AI_MALFORMED']);
  assert.ok(!res.data, 'nothing generated, no template stand-in');
});

test('a database failure part-way through a save leaves the course exactly as it was (transaction)', async () => {
  const before = await Course.countDocuments({ classLevel: 3, subject: 'hindi' });
  const linkBefore = (await ContentItem.findOne({ type: 'class_subject', classLevel: 3, subject: 'hindi' }).lean())!;
  const { chapters } = await generate(brief({ classLevel: 3, chapters: 3 }));
  const original = Course.create.bind(Course);
  let calls = 0;
  (Course as unknown as { create: unknown }).create = async (...args: unknown[]) => {
    if (++calls === 2) throw new Error('simulated database failure');
    return (original as (...a: unknown[]) => unknown)(...args);
  };
  try {
    const res = await call('PUT', '/api/admin/courses/3/hindi', { mode: 'new', course: { title: 'Hindi 3', description: 'changed' }, chapters: chapters.map((c) => toSave(c)), source: { kind: 'template' } }, admin);
    // A server fault (in production its details are never sent — see errorHandler.ts).
    assert.equal(res.status, 500);
  } finally {
    (Course as unknown as { create: unknown }).create = original;
  }
  assert.equal(await Course.countDocuments({ classLevel: 3, subject: 'hindi' }), before, 'no chapter from the failed save remains');
  const linkAfter = (await ContentItem.findOne({ type: 'class_subject', classLevel: 3, subject: 'hindi' }).lean())!;
  assert.deepEqual([linkAfter.description, linkAfter.course ?? null], [linkBefore.description, linkBefore.course ?? null], 'the course details are unchanged');
  // And the same save succeeds once the database is back.
  const ok = await call('PUT', '/api/admin/courses/3/hindi', { mode: 'new', course: { title: 'Hindi 3' }, chapters: chapters.map((c) => toSave(c)), source: { kind: 'template' } }, admin);
  assert.equal(ok.status, 201, ok.message);
});

test('the dashboard reads the same published chapters (courses API): drafts and hidden subjects never appear', async () => {
  const list = async (q: string) => ((await call('GET', `/api/content/courses?${q}`, undefined, user)).data as Array<{ slug: string; title: string }>).map((c) => c.title);
  assert.deepEqual(await list('classLevel=3&subject=hindi'), [], 'Class 3 Hindi is still a draft');
  await call('POST', '/api/admin/courses/3/hindi/publish', undefined, admin);
  const live = await list('classLevel=3&subject=hindi');
  assert.equal(live.length, 3);
  const pub = (await call('GET', '/api/content/classes/class-3/subjects/hindi')).data.subject.chapters.map((c: { title: string }) => c.title);
  assert.deepEqual(live, pub, 'dashboard and public pages list the same chapters');
  await call('POST', '/api/admin/courses/3/hindi/unpublish', undefined, admin);
  assert.deepEqual(await list('classLevel=3&subject=hindi'), [], 'a hidden subject leaves the dashboard too');
  await call('POST', '/api/admin/courses/3/hindi/publish', undefined, admin);
});
